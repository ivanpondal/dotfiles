import { type Item, type Ledger, MAIN } from './ledger'

/** Tools whose result means the file on disk no longer matches what was read before. */
const CHANGES = new Set(['Edit', 'Write', 'NotebookEdit'])

/** One Read of a file: what it took, and what it still holds in the window. */
export type FileRead = {
  turn: number
  range?: string
  tokens: number
  isResident: boolean
  /** A later Write replaced the file: what this read holds is out of date. */
  isSuperseded: boolean
  /** Tokens × the requests that carried it, until its loop compacted. */
  carried: number
}

/** A change made to a file after it was first read. */
export type FileChange = { tool: string; turn: number }

/**
 * Everything the main loop read of one file. Only proxies for whether it was
 * needed: a later change says it was, a Write says what was read before it is
 * out of date, a read with nothing after it says nothing either way.
 */
export type FileEntry = {
  path: string
  reads: FileRead[]
  changes: FileChange[]
  /** Tokens of its reads still in the main window. */
  now: number
  carried: number
  /** Tokens still in the window from reads a later Write replaced. */
  superseded: number
  /** Edited or written after some read of it. */
  isEdited: boolean
}

function isRead(item: Item): boolean {
  return item.tool === 'Read' && item.key !== undefined && item.key !== ''
}

/**
 * The files the main loop read, by path, in the order the ledger took the
 * items in, largest in the window first. Failed calls are left out, and so is
 * a change to a file before its first read.
 */
export function filesOf(ledger: Ledger): FileEntry[] {
  const byPath = new Map<string, FileEntry>()
  /** Per path, the resident reads no Write has replaced yet. */
  const current = new Map<string, FileRead[]>()
  for (const item of ledger.items) {
    if (item.loop !== MAIN || item.kind !== 'tool' || item.isError || item.key === undefined) continue
    const path = item.key
    if (isRead(item)) {
      const entry = byPath.get(path) ?? { path, reads: [], changes: [], now: 0, carried: 0, superseded: 0, isEdited: false }
      byPath.set(path, entry)
      const isResident = ledger.isResident(item)
      const carried = item.tokens * ledger.residentSteps(item)
      const read: FileRead = { turn: item.turn, range: item.range, tokens: item.tokens, isResident, isSuperseded: false, carried }
      entry.reads.push(read)
      entry.carried += read.carried
      if (isResident) {
        entry.now += read.tokens
        current.set(path, [...(current.get(path) ?? []), read])
      }
      continue
    }
    const entry = byPath.get(path)
    if (!entry || item.tool === undefined || !CHANGES.has(item.tool)) continue
    entry.changes.push({ tool: item.tool, turn: item.turn })
    entry.isEdited = true
    if (item.tool === 'Write') {
      for (const read of current.get(path) ?? []) {
        read.isSuperseded = true
        entry.superseded += read.tokens
      }
      current.delete(path)
    }
  }
  return [...byPath.values()].sort((a, b) => b.now - a.now || b.carried - a.carried)
}
