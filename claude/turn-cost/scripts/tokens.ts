/**
 * `/tokens` for a saved session, outside Claude Code: the same views, read
 * from the ledgers the plugin saves to its store. Node, run with tsx:
 *
 *   npx -y tsx scripts/tokens.ts --list
 *   npx -y tsx scripts/tokens.ts <session id prefix> [<prompt #> | files]
 *   npx -y tsx scripts/tokens.ts <session id prefix> --json
 *
 * Thinking is exact where the ledger was saved exact, or the session's
 * transcript still records it (hooks/transcript.ts, the plugin's own core).
 *
 * `--store <path>` reads another store file than the plugin's. Not in the
 * plugin's tsconfig (no Node types there): what it calls lives in hooks/,
 * typed and tested.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { load, type Store } from '../hooks/archive'
import type { Ledger } from '../hooks/ledger'
import { findSession, savedSessions } from '../hooks/saved'
import { parseTokens, tokensView } from '../hooks/tokens'
import { applyTranscripts, type TranscriptIo } from '../hooks/transcript'

const USAGE = 'usage: tokens.ts [--store <path>] (--list | <session id prefix> [<prompt #> | files | --json])'
const STORE_DIR = join(homedir(), '.claude', 'plugins', 'store')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** The plugin's store file: the one `turn-cost_*.json` in Claude Code's plugin store. */
function defaultStore(): string {
  const found = readdirSync(STORE_DIR).filter(name => name.startsWith('turn-cost_') && name.endsWith('.json'))
  if (found.length !== 1) fail(`expected one turn-cost store in ${STORE_DIR}, found ${found.length}: pass --store <path>`)
  return join(STORE_DIR, found[0] as string)
}

/** The store file as a read-only Store. */
function storeAt(path: string): Store {
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  return {
    get: async key => data[key],
    set: async () => fail('the store is read-only here'),
    delete: async () => fail('the store is read-only here'),
  }
}

/** Claude Code's configuration directory, where the session transcripts live. */
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')

/** The shared transcript core's host operations, by Node. */
const io: TranscriptIo = {
  list: async dir => (existsSync(dir) ? readdirSync(dir) : []),
  exists: async path => existsSync(path),
  grep: async ([command = 'grep', ...args]) => spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout,
}

/** Exact thinking from the transcripts where the ledger isn't exact yet, and a line saying how much is. */
async function withExactThinking(ledger: Ledger, sessionId: string): Promise<string> {
  const { found, exact, steps } = await applyTranscripts(ledger, sessionId, CONFIG_DIR, io)
  if (exact === steps) return `thinking: exact (${steps} requests)`
  const missing = found ? '' : ', no transcript left'
  return exact === 0 ? `thinking: estimated${missing}` : `thinking: exact for ${exact} of ${steps} requests, the rest estimated${missing}`
}

async function main(argv: string[]) {
  const args = [...argv]
  const storeFlag = args.indexOf('--store')
  const storePath = storeFlag === -1 ? defaultStore() : (args.splice(storeFlag, 2)[1] ?? fail(USAGE))
  const store = storeAt(storePath)
  const [first, ...rest] = args
  if (first === undefined) fail(USAGE)

  if (first === '--list') {
    for (const session of await savedSessions(store)) {
      const prompt = session.firstPrompt.replace(/\s+/g, ' ').trim()
      console.log(`${session.id}  ${String(session.prompts).padStart(3)} prompts  ${String(session.steps).padStart(4)} steps  ${JSON.stringify(prompt.length > 70 ? `${prompt.slice(0, 69)}…` : prompt)}`)
    }
    return
  }

  const found = await findSession(store, first)
  if ('error' in found) fail(found.error)
  const ledger = await load(store, found.id)
  const thinking = await withExactThinking(ledger, found.id)
  if (rest.length === 1 && rest[0] === '--json') {
    console.error(thinking)
    console.log(JSON.stringify(ledger.toData(), null, 2))
    return
  }
  const query = parseTokens(rest.join(' '))
  if (query.view === 'usage') fail(USAGE)
  console.log(`session ${found.id} · ${thinking}`)
  for (const line of tokensView(ledger, query, undefined, '')) console.log(line)
}

main(process.argv.slice(2)).catch((error: unknown) => fail(String(error)))
