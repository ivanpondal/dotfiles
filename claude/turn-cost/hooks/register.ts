import type { ElementTable, EngineInterface, On, RenderElement, ToolCallInput, TurnStepToolUse, TurnUsage } from 'claude-code'

import { Anchors, type StepLine } from './anchors'
import { load, save, type Store } from './archive'
import { Ledger, MAIN, type Step } from './ledger'
import { inputOf, outputOf } from './report'
import { parseTokens, tokensView } from './tokens'
import { applyTranscripts, type TranscriptIo } from './transcript'

/** Which lines are drawn: every step's and each turn's total, the totals alone, or none. */
const MODES = ['steps', 'totals', 'off'] as const
type Mode = (typeof MODES)[number]

const MODE_NAMES: Record<Mode, string> = { steps: 'steps and totals', totals: 'totals only', off: 'off' }

function modeOf(value: unknown): Mode | null {
  return MODES.find(mode => mode === value) ?? null
}

function isShown(mode: Mode, line: StepLine): boolean {
  return mode === 'steps' || (mode === 'totals' && line.kind === 'total')
}

/** The engine's drawing of a row, with the step lines the mode shows beneath it, dim. */
function withLines(table: ElementTable, drawn: RenderElement, lines: readonly StepLine[]): RenderElement {
  if (lines.length === 0) return drawn
  const { Box, Text } = table
  const rows = lines.map(line => Text({ dimColor: true, children: line.text }))
  return Box({ flexDirection: 'column', children: [drawn, ...rows] })
}

const USAGE = `usage: /turn-cost [${MODES.join('|')}]`

/** The argument that names what a call touched, by tool; '' for a tool with none. */
const KEY_ARGS: Record<string, string> = {
  Read: 'file_path',
  Edit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
  Bash: 'command',
  Grep: 'pattern',
  Glob: 'pattern',
  Agent: 'description',
  WebFetch: 'url',
  WebSearch: 'query',
  Skill: 'skill',
}

function keyOf(e: ToolCallInput, cwd: string): string {
  const name = KEY_ARGS[e.tool]
  const value = name === undefined ? undefined : (e as unknown as Record<string, unknown>)[name]
  if (typeof value !== 'string') return ''
  return value.startsWith(`${cwd}/`) ? value.slice(cwd.length + 1) : value
}

/** The part of a file a Read took: `120–199` by lines, `p. 3–5` by pages; undefined when all of it. */
function rangeOf(e: ToolCallInput): string | undefined {
  if (e.tool !== 'Read') return undefined
  const { offset, limit, pages } = e as unknown as Record<string, unknown>
  if (typeof pages === 'string' && pages !== '') return `p. ${pages.replace('-', '–')}`
  const hasOffset = typeof offset === 'number' && offset > 1
  const hasLimit = typeof limit === 'number' && limit > 0
  if (!hasOffset && !hasLimit) return undefined
  const start = hasOffset ? offset : 1
  return hasLimit ? `${start}–${start + limit - 1}` : `${start}–`
}

function storeOf($: EngineInterface): Store {
  return {
    get: key => $.store.get(key),
    set: (key, value) => $.store.set(key, value),
    delete: key => $.store.delete(key),
  }
}

/** The shared transcript core's host operations, through the engine. */
function transcriptIoOf($: EngineInterface): TranscriptIo {
  return {
    list: async dir => (await $.fs.list(dir)).map(entry => entry.name),
    exists: path => $.fs.exists(path),
    grep: async argv => (await $.process.run(argv)).stdout,
  }
}

/**
 * Gives the ledger's steps the exact thinking the session's transcripts
 * record, best effort: without a transcript, a home, or a host that runs
 * commands (the CLI alone does), the estimates stand.
 */
async function exactFromTranscripts($: EngineInterface, ledger: Ledger, sessionId: string) {
  try {
    const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    await applyTranscripts(ledger, sessionId, configDir, transcriptIoOf($))
  } catch {
    // The estimates stand.
  }
}

/** The ledger, and the session it was loaded for. */
type SessionState = { ledger: Ledger; sessionId: string | null }

