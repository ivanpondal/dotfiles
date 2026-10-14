/** The main conversation, or a subagent by its id: each has a window of its own. */
export type Loop = string

export const MAIN: Loop = 'main'

/** Characters per token, for sizing text the API never counted on its own. */
const CHARS_PER_TOKEN = 4

/** Bumped when LedgerData changes shape; saved data of another version is dropped. */
const DATA_VERSION = 2

/** A token count for text the API never counted on its own. */
export function estimateTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN)
}

/** Something that entered a loop's context: a prompt, a reply carried forward, a tool result. */
export type Item = {
  kind: 'prompt' | 'reply' | 'tool' | 'summary'
  label: string
  /** The tool's name, on a `tool` item. */
  tool?: string
  /** The tool's main argument (a path, a command, a pattern), on a `tool` item. */
  key?: string
  /** The part of the file a Read took (`120–199`, `p. 3–5`); absent when it took all of it. */
  range?: string
  /** The subagent an Agent call ran, on that call's result. */
  agentId?: string
  /** Set on a tool result the tool reported as an error. */
  isError?: true
  /** Estimated: the step's measured new tokens, split by each item's share of characters. */
  tokens: number
  loop: Loop
  /** The main-conversation prompt it arrived under, from 1. */
  turn: number
  /** The loop's step it entered at; it stays resident until the loop compacts. */
  seq: number
  epoch: number
}

/** One model request, as measured by the API. */
export type Step = {
  loop: Loop
  turn: number
  /** The request's position in its own turn, from 1. */
  index: number
  action: string
  context: number
  added: number
  recached: number
  output: number
  /** The output less the visible text and tool arguments it streamed (0 without thinking), unless `thinkingExact`. */
  thinking: number
  /** Set once the session's transcript gave the request's exact thinking count. */
  thinkingExact?: true
  /** Every input token the request carried: what the loop's window held. */
  prompt: number
  /** What the request left in the cache (read plus write): the next one should read it back. */
  cached: number
  seq: number
  epoch: number
}

export type Turn = { number: number; text: string }

/** A loop's context summarized, under the prompt it happened in; sizes when core recorded them. */
export type Compaction = { loop: Loop; turn: number; before?: number; after?: number }

/** What a Ledger saves: everything else it derives from these. */
export type LedgerData = {
  version: number
  turns: Turn[]
  steps: Step[]
  items: Item[]
  compactions: Compaction[]
  fixed: Record<Loop, number>
}

type Pending = Pick<Item, 'kind' | 'label' | 'tool' | 'key' | 'range' | 'agentId' | 'isError'> & { chars: number }

/** What `Ledger.toolResult` takes beyond the call itself, each only when it applies. */
export type ToolResultDetails = Pick<Item, 'range' | 'agentId' | 'isError'>

/** What `Ledger.step` takes: the API's figures for one request; the ledger numbers it. */
export type StepArgs = Pick<
  Step,
  'loop' | 'index' | 'action' | 'context' | 'added' | 'recached' | 'output' | 'thinking' | 'cached'
>

/**
 * The session's requests and what entered each loop's context: `/tokens` reads
 * it, `/clear` empties it, and it saves as LedgerData so a resume picks it up.
 *
 * A request's new tokens are exact; how they split between the items that
 * arrived with it is estimated. The previous reply takes its exact output
 * count, the rest goes to prompts and tool results by share of characters.
 *
 * Items waiting for the next request are not saved: a restart loses at most
 * the tool results of a request that never went out.
 */
export class Ledger {
  readonly turns: Turn[]
  readonly steps: Step[]
  readonly items: Item[]
  readonly compactions: Compaction[]
  /** Each loop's fixed overhead: its first request less the items that came with it. */
  readonly fixed: Map<Loop, number>
  private readonly pending = new Map<Loop, Pending[]>()
  private readonly sending = new Map<Loop, Pending[]>()

  constructor(data?: LedgerData) {
    const saved = data?.version === DATA_VERSION ? data : undefined
    this.turns = saved?.turns ?? []
    this.steps = saved?.steps ?? []
    this.items = saved?.items ?? []
    this.compactions = saved?.compactions ?? []
    this.fixed = new Map(Object.entries(saved?.fixed ?? {}))
  }

  toData(): LedgerData {
    return {
      version: DATA_VERSION,
      turns: this.turns,
      steps: this.steps,
      items: this.items,
      compactions: this.compactions,
      fixed: Object.fromEntries(this.fixed),
    }
  }

  /** The prompt in progress, which a subagent's requests count under too. */
  get currentTurn(): number {
    return this.turns.length
  }

