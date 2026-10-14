import { describe, expect, test, tier } from 'claude-code/testing'

import { Ledger, MAIN } from '../hooks/ledger'
import { applyTranscripts, exactThinking, requestsOf, type TranscriptIo, transcriptGrep } from '../hooks/transcript'
import { request } from './fixtures/request'

tier('user')

/**
 * A transcript row for one streamed chunk of response `id`, its keys in the
 * order Claude Code writes them, `iterations` repeating the output count.
 */
function row(id: string, output: number, thinking?: number, model = 'claude-opus-5-5'): string {
  const details = thinking === undefined ? {} : { output_tokens_details: { thinking_tokens: thinking } }
  const usage = { input_tokens: 2, output_tokens: output, ...details, iterations: [{ output_tokens: output + 1 }] }
  return JSON.stringify({ type: 'assistant', message: { model, id, type: 'message', content: [], usage } })
}

/** What `grep -n -oE` prints for these transcript lines: each match on its own line, after its line number. */
function grepped(lines: string[]): string {
  const regex = new RegExp(transcriptGrep('t.jsonl').at(-2) ?? '', 'g')
  return lines.flatMap((line, index) => (line.match(regex) ?? []).map(match => `${index + 1}:${match}`)).join('\n')
}

/** A ledger whose main loop made requests with these outputs, each with the estimate `estimated`. */
function ledgerWith(outputs: number[], estimated = 1): Ledger {
  const ledger = new Ledger()
  ledger.startTurn('go')
  outputs.forEach((output, index) => {
    ledger.beginStep(MAIN)
    ledger.step(request({ index: index + 1, added: 100, output, thinking: estimated, cached: 100 }))
  })
  return ledger
}

/** Files by path, as `TranscriptIo` reads them, grep run over them for real. */
function io(files: Record<string, string[]>): TranscriptIo {
  return {
    list: async dir => Object.keys(files).filter(path => path.startsWith(`${dir}/`)).map(path => path.slice(dir.length + 1).split('/')[0] ?? ''),
    exists: async path => path in files,
    grep: async argv => grepped(files[argv.at(-1) ?? ''] ?? []),
  }
}

describe('transcript', () => {
  test('one request per response id, in order, its last row counting; synthetic rows, user rows and escaped text skipped', async () => {
    const lines = [
      row('msg_1', 6),
      JSON.stringify({ type: 'user', message: { content: `quoted: ${row('msg_9', 999, 999)}` } }),
      row('msg_1', 300, 120),
      row('b807-uuid', 0, 0, '<synthetic>'),
      row('msg_2', 50),
    ]

    expect(requestsOf(grepped(lines))).toEqual([
      { output: 300, thinking: 120 },
      { output: 50, thinking: undefined },
    ])
  })

  test("a loop's steps take the exact thinking of the requests they match, in order, marked exact", async () => {
    const ledger = ledgerWith([300, 1_000])

    const matched = exactThinking(ledger, MAIN, [
      { output: 300, thinking: 120 },
      { output: 1_000, thinking: 0 },
    ])

    expect(matched).toBe(2)
    expect(ledger.steps.map(step => [step.thinking, step.thinkingExact])).toEqual([
      [120, true],
      [0, true],
    ])
  })

  test('a request the ledger never saw is skipped; a step with no match keeps its estimate', async () => {
    const ledger = ledgerWith([300, 777, 1_000])

    const matched = exactThinking(ledger, MAIN, [
      { output: 40, thinking: 30 },
      { output: 300, thinking: 120 },
      { output: 1_000, thinking: 400 },
    ])

    expect(matched).toBe(2)
    expect(ledger.steps.map(step => [step.thinking, step.thinkingExact])).toEqual([
      [120, true],
      [1, undefined],
      [400, true],
    ])
  })

  test('a request without a thinking count, or another loop, leaves the estimate', async () => {
    const ledger = ledgerWith([300])
    ledger.beginStep('agent-1')
    ledger.step(request({ loop: 'agent-1', added: 100, output: 300, thinking: 1, cached: 100 }))

    expect(exactThinking(ledger, MAIN, [{ output: 300, thinking: undefined }])).toBe(0)
    expect(exactThinking(ledger, 'agent-1', [{ output: 300, thinking: 90 }])).toBe(1)
    expect(ledger.steps.map(step => [step.loop, step.thinking])).toEqual([
      [MAIN, 1],
      ['agent-1', 90],
    ])
  })

  test("the session's transcript and its subagents' are found under the config's projects and applied", async () => {
    const ledger = ledgerWith([300])
    ledger.beginStep('a6a2')
    ledger.step(request({ loop: 'a6a2', added: 100, output: 192, thinking: 1, cached: 100 }))
    const files = {
      '/home/.claude/projects/-work-other/s-0.jsonl': [row('msg_x', 300, 7)],
      '/home/.claude/projects/-work/s-1.jsonl': [row('msg_1', 300, 120)],
      '/home/.claude/projects/-work/s-1/subagents/agent-a6a2.jsonl': [row('msg_a', 6), row('msg_a', 192, 103)],
    }

    const applied = await applyTranscripts(ledger, 's-1', '/home/.claude', io(files))

    expect(applied).toEqual({ found: true, exact: 2, steps: 2 })
    expect(ledger.steps.map(step => step.thinking)).toEqual([120, 103])
  })

  test('with no transcript left, nothing changes and it says so', async () => {
    const ledger = ledgerWith([300])

    expect(await applyTranscripts(ledger, 's-1', '/home/.claude', io({}))).toEqual({ found: false, exact: 0, steps: 1 })
    expect(ledger.steps[0]?.thinking).toBe(1)
  })
})
