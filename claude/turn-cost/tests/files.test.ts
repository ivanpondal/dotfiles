import { describe, expect, test, tier } from 'claude-code/testing'

import { filesOf } from '../hooks/files'
import { Ledger, MAIN } from '../hooks/ledger'
import { request } from './fixtures/request'

tier('user')

/** A ledger one prompt in, its first request sent, so the next ones split their new tokens by characters. */
function started(): Ledger {
  const ledger = new Ledger()
  ledger.startTurn('go')
  ledger.beginStep(MAIN)
  ledger.step(request({ added: 20_000, cached: 20_000 }))
  return ledger
}

/** One more main-loop request, carrying what is pending, `added` of it new. */
function send(ledger: Ledger, added: number) {
  const context = ledger.lastCached(MAIN) ?? 0
  ledger.beginStep(MAIN)
  ledger.step(request({ index: 2, context, added, cached: context + added }))
}

describe('files', () => {
  test('a file edited after it was read counts as edited, nothing superseded', async () => {
    const ledger = started()
    ledger.toolResult(MAIN, 'Read', 'a.ts', 4_000)
    send(ledger, 1_000)
    ledger.toolResult(MAIN, 'Edit', 'a.ts', 400)
    send(ledger, 100)

    const [file] = filesOf(ledger)

    expect(file).toMatchObject({ path: 'a.ts', now: 1_000, carried: 1_000, superseded: 0, isEdited: true })
    expect(file?.changes).toEqual([{ tool: 'Edit', turn: 1 }])
  })

  test('a read before a Write is superseded; a read after it is not', async () => {
    const ledger = started()
    ledger.toolResult(MAIN, 'Read', 'a.ts', 4_000)
    send(ledger, 1_000)
    ledger.toolResult(MAIN, 'Write', 'a.ts', 400)
    send(ledger, 100)
    ledger.toolResult(MAIN, 'Read', 'a.ts', 2_000)
    send(ledger, 500)

    const [file] = filesOf(ledger)

    expect(file).toMatchObject({ now: 1_500, superseded: 1_000, isEdited: true })
    expect(file?.reads.map(read => [read.tokens, read.isSuperseded])).toEqual([
      [1_000, true],
      [500, false],
    ])
  })

  test('two reads of one file add up, each carried for the requests after it', async () => {
    const ledger = started()
    ledger.toolResult(MAIN, 'Read', 'a.ts', 2_000, { range: '1–100' })
    send(ledger, 500)
    ledger.toolResult(MAIN, 'Read', 'a.ts', 2_000, { range: '101–200' })
    send(ledger, 500)
    send(ledger, 0)

    const [file] = filesOf(ledger)

    expect(file).toMatchObject({ now: 1_000, carried: 500 * 2 + 500 * 1, isEdited: false })
    expect(file?.reads.map(read => read.range)).toEqual(['1–100', '101–200'])
  })

  test('the files come largest in the window first', async () => {
    const ledger = started()
    ledger.toolResult(MAIN, 'Read', 'small.ts', 1_000)
    ledger.toolResult(MAIN, 'Read', 'large.ts', 3_000)
    send(ledger, 400)

    expect(filesOf(ledger).map(file => [file.path, file.now])).toEqual([
      ['large.ts', 300],
      ['small.ts', 100],
    ])
  })

  test('a failed Read or Edit is left out', async () => {
    const ledger = started()
    ledger.toolResult(MAIN, 'Read', 'missing.ts', 100, { isError: true })
    ledger.toolResult(MAIN, 'Read', 'a.ts', 100)
    send(ledger, 50)
    ledger.toolResult(MAIN, 'Edit', 'a.ts', 100, { isError: true })
    send(ledger, 50)

    const files = filesOf(ledger)

    expect(files.map(file => file.path)).toEqual(['a.ts'])
    expect(files[0]?.isEdited).toBe(false)
  })

  test('a file read before a compaction stays listed, out of the window', async () => {
    const ledger = started()
    ledger.toolResult(MAIN, 'Read', 'a.ts', 4_000)
    send(ledger, 1_000)
    send(ledger, 0)
    ledger.compacted(MAIN, 21_000, 2_000)
    send(ledger, 2_000)

    const [file] = filesOf(ledger)

    expect(file).toMatchObject({ now: 0, carried: 1_000 })
    expect(file?.reads[0]?.isResident).toBe(false)
  })

  test("a subagent's reads are not the main window's", async () => {
    const ledger = started()
    ledger.beginStep('agent-1')
    ledger.step(request({ loop: 'agent-1', added: 15_000, cached: 15_000 }))
    ledger.toolResult('agent-1', 'Read', 'a.ts', 4_000)
    ledger.beginStep('agent-1')
    ledger.step(request({ loop: 'agent-1', index: 2, context: 15_000, added: 1_000, cached: 16_000 }))

    expect(filesOf(ledger)).toEqual([])
  })
})
