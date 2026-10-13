import type { SessionContextBreakdown } from 'claude-code'

import { type FileChange, type FileEntry, filesOf } from './files'
import { type Item, type Ledger, type Loop, MAIN, type Step, type Turn } from './ledger'

const BAR_WIDTH = 20
const LABEL_WIDTH = 40
/** Where nothing follows a label but its size: room for a whole path or command, not a heredoc's body. */
const FULL_LABEL_WIDTH = 300
const MAX_TURN_ROWS = 50
const TOP_ROWS = 8
const OVERHEAD_ROWS = 5
const RULE_WIDTH = 100

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

/**
 * `in 6.9k re-cached + 23.8k cached + 9.3k new / 40.0k`: the parts that are
 * not zero, then the total when there is more than one. Input always reads in
 * this order, wherever it is shown.
 */
export function inputOf(context: number, added: number, recached: number): string {
  const inputs = [
    [recached, 're-cached'],
    [context, 'cached'],
    [added, 'new'],
  ] as const
  const shown = inputs.filter(([count]) => count > 0).map(([count, label]) => `${compact(count)} ${label}`)
  const total = shown.length > 1 ? ` / ${compact(context + added + recached)}` : ''
  return `in ${shown.length > 0 ? shown.join(' + ') : '0'}${total}`
}

/** The lines between two heavy rules, the top one titled, so they stand apart from the step lines around them. */
export function framed(title: string, lines: readonly string[]): string[] {
  const top = `━━ ${title} `
  return [top.padEnd(RULE_WIDTH, '━'), ...lines, '━'.repeat(RULE_WIDTH)]
}

/** `73%` of `whole`, `<1%` for a sliver, `—` for none. */
function shareOf(part: number, whole: number): string {
  if (part <= 0 || whole <= 0) return '—'
  const percent = Math.round((part / whole) * 100)
  return percent === 0 ? '<1%' : `${percent}%`
}

/** `out 1.5k (73% thinking)`: the output, and how much of it was thinking; `out 1.5k` without thinking. */
export function outputOf(output: number, thinking: number): string {
  return thinking > 0 ? `out ${compact(output)} (${shareOf(thinking, output)} thinking)` : `out ${compact(output)}`
}

/**
 * `▒▒███`: re-cached input in shaded cells, then new in solid ones, both
 * against `max`, in the order input always reads. Whole cells only, so the
 * boundary between the two stays sharp.
 */
function stackedBar(recached: number, added: number, max: number): string {
  const cells = (value: number) => (max > 0 ? Math.round((value / max) * BAR_WIDTH) : 0)
  const recachedCells = cells(recached)
  const addedCells = cells(recached + added) - recachedCells
  return ('▒'.repeat(recachedCells) + '█'.repeat(addedCells)).padEnd(BAR_WIDTH)
}

/** A count, or `—` for none, so an empty column reads as empty rather than as zero work. */
function countOf(n: number): string {
  return n > 0 ? compact(n) : '—'
}

/** What a row of the map counts: one step's figures, or a prompt's summed. */
type Usage = Pick<Step, 'context' | 'added' | 'recached' | 'output' | 'thinking'>

function usageOf(steps: readonly Step[]): Usage {
  return {
    context: sum(steps, step => step.context),
    added: sum(steps, step => step.added),
    recached: sum(steps, step => step.recached),
    output: sum(steps, step => step.output),
    thinking: sum(steps, step => step.thinking),
  }
}

/** The titles over `usageColumns`. */
const USAGE_HEADER = `re-cached   cached        new / in     out  thinking  ${'▒ re-cached █ new'.padEnd(BAR_WIDTH)}`

/** A map row's input columns, its output with the share that was thinking, then its bar against `max`, beneath USAGE_HEADER. */
function usageColumns({ context, added, recached, output, thinking }: Usage, max: number): string {
  return `${countOf(recached).padStart(9)}  ${countOf(context).padStart(7)}  ${`${countOf(added)} / ${countOf(context + added + recached)}`.padStart(14)}  ${countOf(output).padStart(6)}  ${shareOf(thinking, output).padStart(8)}  ${stackedBar(recached, added, max)}`
}

/** `tokens   in … · out …`, with the cache misses counted when there were some. */
function tokensLine(steps: readonly Step[]): string {
  const { context, added, recached, output, thinking } = usageOf(steps)
  const misses = steps.filter(step => step.recached > 0).length
  const missText = misses > 0 ? ` (${misses} cache ${misses === 1 ? 'miss' : 'misses'})` : ''
  return `tokens   ${inputOf(context, added, recached)} · ${outputOf(output, thinking)}${missText}`
}

