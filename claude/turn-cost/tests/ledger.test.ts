import { describe, expect, test, tier } from 'claude-code/testing'

import { Ledger, MAIN } from '../hooks/ledger'
import { request } from './fixtures/request'

tier('user')

describe('ledger', () => {
  test("a loop's first request sets its fixed overhead, less the items it carried", async () => {
    const ledger = new Ledger()

    ledger.startTurn('x'.repeat(400))
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_100, output: 50, cached: 20_100 }))

    expect(ledger.fixed.get(MAIN)).toBe(20_000)
    expect(ledger.items.map(item => [item.label, item.tokens])).toEqual([['prompt #1', 100]])
  })

  test('the previous reply takes its output, tool results split the rest by characters', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Read, Grep', added: 20_000, output: 50, cached: 20_000 }))

    ledger.toolResult(MAIN, 'Read', 'a.dart', 3_000)
    ledger.toolResult(MAIN, 'Grep', 'L2cap', 1_000)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 850, output: 10, cached: 20_850 }))

    const arrived = ledger.items.filter(item => item.seq === 2).map(item => [item.label, item.tokens])
    expect(arrived).toEqual([
      ['reply #1.1', 50],
      ['Read a.dart', 600],
      ['Grep L2cap', 200],
    ])
  })

  test('a result that lands while its request still streams rides the next request', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')

    ledger.beginStep(MAIN)
    ledger.toolResult(MAIN, 'Read', 'a.dart', 400)
    ledger.step(request({ action: 'Read', added: 20_000, output: 50, cached: 20_000 }))
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 150, cached: 20_150 }))

    const labelsAt = (seq: number) => ledger.items.filter(item => item.seq === seq).map(item => item.label)
    expect(labelsAt(1)).toEqual(['prompt #1'])
    expect(labelsAt(2)).toEqual(['reply #1.1', 'Read a.dart'])
  })

  test('a partial read keeps its range on its item, a whole one has none', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Read×2', added: 20_000, cached: 20_000 }))

    ledger.toolResult(MAIN, 'Read', 'a.dart', 400, { range: '120–199' })
    ledger.toolResult(MAIN, 'Read', 'b.dart', 400)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 200, cached: 20_200 }))

    const reads = ledger.items.filter(item => item.tool === 'Read').map(item => [item.key, item.range])
    expect(reads).toEqual([
      ['a.dart', '120–199'],
      ['b.dart', undefined],
    ])
  })

  test('compaction ends residency, keeps the fixed overhead and brings the summary in', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, output: 50, cached: 20_000 }))

    ledger.compacted(MAIN, 20_050, 3_000)

    expect(ledger.mainCompaction).toEqual({ loop: MAIN, turn: 1, before: 20_050, after: 3_000 })
    expect(ledger.lastCached(MAIN)).toBeUndefined()
    expect(ledger.items.map(item => ledger.isResident(item))).toEqual([false])

    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 19_000, added: 3_100, cached: 22_100 }))

    expect(ledger.mainCompaction).toBeNull()
    expect(ledger.fixed.get(MAIN)).toBe(19_999)
    const arrived = ledger.items.filter(item => item.seq === 2).map(item => [item.label, item.tokens])
    expect(arrived).toEqual([['compaction summary', 3_100]])
  })

  test("an item stays resident across its own loop's requests, not a subagent's", async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))

    ledger.beginStep('agent-1')
    ledger.step(request({ loop: 'agent-1', added: 15_000, cached: 15_000 }))
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 10, cached: 20_010 }))

    expect(ledger.items.map(item => ledger.residentSteps(item))).toEqual([1])
    expect(ledger.lastCached(MAIN)).toBe(20_010)
    expect(ledger.lastCached('agent-1')).toBe(15_000)
  })

  test('a ledger rebuilt from its data carries on as the original does', async () => {
    const original = new Ledger()
    original.startTurn('hi')
    original.beginStep(MAIN)
    original.step(request({ action: 'Read', added: 20_000, output: 50, cached: 20_000 }))
    original.toolResult(MAIN, 'Read', 'a.dart', 400)
    original.beginStep(MAIN)
    original.step(request({ index: 2, context: 20_000, added: 150, output: 30, cached: 20_150 }))
    original.compacted(MAIN, 20_180, 1_000)
    original.beginStep(MAIN)
    original.step(request({ index: 3, context: 19_000, added: 1_000, output: 20, cached: 20_000 }))

    const restored = new Ledger(JSON.parse(JSON.stringify(original.toData())))
    for (const ledger of [original, restored]) {
      ledger.startTurn('again')
      ledger.beginStep(MAIN)
      ledger.step(request({ context: 20_000, added: 500, output: 5, cached: 20_500 }))
    }

    expect(restored.toData()).toEqual(original.toData())
    expect(restored.lastCached(MAIN)).toBe(20_500)
  })

  test('data saved in another shape is dropped', async () => {
    const original = new Ledger()
    original.startTurn('hi')

    const restored = new Ledger({ ...original.toData(), version: 0 })

    expect(restored.turns).toEqual([])
  })

  test('reset forgets everything, the fixed overhead included', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))

    ledger.reset()

    expect(ledger.toData()).toEqual(new Ledger().toData())
  })
})
