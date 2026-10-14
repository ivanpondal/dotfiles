import { type Ledger, type Loop, MAIN } from './ledger'

/**
 * Exact thinking from a session's transcript, for the plugin and the CLI
 * alike: the engine hands a hook only four token counts per request, while
 * the transcript Claude Code writes records each response's thinking.
 *
 * A transcript can outgrow what one file read takes (`$.fs.read` stops at
 * 4 MiB), so it is never read whole: `grep` picks out the few fields needed,
 * and both sides run the same command through the TranscriptIo they have.
 */

/** One API response in a session's transcript: its output, and the thinking within it when recorded. */
export type TranscriptRequest = { output: number; thinking: number | undefined }

/** What applying transcripts needs from its host: a directory's entries, whether a file exists, a grep's output. */
export type TranscriptIo = {
  list: (dir: string) => Promise<string[]>
  exists: (path: string) => Promise<boolean>
  grep: (argv: readonly string[]) => Promise<string>
}

/** How far past a match to look for the next: requests the ledger never saw, between two it did. */
const LOOKAHEAD = 8

/**
 * The fields of an assistant row, as they appear unescaped: the response's id
 * (`msg_…`, which a synthetic row lacks), the model, and its usage. Text the
 * row quotes is JSON-escaped (`\"id\":`), so it never matches.
 */
const FIELDS = '"id":"msg_[^"]+"|"model":"[^"]+"|"output_tokens":[0-9]+|"thinking_tokens":[0-9]+'

/** The command that prints a transcript's fields, each match as `<line>:<match>`. */
export function transcriptGrep(path: string): string[] {
  return ['grep', '-n', '-oE', FIELDS, path]
}

/**
 * The responses in `transcriptGrep`'s output, in order. A line counts when it
 * has a response id and an output count; within a line the first of each field
 * is the response's own (usage `iterations` repeat the output). One response
 * spans several rows, and a subagent's transcript keeps its streamed partials,
 * so the last line of an id counts.
 */
export function requestsOf(grepOutput: string): TranscriptRequest[] {
  const lines = new Map<string, Map<string, string>>()
  for (const entry of grepOutput.split('\n')) {
    const match = /^(\d+):"(\w+)":"?([^"]*)"?$/.exec(entry)
    if (!match) continue
    const [, line = '', key = '', value = ''] = match
    const fields = lines.get(line) ?? new Map<string, string>()
    if (!fields.has(key)) fields.set(key, value)
    lines.set(line, fields)
  }
  const byId = new Map<string, TranscriptRequest>()
  for (const fields of lines.values()) {
    const id = fields.get('id')
    const output = fields.get('output_tokens')
    if (id === undefined || output === undefined || fields.get('model') === '<synthetic>') continue
    const thinking = fields.get('thinking_tokens')
    byId.set(id, { output: Number(output), thinking: thinking === undefined ? undefined : Number(thinking) })
  }
  return [...byId.values()]
}

/**
 * Replaces the estimated thinking of `loop`'s steps with the transcript's
 * exact count. Steps and requests pair in order, each pair confirmed by equal
 * output: a request with no step (sent before the plugin recorded) is passed
 * over, a step with no request keeps its estimate. Returns the steps changed.
 */
export function exactThinking(ledger: Ledger, loop: Loop, requests: readonly TranscriptRequest[]): number {
  let next = 0
  let matched = 0
  for (const step of ledger.steps) {
    if (step.loop !== loop) continue
    const window = requests.slice(next, next + LOOKAHEAD)
    const offset = window.findIndex(entry => entry.output === step.output)
    const found = window[offset]
    if (!found) continue
    next += offset + 1
    if (found.thinking === undefined) continue
    step.thinking = found.thinking
    step.thinkingExact = true
    matched += 1
  }
  return matched
}

/** What `applyTranscripts` did: whether the session's transcript was found, and how many steps are exact now. */
export type Applied = { found: boolean; exact: number; steps: number }

/**
 * Puts the exact thinking from session `sessionId`'s transcripts on the
 * ledger: the main loop's at `<config>/projects/<project>/<id>.jsonl`, each
 * subagent's at `<id>/subagents/agent-<loop>.jsonl` beside it.
 */
export async function applyTranscripts(ledger: Ledger, sessionId: string, configDir: string, io: TranscriptIo): Promise<Applied> {
  const projects = `${configDir}/projects`
  let main: string | null = null
  for (const project of await io.list(projects)) {
    const path = `${projects}/${project}/${sessionId}.jsonl`
    if (await io.exists(path)) {
      main = path
      break
    }
  }
  const steps = ledger.steps.length
  if (main === null) return { found: false, exact: ledger.steps.filter(step => step.thinkingExact).length, steps }
  for (const loop of new Set(ledger.steps.map(step => step.loop))) {
    const path = loop === MAIN ? main : `${main.replace(/\.jsonl$/, '')}/subagents/agent-${loop}.jsonl`
    if (await io.exists(path)) exactThinking(ledger, loop, requestsOf(await io.grep(transcriptGrep(path))))
  }
  return { found: true, exact: ledger.steps.filter(step => step.thinkingExact).length, steps }
}
