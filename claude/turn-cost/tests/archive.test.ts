import { describe, expect, test, tier } from 'claude-code/testing'

import { load, save } from '../hooks/archive'
import { Ledger, MAIN } from '../hooks/ledger'
import { memoryStore } from './fixtures/memory-store'
import { request } from './fixtures/request'

tier('user')

describe('archive', () => {
  test('a saved ledger loads back under its session', async () => {
    const { store } = memoryStore()
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))

    await save(store, 'session-1', ledger)
    const loaded = await load(store, 'session-1')

    expect(loaded.toData()).toEqual(ledger.toData())
  })

  test('a session with nothing saved, or something unreadable, loads empty', async () => {
    const { store, entries } = memoryStore()
    entries.set('ledger:broken', { version: 1, turns: 'not a list' })

    const missing = await load(store, 'session-1')
    const broken = await load(store, 'broken')

    expect(missing.toData()).toEqual(new Ledger().toData())
    expect(broken.toData()).toEqual(new Ledger().toData())
  })

  test('keeps the ten most recent sessions', async () => {
    const { store, entries } = memoryStore()

    for (let n = 1; n <= 11; n++) await save(store, `session-${n}`, new Ledger())

    expect(entries.has('ledger:session-1')).toBe(false)
    expect(entries.get('sessions')).toEqual(Array.from({ length: 10 }, (_, n) => `session-${n + 2}`))
  })

  test('a full store gives up its oldest sessions until the ledger fits', async () => {
    const ledger = new Ledger()
    ledger.startTurn('a prompt long enough to give the saved ledger some weight')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))
    const entrySize = JSON.stringify(ledger.toData()).length
    const { store, entries } = memoryStore(entrySize * 3.5)

    for (const id of ['session-1', 'session-2', 'session-3', 'session-4']) await save(store, id, ledger)

    expect(entries.has('ledger:session-1')).toBe(false)
    expect(entries.get('sessions')).toEqual(['session-2', 'session-3', 'session-4'])
  })
})
