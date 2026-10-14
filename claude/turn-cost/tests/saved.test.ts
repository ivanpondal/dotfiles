import { describe, expect, test, tier } from 'claude-code/testing'

import { save } from '../hooks/archive'
import { Ledger, MAIN } from '../hooks/ledger'
import { findSession, savedSessions } from '../hooks/saved'
import { memoryStore } from './fixtures/memory-store'
import { request } from './fixtures/request'

tier('user')

/** A ledger of `prompts`, one request each. */
function ledgerOf(...prompts: string[]): Ledger {
  const ledger = new Ledger()
  for (const prompt of prompts) {
    ledger.startTurn(prompt)
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))
  }
  return ledger
}

describe('saved', () => {
  test('the saved sessions come newest first, each named by its first prompt', async () => {
    const { store } = memoryStore()
    await save(store, 'aaaa-1111', ledgerOf('first session', 'and more'))
    await save(store, 'bbbb-2222', ledgerOf('second session'))

    expect(await savedSessions(store)).toEqual([
      { id: 'bbbb-2222', firstPrompt: 'second session', prompts: 1, steps: 1 },
      { id: 'aaaa-1111', firstPrompt: 'first session', prompts: 2, steps: 2 },
    ])
  })

  test('a session with no requests recorded, or saved in another shape, is left out', async () => {
    const { store, entries } = memoryStore()
    await save(store, 'empty', new Ledger())
    await save(store, 'old', ledgerOf('old shape'))
    entries.set('ledger:old', { ...(entries.get('ledger:old') as object), version: 1 })
    await save(store, 'kept', ledgerOf('kept'))

    expect((await savedSessions(store)).map(session => session.id)).toEqual(['kept'])
  })

  test('a session is found by any prefix of its id that names it alone', async () => {
    const { store } = memoryStore()
    await save(store, 'e340c2ec-0696', ledgerOf('one'))
    await save(store, 'e3aa0000-0000', ledgerOf('two'))

    expect(await findSession(store, 'e340')).toEqual({ id: 'e340c2ec-0696' })
    expect(await findSession(store, 'e3aa0000-0000')).toEqual({ id: 'e3aa0000-0000' })
    expect(await findSession(store, 'e3')).toEqual({ error: 'ambiguous session e3: e3aa0000-0000, e340c2ec-0696' })
    expect(await findSession(store, 'ffff')).toEqual({ error: 'no saved session ffff' })
  })
})