function fit(text: string, width: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return (line.length > width ? `${line.slice(0, width - 1)}…` : line).padEnd(width)
}

function sum<T>(list: readonly T[], of: (entry: T) => number): number {
  return list.reduce((total, entry) => total + of(entry), 0)
}

function at(step: Step): string {
  return `#${step.turn}.${step.index}`
}

function loopPrefix(loop: Loop): string {
  return loop === MAIN ? '' : `agent ${loop.slice(0, 8)} `
}

function peakOf(steps: readonly Step[]): Step | undefined {
  return steps.reduce<Step | undefined>((peak, step) => (peak && peak.prompt >= step.prompt ? peak : step), undefined)
}

/**
 * The session's token map: the main window's fill and what its fixed overhead
 * is made of, prefill work, one row per prompt, what sits in the window now, the
 * heaviest items over the session, tools and subagents. The engine's breakdown
 * of the fixed part is only there in a live session.
 */
export function overview(ledger: Ledger, breakdown: SessionContextBreakdown | undefined, cwd: string): string[] {
  const main = ledger.steps.filter(step => step.loop === MAIN)
  const last = main.at(-1)
  if (!last) return ['tokens: nothing recorded yet in this session']
  const sections = [
    [...windowLines(ledger, last), ...overheadLines(breakdown, cwd)],
    turnLines(ledger),
    thinkingLines(ledger),
    residentLines(ledger),
    fileLines(ledger),
    heaviestLines(ledger),
    toolLines(ledger),
    agentLines(ledger),
    ['estimated: how each request’s new tokens split between the items it brought in · /tokens <#> expands a prompt · /tokens files every file read'],
  ]
  return sections.filter(lines => lines.length > 0).flatMap((lines, index) => (index === 0 ? lines : ['', ...lines]))
}

function windowLines(ledger: Ledger, last: Step): string[] {
  const fixed = ledger.fixed.get(MAIN) ?? 0
  const compaction = ledger.mainCompaction
  const now = (() => {
    if (!compaction) return `${compact(last.prompt)} now`
    if (compaction.before === undefined || compaction.after === undefined) return 'compacted, sized on the next request'
    return `compacted (conversation ${compact(compaction.before)} → ${compact(compaction.after)})`
  })()
  return [`window   ${now} · fixed ~${compact(fixed)}`, tokensLine(ledger.steps)]
}

/** `name 1.2k · name 800`, largest first, the rest counted. */
function topOf<T>(entries: readonly T[], name: (entry: T) => string, tokens: (entry: T) => number): string {
  const sorted = [...entries].sort((a, b) => tokens(b) - tokens(a))
  const shown = sorted.slice(0, OVERHEAD_ROWS).map(entry => `${name(entry)} ${compact(tokens(entry))}`)
  const more = sorted.length > OVERHEAD_ROWS ? ` · +${sorted.length - OVERHEAD_ROWS} more` : ''
  return `${shown.join(' · ')}${more}`
}

/**
 * What the window holds by category, as the engine estimates it, and the
 * memory files, skills, MCP servers and custom agents behind the fixed part:
 * the pieces a smaller window can do without.
 */
function overheadLines(breakdown: SessionContextBreakdown | undefined, cwd: string): string[] {
  if (!breakdown) return []
  const used = breakdown.categories.filter(category => category.kind === 'used' && category.tokens > 0)
  const lines = [`  by category (engine estimate): ${topOf(used, category => category.name, category => category.tokens)}`]
  const { memoryFiles, mcpTools, agents, skills } = breakdown
  if (memoryFiles.length > 0) {
    const pathOf = (path: string) => (path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : `…/${path.split('/').slice(-2).join('/')}`)
    lines.push(`  memory files: ${topOf(memoryFiles, file => pathOf(file.path), file => file.tokens)}`)
  }
  if (skills && skills.tokens > 0) {
    const listed = `${skills.includedSkills}/${skills.totalSkills} listed, ${compact(skills.tokens)}`
    lines.push(`  skills (${listed}): ${topOf(skills.skillFrontmatter, skill => skill.name, skill => skill.tokens)}`)
  }
  const servers = new Map<string, { tools: number; tokens: number }>()
  for (const tool of mcpTools.filter(entry => entry.isLoaded)) {
    const server = servers.get(tool.serverName) ?? { tools: 0, tokens: 0 }
    servers.set(tool.serverName, { tools: server.tools + 1, tokens: server.tokens + tool.tokens })
  }
  if (servers.size > 0) {
    lines.push(`  MCP servers: ${topOf([...servers], ([name, server]) => `${name} (${server.tools})`, ([, server]) => server.tokens)}`)
  }
  if (agents.length > 0) lines.push(`  custom agents: ${topOf(agents, agent => agent.agentType, agent => agent.tokens)}`)
  return lines
}

