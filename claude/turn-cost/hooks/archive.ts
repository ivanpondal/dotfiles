import { Ledger, type LedgerData } from './ledger'

/** The plugin's `$.store`, handed over as functions: `$` itself never leaves register.ts. */
export type Store = {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
}

/** The saved sessions' ids, oldest first. */
const INDEX_KEY = 'sessions'
const MAX_SESSIONS = 10

function ledgerKey(sessionId: string): string {
  return `ledger:${sessionId}`
}

function isLedgerData(value: unknown): value is LedgerData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return (
    typeof data.version === 'number' &&
    ['turns', 'steps', 'items', 'compactions'].every(key => Array.isArray(data[key])) &&
    typeof data.fixed === 'object' &&
    data.fixed !== null
  )
}

/** Every session id in the index, oldest first, whatever its ledger holds. */
export async function savedIds(store: Store): Promise<string[]> {
  const index = await store.get(INDEX_KEY)
  return Array.isArray(index) ? index.filter((id): id is string => typeof id === 'string') : []
}

/** The session's saved ledger, or an empty one when it has none (or one of an older shape). */
export async function load(store: Store, sessionId: string): Promise<Ledger> {
  const data = await store.get(ledgerKey(sessionId))
  return new Ledger(isLedgerData(data) ? data : undefined)
}

/**
 * Saves the session's ledger as its newest, keeping the last MAX_SESSIONS.
 * When the store is full, older sessions go first until this one fits.
 */
export async function save(store: Store, sessionId: string, ledger: Ledger) {
  const ids = [...(await savedIds(store)).filter(id => id !== sessionId), sessionId]
  while (ids.length > MAX_SESSIONS) await store.delete(ledgerKey(ids.shift() ?? ''))
  for (;;) {
    try {
      await store.set(ledgerKey(sessionId), ledger.toData())
      break
    } catch (error) {
      const oldest = ids.length > 1 ? ids.shift() : undefined
      if (oldest === undefined) throw error
      await store.delete(ledgerKey(oldest))
      await store.set(INDEX_KEY, ids)
    }
  }
  await store.set(INDEX_KEY, ids)
}
