import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const USAGE = { input_tokens: 10, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 20_000, model: 'model' }
const READ_ROW = { tool_use_id: 'call-1', tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }

describe('register', () => {
  test('/turn-cost steps, totals and off redraw the lines already drawn', async ($, on) => {
    mock.store(on, {})
    mock.clock(on)
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'session-1' }))
    on('session.cwd', () => ({ value: '/work' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.log', () => ({ value: undefined }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    on('turn.step', async function* ($, e) {
      yield { kind: 'tool', index: 0, id: 'call-1', name: 'Read' }
      yield { kind: 'input', index: 0, json: '{"file_path":"/work/a.dart"}' }
      yield { kind: 'stop', stopReason: 'tool_use', usage: USAGE }
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{ name: 'Read', input: {} }], stopReason: 'tool_use', usage: USAGE }
    })
    on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'Read a.dart' }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.turn.start({ text: 'read it', turnId: 'turn-1' })
    for await (const chunk of $.turn.step({ turnId: 'turn-1', index: 0, model: 'model', messageCount: 1 })) void chunk
    await $.turn.complete({ answer: 'It is a.dart.', durationMs: 900, isAborted: false, turnId: 'turn-1', reason: 'answer' })
    const drawRow = async () =>
      JSON.stringify(await $.ui.render({ surface: 'terminal', component: 'ToolUse', requestId: 'call-1', props: READ_ROW }))
    const drawReply = async () =>
      JSON.stringify(
        await $.ui.render({
          surface: 'terminal',
          component: 'AssistantMessage',
          requestId: 'message-1',
          props: { text: 'It is a.dart.', isFirstOfReply: true },
        }),
      )

    const pick = (mode: string) =>
      $.command.run({ command: 'turn-cost', args: mode, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

    const steps = [await drawRow(), await drawReply()]
    await pick('totals')
    const totals = [await drawRow(), await drawReply()]
    await pick('off')
    const off = [await drawRow(), await drawReply()]

    expect(steps[0]).toContain('step 1 · Read · in 20.0k new')
    expect(steps[1]).toContain('↳ in 20.0k new')
    expect(totals[0]).not.toContain('step 1')
    expect(totals[1]).toContain('↳ in 20.0k new')
    expect(off[0]).not.toContain('step 1')
    expect(off[1]).not.toContain('↳')
    expect(off[0]).toContain('Read a.dart')
  })

  test('/tokens files lists each Read with its range; files with another word prints the usage', async ($, on) => {
    mock.store(on, {})
    mock.clock(on)
    const logged: string[] = []
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'session-1' }))
    on('session.cwd', () => ({ value: '/work' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.log', ($, e) => {
      logged.push(e.text)
      return { value: undefined }
    })
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('tool.call', () => ({ result: 'x'.repeat(4_000), text: 'x'.repeat(4_000) }))
    on('turn.step', async function* ($, e) {
      yield { kind: 'stop', stopReason: 'tool_use', usage: USAGE }
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{ name: 'Read', input: {} }], stopReason: 'tool_use', usage: USAGE }
    })

    await $.session.start({ surface: 'terminal', isInteractive: false, cwd: '/work' })
    await $.turn.start({ text: 'read it', turnId: 'turn-1' })
    for await (const chunk of $.turn.step({ turnId: 'turn-1', index: 0, model: 'model', messageCount: 1 })) void chunk
    await $.tool.call({ tool: 'Read', file_path: '/work/a.dart', offset: 11, limit: 20 })
    for await (const chunk of $.turn.step({ turnId: 'turn-1', index: 1, model: 'model', messageCount: 3 })) void chunk
    const tokens = async (args: string) => {
      logged.length = 0
      await $.command.run({ command: 'tokens', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
      return [...logged]
    }

    const files = await tokens('files')
    const mixed = await tokens('files 3')
    const window = await tokens('100k')

    expect(files[0]).toContain('━━ files read ')
    expect(files.find(line => line.startsWith('  a.dart'))).toContain('partial')
    expect(files).toContain('      #1 11–30 ~1.0k')
    expect(mixed).toEqual(['usage: /tokens [<prompt #> | files]'])
    expect(window).toEqual(['usage: /tokens [<prompt #> | files]'])
  })

  test("a step's thinking is its output less what streamed visibly, at two characters a token", async ($, on) => {
    mock.store(on, {})
    mock.clock(on)
    const logged: string[] = []
    const usage = { ...USAGE, output_tokens: 500 }
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'session-1' }))
    on('session.cwd', () => ({ value: '/work' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.log', ($, e) => {
      logged.push(e.text)
      return { value: undefined }
    })
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* ($, e) {
      yield { kind: 'thinking', index: 0, text: 'a summary' }
      yield { kind: 'text', index: 1, text: 'x'.repeat(400) }
      yield { kind: 'stop', stopReason: 'end_turn', usage }
      return { turnId: e.turnId, index: e.index, answer: 'x'.repeat(400), toolUses: [], stopReason: 'end_turn', usage }
    })

    await $.session.start({ surface: 'terminal', isInteractive: false, cwd: '/work' })
    await $.turn.start({ text: 'think', turnId: 'turn-1' })
    for await (const chunk of $.turn.step({ turnId: 'turn-1', index: 0, model: 'model', messageCount: 1 })) void chunk
    await $.command.run({ command: 'tokens', args: '1', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

    expect(logged).toContain('  step 1 · answer · in 20.0k new · out 500 (60% thinking)')
  })

  test("once a turn completes, its steps take the transcript's exact thinking, the total and /tokens alike", async ($, on) => {
    mock.store(on, {})
    mock.clock(on)
    const logged: string[] = []
    const ran: string[][] = []
    const usage = { ...USAGE, output_tokens: 500 }
    const transcript = '/home/.claude/projects/-work/session-1.jsonl'
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'session-1' }))
    on('session.cwd', () => ({ value: '/work' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.log', ($, e) => {
      logged.push(e.text)
      return { value: undefined }
    })
    on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home' : undefined }))
    on('fs.list', ($, e) => ({ value: e.path === '/home/.claude/projects' ? [{ name: '-work', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] : [] }))
    on('fs.exists', ($, e) => ({ value: e.path === transcript }))
    on('process.run', ($, e) => {
      ran.push([...e.argv])
      const stdout = ['1:"model":"m"', '1:"id":"msg_1"', '1:"output_tokens":500', '1:"thinking_tokens":123'].join('\n')
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    on('turn.step', async function* ($, e) {
      yield { kind: 'thinking', index: 0, text: 'a summary' }
      yield { kind: 'text', index: 1, text: 'x'.repeat(400) }
      yield { kind: 'stop', stopReason: 'end_turn', usage }
      return { turnId: e.turnId, index: e.index, answer: 'x'.repeat(400), toolUses: [], stopReason: 'end_turn', usage }
    })

    await $.session.start({ surface: 'terminal', isInteractive: false, cwd: '/work' })
    await $.turn.start({ text: 'think', turnId: 'turn-1' })
    for await (const chunk of $.turn.step({ turnId: 'turn-1', index: 0, model: 'model', messageCount: 1 })) void chunk
    await $.turn.complete({ answer: 'x'.repeat(400), durationMs: 900, isAborted: false, turnId: 'turn-1', reason: 'answer' })
    await $.command.run({ command: 'tokens', args: '1', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

    expect(ran.map(argv => argv.at(-1))).toEqual([transcript])
    expect(logged.find(line => line.startsWith('↳'))).toContain('out 500 (25% thinking)')
    expect(logged).toContain('  step 1 · answer · in 20.0k new · out 500 (25% thinking)')
  })
})
