import type { Store } from '../../hooks/archive'

/**
 * A Store over a Map, its `entries` there to read; a `set` that takes the
 * entries past `limit` characters of JSON is refused, as `$.store` refuses
 * one past its 4 MiB.
 */
export function memoryStore(limit = Number.POSITIVE_INFINITY): { store: Store; entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>()
  const store: Store = {
    get: async key => entries.get(key),
    set: async (key, value) => {
      const before = entries.get(key)
      entries.set(key, JSON.parse(JSON.stringify(value)))
      if (JSON.stringify([...entries]).length <= limit) return
      if (before === undefined) entries.delete(key)
      else entries.set(key, before)
      throw new Error('store over its limit')
    },
    delete: async key => {
      entries.delete(key)
    },
  }
  return { store, entries }
}