/** Prompt #0 holds the steps recorded before the mod saw a prompt: it was loaded mid-turn. */
const BEFORE_RECORDING: Turn = { number: 0, text: '' }

/** The session's prompts, led by BEFORE_RECORDING when any step fell before the first. */
function turnsOf(ledger: Ledger): Turn[] {
  return ledger.steps.some(step => step.turn === 0) ? [BEFORE_RECORDING, ...ledger.turns] : ledger.turns
}

function promptText(turn: Turn, width: number): string {
  if (turn === BEFORE_RECORDING) return '(before recording began)'
  return turn.text === '' ? '(continuation)' : `"${fit(turn.text, width - 2).trimEnd()}"`
}

function turnLines(ledger: Ledger): string[] {
  const rows = turnsOf(ledger).map(turn => {
    const steps = ledger.steps.filter(step => step.turn === turn.number)
    return { turn, steps, usage: usageOf(steps), end: steps.filter(step => step.loop === MAIN).at(-1) }
  })
  const max = Math.max(...rows.map(row => row.usage.added + row.usage.recached))
  const shown = rows.slice(-MAX_TURN_ROWS)
  const lines = [`  #  ${'prompt'.padEnd(30)} steps  ${USAGE_HEADER}  window`]
  if (shown.length < rows.length) lines.push(`  (${rows.length - shown.length} earlier prompts)`)
  for (const { turn, steps, usage, end } of shown) {
    const isCompacted = ledger.compactions.some(entry => entry.loop === MAIN && entry.turn === turn.number)
    const mark = isCompacted ? '  ⟲ compacted' : ''
    lines.push(
      `${String(turn.number).padStart(3)}  ${fit(promptText(turn, 30), 30)} ${String(steps.length).padStart(5)}  ${usageColumns(usage, max)}  ${end ? compact(end.prompt) : '—'}${mark}`,
    )
  }
  return lines
}

/**
 * The steps that thought most, each with what arrived just before it: the
 * largest item that entered its window with it, the model's own previous reply
 * aside, since that is never what set it off.
 */
function thinkingLines(ledger: Ledger): string[] {
  const hottest = ledger.steps
    .filter(step => step.thinking > 0)
    .sort((a, b) => b.thinking - a.thinking)
    .slice(0, TOP_ROWS)
  if (hottest.length === 0) return []
  const lines = [`  ${'thinking hotspots'.padEnd(LABEL_WIDTH)} thinking  after`]
  for (const step of hottest) {
    const triggers = ledger.items
      .filter(item => item.loop === step.loop && item.seq === step.seq && item.epoch === step.epoch)
      .filter(item => item.kind !== 'reply')
      .sort((a, b) => b.tokens - a.tokens)
    const [first] = triggers
    const after = first
      ? `${fit(first.label, LABEL_WIDTH).trimEnd()}${first.isError ? ' (error)' : ''} ${compact(first.tokens)}${triggers.length > 1 ? ` +${triggers.length - 1} more` : ''}`
      : '—'
    const label = `${loopPrefix(step.loop)}${at(step)} ${step.action}`
    lines.push(`  ${fit(label, LABEL_WIDTH)} ${compact(step.thinking).padStart(8)}  ${after}`)
  }
  return lines
}

function itemLine(item: Item, columns: string): string {
  return `  ${fit(`${loopPrefix(item.loop)}${item.label}`, LABEL_WIDTH)} ${columns}`
}

function residentLines(ledger: Ledger): string[] {
  const residents = ledger.items
    .filter(item => item.loop === MAIN && ledger.isResident(item))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, TOP_ROWS)
  if (residents.length === 0) return ['  in the main window now: nothing since the last compaction']
  return [
    `  ${'in the main window now'.padEnd(LABEL_WIDTH)} tokens  steps since`,
    ...residents.map(item => itemLine(item, `${compact(item.tokens).padStart(6)}  ${String(ledger.residentSteps(item)).padStart(11)}`)),
  ]
}

/** `edited`, `written, 1.2k superseded`, `read ×3, partial`: what the reads of a file led to; '' for nothing. */
function afterOf(file: FileEntry): string {
  const parts: string[] = []
  if (file.superseded > 0) parts.push(`written, ${compact(file.superseded)} superseded`)
  else if (file.isEdited) parts.push('edited')
  if (file.reads.length > 1) parts.push(`read ×${file.reads.length}`)
  if (file.reads.some(read => read.range !== undefined)) parts.push('partial')
  return parts.join(', ')
}