/**
 * Loads the session's saved ledger the first time `state` meets the session:
 * at its start, after a `/resume`, or when the plugin was loaded mid-session
 * and `session.start` never reached it.
 */
async function sessionLedger($: EngineInterface, state: SessionState): Promise<Ledger> {
  const id = await $.session.id()
  if (id !== state.sessionId) {
    state.ledger = await load(storeOf($), id)
    state.sessionId = id
  }
  return state.ledger
}

async function persist($: EngineInterface, state: SessionState) {
  if (state.sessionId !== null) await save(storeOf($), state.sessionId, state.ledger)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A request's prompt split by where its tokens came from: `context` the cache
 * read back, `recached` what the loop's last request cached that this one did
 * not read back (a cache miss), `added` the rest of what it had to process.
 */
type Tally = {
  context: number
  added: number
  recached: number
  output: number
  thinking: number
  generationMs: number
  firstTokenMs: number | null
}

/** What a response streamed: text and tool arguments in full, thinking often as a summary. */
type Streamed = { visibleChars: number; sawThinking: boolean }

/**
 * Characters per token of what a response streams visibly, text and tool
 * arguments: about 2 against transcripts' exact thinking counts (211 requests),
 * where 4, prose's rule of thumb, put thinking at 70% of output for 44%.
 */
const STREAMED_CHARS_PER_TOKEN = 2

/** Below this many output tokens a reply lands in a burst or two, and tok/s is noise. */
const MIN_TOKENS_FOR_RATE = 200

function emptyTally(): Tally {
  return { context: 0, added: 0, recached: 0, output: 0, thinking: 0, generationMs: 0, firstTokenMs: null }
}

function tokenParts(tally: Tally): string[] {
  const parts = [inputOf(tally.context, tally.added, tally.recached), outputOf(tally.output, tally.thinking)]
  if (tally.output >= MIN_TOKENS_FOR_RATE && tally.generationMs > 0) {
    parts.push(`${Math.round(tally.output / (tally.generationMs / 1000))} tok/s`)
  }
  return parts
}

/**
 * Splits a request's uncached tokens (cache write plus input) into old context
 * processed again, what the loop's previous request cached but this one did not
 * read back, and new content, the rest. A loop's first request has nothing to
 * compare against, so all of it counts as new.
 *
 * Thinking is the output less what streamed visibly: the streamed thinking is
 * often a summary, while `output_tokens` counts the thinking in full.
 */
function stepTallyOf(
  usage: TurnUsage,
  previouslyCached: number | undefined,
  generationMs: number,
  streamed: Streamed,
): Tally {
  const uncached = usage.cache_creation_input_tokens + usage.input_tokens
  const missed = (previouslyCached ?? 0) - usage.cache_read_input_tokens
  const recached = Math.min(Math.max(missed, 0), uncached)
  return {
    context: usage.cache_read_input_tokens,
    added: uncached - recached,
    recached,
    output: usage.output_tokens,
    thinking: streamed.sawThinking ? Math.max(usage.output_tokens - Math.round(streamed.visibleChars / STREAMED_CHARS_PER_TOKEN), 0) : 0,
    generationMs,
    firstTokenMs: null,
  }
}

function add(tally: Tally, step: Tally) {
  tally.context += step.context
  tally.added += step.added
  tally.recached += step.recached
  tally.output += step.output
  tally.thinking += step.thinking
  tally.generationMs += step.generationMs
}

/** `Read×3, Bash`, in the order the model first called each; `answer` for none. */
function actionOf(toolUses: readonly TurnStepToolUse[]): string {
  if (toolUses.length === 0) return 'answer'
  const counts = new Map<string, number>()
  for (const toolUse of toolUses) counts.set(toolUse.name, (counts.get(toolUse.name) ?? 0) + 1)
  return [...counts].map(([name, count]) => (count > 1 ? `${name}×${count}` : name)).join(', ')
}

/**
 * Tallies every request (`turn.step`), subagents' included: logs a line per
 * request as it lands, named by the tools the model called in it, and the
 * totals when a main turn completes. A total covers everything since the last
 * one, so a background agent that ran between turns lands in the next total.
 *
 * tok/s is output tokens over the time from each response's first chunk to its
 * stop, so it measures generation alone, not tool runs or queueing.
 *
 * `/turn-cost <mode>` picks which lines are drawn, kept in the plugin's
 * store so it survives the session. On a screen, step lines and turn totals
 * are drawn beneath the rows they describe (Anchors), so a change of mode
 * redraws them, old ones included; headless, they are logged.
 *
 * Every request and tool result also goes into a Ledger, which `/tokens` prints
 * as the session's token map. Everything prints through `$.ui.log`, which the
 * model never reads. The ledger is saved under the session's id after each
 * turn, so `claude --resume` and `/resume` pick it back up.
 */
export function register(on: On) {
  let mode: Mode = 'steps'
  let turnTally = emptyTally()
  /** The requests `turnTally` counts, whose thinking the transcript corrects once the turn completes. */
  let turnSteps: Step[] = []
  let usdAtLastTotal: number | null = null
  const state: SessionState = { ledger: new Ledger(), sessionId: null }
  const anchors = new Anchors()
  let isInteractive = false
  let cwd = ''

  on('session.start', async ($, e, next) => {
    mode = modeOf(await $.store.get('mode')) ?? 'steps'
    isInteractive = e.isInteractive
    cwd = await $.session.cwd()
    await sessionLedger($, state)
    await $.command.register({
      name: 'turn-cost',
      description: 'Pick which token lines are drawn: steps and totals, totals only, or off',
      argumentHint: '[steps|totals|off]',
      immediate: true,
    })
    await $.command.register({
      name: 'tokens',
      description: "The session's token map: window, prompts, what fills the window, files read, tools, subagents",
      argumentHint: '[<prompt #> | files]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'tokens' }, async ($, e) => {
    const query = parseTokens(e.args)
    const breakdown = query.view === 'overview' ? (await $.session.usage({ breakdown: 'summary' })).context.breakdown : undefined
    for (const line of tokensView(await sessionLedger($, state), query, breakdown, cwd)) $.ui.log(line)
    return {}
  })

  on('command.run', { command: 'clear' }, async ($, e, next) => {
    const result = await next(e)
    state.ledger.reset()
    state.sessionId = await $.session.id()
    return result
  })

  on('session.end', async ($, e, next) => {
    if (state.sessionId === e.sessionId) await persist($, state)
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.trigger === 'precompute' || result.skip !== undefined) return result
    const loop = e.agentId ?? MAIN
    const current = await sessionLedger($, state)
    current.compacted(loop, result.tokensBefore, result.tokensAfter)
    await persist($, state)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result
    const agentId = isRecord(result.result) && typeof result.result.agentId === 'string' ? result.result.agentId : undefined
    const isError = result.isError === true ? true : undefined
    const current = await sessionLedger($, state)
    current.toolResult(e.agentId ?? MAIN, e.tool, keyOf(e, cwd), result.text?.length ?? 0, { range: rangeOf(e), agentId, isError })
    if (e.tool === 'Agent' && agentId !== undefined) {
      anchors.linkAgent(agentId, e.tool_use_id)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('command.run', { command: 'turn-cost' }, async ($, e) => {
    const [value, ...rest] = e.args.trim().split(/\s+/).filter(word => word !== '')
    const picked = modeOf(value)
    if (rest.length > 0 || (value !== undefined && picked === null)) {
      $.ui.log(USAGE)
    } else if (picked === null) {
      $.ui.log(`turn-cost: ${MODE_NAMES[mode]}`)
    } else {
      mode = picked
      await $.store.set('mode', mode)
      $.ui.invalidate('ui.render')
      $.ui.log(`turn-cost: ${MODE_NAMES[mode]}`)
    }
    return {}
  })

  on('turn.start', async ($, e, next) => {
    const current = await sessionLedger($, state)
    current.startTurn(e.text)
    turnTally.firstTokenMs = null
    usdAtLastTotal ??= (await $.session.usage()).cost?.usd ?? 0
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const current = await sessionLedger($, state)
    current.beginStep(e.agentId ?? MAIN)
    const sentAt = await $.clock.now()
    let firstChunkAt: number | null = null
    let stoppedAt: number | null = null
    let firstToolId: string | null = null
    const streamed: Streamed = { visibleChars: 0, sawThinking: false }
    const stream = next(e)
    for await (const chunk of stream) {
      if (firstChunkAt === null && chunk.kind !== 'engine') firstChunkAt = await $.clock.now()
      if (chunk.kind === 'stop') stoppedAt = await $.clock.now()
      if (chunk.kind === 'text') streamed.visibleChars += chunk.text.length
      if (chunk.kind === 'input') streamed.visibleChars += chunk.json.length
      if (chunk.kind === 'thinking') streamed.sawThinking = true
      if (chunk.kind === 'tool' && firstToolId === null) firstToolId = chunk.id
      yield chunk
    }
    const result = await stream.result
    const usage = result.usage
    if (usage === null) return result

    const generationMs = firstChunkAt !== null && stoppedAt !== null ? stoppedAt - firstChunkAt : 0
    if (!e.agentId && turnTally.firstTokenMs === null && firstChunkAt !== null) {
      turnTally.firstTokenMs = firstChunkAt - sentAt
    }
    const loopKey = e.agentId ?? MAIN
    const stepTally = stepTallyOf(usage, current.lastCached(loopKey), generationMs, streamed)
    add(turnTally, stepTally)
    const action = actionOf(result.toolUses)
    const cached = usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    turnSteps.push(current.step({ loop: loopKey, index: e.index + 1, action, ...stepTally, cached }))

    const isLoneAnswer = !e.agentId && e.index === 0 && result.toolUses.length === 0
    if (isLoneAnswer) return result
    const prefix = e.agentId ? `agent ${e.agentId.slice(0, 8)} ` : ''
    const elapsed = `${(((stoppedAt ?? sentAt) - sentAt) / 1000).toFixed(1)}s`
    const line: StepLine = { kind: 'step', loop: loopKey, text: `  ${prefix}step ${e.index + 1} · ${action} · ${[...tokenParts(stepTally), elapsed].join(' · ')}` }
    if (!isInteractive) {
      if (isShown(mode, line)) $.ui.log(line.text)
      return result
    }
    if (firstToolId === null) anchors.answerStep(line)
    else anchors.toolStep(firstToolId, line)
    $.ui.invalidate('ui.render')
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    if (state.sessionId !== null) await exactFromTranscripts($, state.ledger, state.sessionId)
    turnTally.thinking = turnSteps.reduce((total, step) => total + step.thinking, 0)
    const usdNow = (await $.session.usage()).cost?.usd ?? 0
    const usd = usdNow - (usdAtLastTotal ?? 0)
    const parts = [...tokenParts(turnTally), `$${usd.toFixed(3)}`]
    if (turnTally.firstTokenMs !== null) parts.push(`${(turnTally.firstTokenMs / 1000).toFixed(1)}s to first token`)
    const total: StepLine = { kind: 'total', loop: MAIN, text: `↳ ${parts.join(' · ')}` }
    const isDrawn = isInteractive && anchors.turnAnswered(e.answer, total)
    if (isDrawn) $.ui.invalidate('ui.render')
    else if (isShown(mode, total)) $.ui.log(total.text)
    turnTally = emptyTally()
    turnSteps = []
    usdAtLastTotal = usdNow
    await persist($, state)
    return result
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const drawn = await next(e)
    const lines = anchors.linesForToolUse(e.props.tool_use_id).filter(line => isShown(mode, line))
    return withLines($.ui.resolve(e), drawn, lines)
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const drawn = await next(e)
    if (e.props.isExpanded) return drawn
    const lines = e.props.calls
      .flatMap(call => (call.tool_use_id === undefined ? [] : anchors.linesForToolUse(call.tool_use_id)))
      .filter(line => isShown(mode, line))
    return withLines($.ui.resolve(e), drawn, lines)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = await next(e)
    const lines = anchors.linesForMessage(e.requestId, e.props.text).filter(line => isShown(mode, line))
    return withLines($.ui.resolve(e), drawn, lines)
  })
}