  /** The main loop's last compaction, until its next request shows the window again. */
  get mainCompaction(): Compaction | null {
    const last = this.lastStepOf(MAIN)
    const compaction = this.compactions.filter(entry => entry.loop === MAIN).at(-1)
    return compaction && (!last || last.epoch < this.epochOf(MAIN)) ? compaction : null
  }

  /** What the loop's last request left in the cache; nothing once the loop compacted since. */
  lastCached(loop: Loop): number | undefined {
    return this.currentStepOf(loop)?.cached
  }

  startTurn(text: string) {
    const number = this.turns.length + 1
    this.turns.push({ number, text })
    if (text !== '') this.queue(MAIN, { kind: 'prompt', label: `prompt #${number}`, chars: text.length })
  }

  toolResult(loop: Loop, tool: string, key: string, chars: number, details: ToolResultDetails = {}) {
    const label = key === '' ? tool : `${tool} ${key}`
    this.queue(loop, { kind: 'tool', label, tool, key, ...details, chars })
  }

  /**
   * A request is about to go out: it carries what is pending now. A tool can
   * finish while the response still streams; its result rides the next request.
   */
  beginStep(loop: Loop) {
    this.sending.set(loop, this.pending.get(loop) ?? [])
    this.pending.delete(loop)
  }

  step(args: StepArgs): Step {
    const { loop } = args
    const previous = this.currentStepOf(loop)
    const seq = (this.lastStepOf(loop)?.seq ?? 0) + 1
    const epoch = this.epochOf(loop)
    const turn = this.currentTurn
    const step: Step = { ...args, turn, prompt: args.context + args.added + args.recached, seq, epoch }
    this.steps.push(step)

    const arrived = this.sending.get(loop) ?? []
    this.sending.delete(loop)
    const place = (item: Pick<Item, 'kind' | 'label' | 'tool' | 'key' | 'range' | 'agentId' | 'isError' | 'tokens'>) => {
      this.items.push({ ...item, loop, turn, seq, epoch })
    }
    if (!this.fixed.has(loop)) {
      const estimated = arrived.reduce((sum, item) => sum + estimateTokens(item.chars), 0)
      this.fixed.set(loop, Math.max(step.prompt - estimated, 0))
      for (const { chars, ...item } of arrived) place({ ...item, tokens: estimateTokens(chars) })
      return step
    }

    const reply = Math.min(previous?.output ?? 0, args.added)
    if (previous && reply > 0) place({ kind: 'reply', label: `reply #${previous.turn}.${previous.index}`, tokens: reply })
    const budget = args.added - reply
    const chars = arrived.reduce((sum, item) => sum + item.chars, 0)
    for (const { chars: itemChars, ...item } of arrived) {
      const tokens = budget > 0 && chars > 0 ? Math.round((budget * itemChars) / chars) : estimateTokens(itemChars)
      place({ ...item, tokens })
    }
    return step
  }

  /**
   * The loop's context was summarized: what it held stops being resident, and
   * the summary arrives with the loop's next request, sized in characters so it
   * takes its share of that request's new tokens like any other item.
   */
  compacted(loop: Loop, before?: number, after?: number) {
    this.compactions.push({ loop, turn: this.currentTurn, before, after })
    this.pending.delete(loop)
    if (after !== undefined) {
      this.queue(loop, { kind: 'summary', label: 'compaction summary', chars: after * CHARS_PER_TOKEN })
    }
  }

  /** Steps of the item's loop since it entered, until that loop compacted. */
  residentSteps(item: Item): number {
    return this.steps.filter(
      step => step.loop === item.loop && step.epoch === item.epoch && step.seq > item.seq,
    ).length
  }

  isResident(item: Item): boolean {
    return item.epoch === this.epochOf(item.loop)
  }

  reset() {
    for (const list of [this.turns, this.steps, this.items, this.compactions]) list.length = 0
    for (const map of [this.fixed, this.pending, this.sending]) map.clear()
  }

  private epochOf(loop: Loop): number {
    return this.compactions.filter(entry => entry.loop === loop).length
  }

  private lastStepOf(loop: Loop): Step | undefined {
    return this.steps.findLast(step => step.loop === loop)
  }

  /** The loop's last request, unless the loop compacted after it. */
  private currentStepOf(loop: Loop): Step | undefined {
    const last = this.lastStepOf(loop)
    return last && last.epoch === this.epochOf(loop) ? last : undefined
  }

  private queue(loop: Loop, item: Pending) {
    const list = this.pending.get(loop) ?? []
    list.push(item)
    this.pending.set(loop, list)
  }
}