/** `3 files · 2.5k now · 500 superseded`, the superseded part only when there is some. */
function fileTotals(files: readonly FileEntry[]): string {
  const superseded = sum(files, file => file.superseded)
  return `${compact(sum(files, file => file.now))} now${superseded > 0 ? ` · ${compact(superseded)} superseded` : ''}`
}

/** The files whose reads the main window still holds, largest first. */
function fileLines(ledger: Ledger): string[] {
  const resident = filesOf(ledger).filter(file => file.now > 0)
  if (resident.length === 0) return []
  return [
    `  ${'files in the main window'.padEnd(LABEL_WIDTH)} reads  tokens  carried  after`,
    ...resident
      .slice(0, TOP_ROWS)
      .map(
        file =>
          `  ${fit(file.path, LABEL_WIDTH)} ${String(file.reads.length).padStart(5)}  ${compact(file.now).padStart(6)}  ${compact(file.carried).padStart(7)}  ${afterOf(file) || '—'}`,
      ),
    `  ${resident.length} ${resident.length === 1 ? 'file' : 'files'} · ${fileTotals(resident)}`,
  ]
}

function heaviestLines(ledger: Ledger): string[] {
  const heaviest = ledger.items
    .map(item => ({ item, steps: ledger.residentSteps(item) }))
    .filter(({ steps }) => steps > 0)
    .sort((a, b) => b.item.tokens * b.steps - a.item.tokens * a.steps)
    .slice(0, TOP_ROWS)
  if (heaviest.length === 0) return []
  return [
    `  ${'heaviest over the session'.padEnd(LABEL_WIDTH)} tokens × steps = carried`,
    ...heaviest.map(({ item, steps }) =>
      itemLine(item, `${compact(item.tokens).padStart(6)} × ${String(steps).padStart(5)} = ${compact(item.tokens * steps)}`),
    ),
  ]
}

function toolLines(ledger: Ledger): string[] {
  const byTool = new Map<string, Item[]>()
  for (const item of ledger.items) {
    if (item.kind !== 'tool' || item.tool === undefined) continue
    const tool = item.tool
    byTool.set(tool, [...(byTool.get(tool) ?? []), item])
  }
  if (byTool.size === 0) return []
  const rows = [...byTool].sort(([, a], [, b]) => sum(b, item => item.tokens) - sum(a, item => item.tokens))
  return [
    `  ${'tool'.padEnd(14)} calls  tokens     max  repeated`,
    ...rows.map(([tool, items]) => {
      const max = Math.max(...items.map(item => item.tokens))
      return `  ${fit(tool, 14)} ${String(items.length).padStart(5)}  ${compact(sum(items, item => item.tokens)).padStart(6)}  ${compact(max).padStart(6)}  ${repeatOf(items)}`
    }),
  ]
}

/** The tool's most costly repeat: the same key called again, and the tokens the repeats brought. */
function repeatOf(items: readonly Item[]): string {
  const byKey = new Map<string, Item[]>()
  for (const item of items) {
    if (!item.key) continue
    const key = item.key
    byKey.set(key, [...(byKey.get(key) ?? []), item])
  }
  const repeats = [...byKey]
    .filter(([, calls]) => calls.length > 1)
    .map(([key, calls]) => ({ key, count: calls.length, extra: sum(calls.slice(1), call => call.tokens) }))
    .sort((a, b) => b.extra - a.extra)
  const worst = repeats[0]
  if (!worst) return ''
  const more = repeats.length > 1 ? ` (+${repeats.length - 1} more)` : ''
  return `${fit(worst.key, 30).trimEnd()} ×${worst.count} (+${compact(worst.extra)})${more}`
}

function agentLines(ledger: Ledger): string[] {
  const loops = [...new Set(ledger.steps.map(step => step.loop))].filter(loop => loop !== MAIN)
  if (loops.length === 0) return []
  const lines = [`  ${'subagent'.padEnd(LABEL_WIDTH)} steps  re-cached   cached     new  window  returned  kept out of main`]
  for (const loop of loops) {
    const steps = ledger.steps.filter(step => step.loop === loop)
    const call = ledger.items.find(item => item.agentId === loop)
    const peak = peakOf(steps)?.prompt ?? 0
    const returned = call?.tokens
    const label = `${loop.slice(0, 8)} ${call?.key ?? ''}`
    // What the subagent took in after its first request, less what it handed back: its own
    // system prompt and task would never have sat in the main window.
    const took = peak - (ledger.fixed.get(loop) ?? 0)
    const kept = returned === undefined ? '—' : `~${compact(Math.max(took - returned, 0))}`
    lines.push(
      `  ${fit(label, LABEL_WIDTH)} ${String(steps.length).padStart(5)}  ${countOf(sum(steps, step => step.recached)).padStart(9)}  ${countOf(sum(steps, step => step.context)).padStart(7)}  ${countOf(sum(steps, step => step.added)).padStart(6)}  ${compact(peak).padStart(6)}  ${(returned === undefined ? '—' : compact(returned)).padStart(8)}  ${kept}`,
    )
  }
  return lines
}

/**
 * One prompt as the map draws the session: how the main window grew, its
 * tokens, a row per request in order, subagents' included, the bars against
 * the prompt's own largest; then each request with what it brought into its window.
 */
export function turnDetail(ledger: Ledger, number: number): string[] {
  const turn = turnsOf(ledger).find(entry => entry.number === number)
  if (!turn) return [`tokens: no prompt #${number} recorded (1–${ledger.turns.length})`]
  const steps = ledger.steps.filter(entry => entry.turn === number)
  const main = steps.filter(step => step.loop === MAIN)
  const [first] = main
  const last = main.at(-1)
  const window = !first || !last ? '—' : first === last ? compact(last.prompt) : `${compact(first.prompt)} → ${compact(last.prompt)}`
  const max = Math.max(0, ...steps.map(step => step.added + step.recached))
  const lines = [
    `#${number} ${promptText(turn, 72)}`,
    `window   ${window} · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`,
    tokensLine(steps),
    '',
    `  ${'#'.padEnd(6)} ${'action'.padEnd(30)} ${USAGE_HEADER}`.trimEnd(),
  ]
  for (const step of steps) {
    lines.push(`  ${at(step).padEnd(6)} ${fit(`${loopPrefix(step.loop)}${step.action}`, 30)} ${usageColumns(step, max)}`.trimEnd())
  }
  lines.push('')
  for (const step of steps) {
    lines.push(
      `  ${loopPrefix(step.loop)}step ${step.index} · ${step.action} · ${inputOf(step.context, step.added, step.recached)} · ${outputOf(step.output, step.thinking)}`,
    )
    const arrived = ledger.items.filter(item => item.loop === step.loop && item.seq === step.seq && item.epoch === step.epoch)
    for (const item of arrived) lines.push(`      + ${fit(item.label, FULL_LABEL_WIDTH).trimEnd()} ~${compact(item.tokens)}`)
  }
  return lines
}

/** `Edit #3 ×4 · Write #5`: the changes in order, a run of one tool in one prompt counted once. */
function changesOf(changes: readonly FileChange[]): string {
  const runs: { change: FileChange; count: number }[] = []
  for (const change of changes) {
    const last = runs.at(-1)
    if (last && last.change.tool === change.tool && last.change.turn === change.turn) last.count += 1
    else runs.push({ change, count: 1 })
  }
  return runs.map(({ change, count }) => `${change.tool} #${change.turn}${count > 1 ? ` ×${count}` : ''}`).join(' · ')
}

/**
 * Every file the main loop read, the most carried first: each read with its
 * range and size, then the changes made to the file after it was first read.
 */
export function filesDetail(ledger: Ledger): string[] {
  const files = [...filesOf(ledger)].sort((a, b) => b.carried - a.carried)
  if (files.length === 0) return ['files: no file read in the main window yet']
  const resident = files.filter(file => file.now > 0).length
  const lines = [
    `${files.length} ${files.length === 1 ? 'file' : 'files'} read · ${resident} in the main window · ${fileTotals(files)} · ${compact(sum(files, file => file.carried))} carried`,
  ]
  for (const file of files) {
    const after = afterOf(file)
    const label = file.now > 0 ? file.path : `${file.path}  ⟲ compacted`
    lines.push(`  ${fit(label, LABEL_WIDTH)} ${compact(file.now)} now · ${compact(file.carried)} carried${after ? ` · ${after}` : ''}`)
    for (const read of file.reads) {
      const marks = [read.isSuperseded ? ' superseded' : '', !read.isResident && file.now > 0 ? ' (compacted)' : ''].join('')
      lines.push(`      #${read.turn}${read.range === undefined ? '' : ` ${read.range}`} ~${compact(read.tokens)}${marks}`)
    }
    if (file.changes.length > 0) lines.push(`      then ${changesOf(file.changes)}`)
  }
  return lines
}
