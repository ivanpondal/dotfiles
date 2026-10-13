import { type Loop, MAIN } from './ledger'

/** One line drawn beneath a row, a step's or a turn's total, and the loop it describes. */
export type StepLine = { kind: 'step' | 'total'; loop: Loop; text: string }

/**
 * Where each line is drawn: a step's under the row of the first tool its
 * request called, a subagent step's under the Agent call that ran it, and an
 * answering step's and the turn's total under the reply that ended the turn.
 *
 * A subagent's steps can land before its Agent call returns the agent's id;
 * they wait here until `linkAgent` names the row. An answering step's turn is
 * matched to its reply by text once the turn completes, and the first message
 * row that matches keeps it, so two turns that end alike each keep their own.
 * Kept in memory: rows drawn before a restart lose their lines.
 */
export class Anchors {
  private readonly byToolUse = new Map<string, StepLine[]>()
  private readonly agentRow = new Map<Loop, string>()
  private readonly waitingForAgent = new Map<Loop, StepLine[]>()
  private answering: StepLine[] = []
  private readonly replies: { answer: string; lines: StepLine[]; row?: string }[] = []

  /** A step that called tools: its line goes under the first call's row. */
  toolStep(toolUseId: string, line: StepLine) {
    if (line.loop !== MAIN) return this.agentStep(line)
    this.push(this.byToolUse, toolUseId, line)
  }

  /** A main-loop step that only answered: its line waits for the turn's reply. */
  answerStep(line: StepLine) {
    if (line.loop !== MAIN) return this.agentStep(line)
    this.answering.push(line)
  }

  /** The Agent call `toolUseId` ran subagent `loop`: its lines go under that row. */
  linkAgent(loop: Loop, toolUseId: string) {
    this.agentRow.set(loop, toolUseId)
    for (const line of this.waitingForAgent.get(loop) ?? []) this.push(this.byToolUse, toolUseId, line)
    this.waitingForAgent.delete(loop)
  }

  /**
   * The main turn ended with `answer`: the answering steps' lines, then
   * `total`, go under it. False when there is no reply text to draw them under.
   */
  turnAnswered(answer: string, total: StepLine): boolean {
    const lines = [...this.answering, total]
    this.answering = []
    if (answer.trim() === '') return false
    this.replies.push({ answer: answer.trimEnd(), lines })
    return true
  }

  linesForToolUse(toolUseId: string): StepLine[] {
    return this.byToolUse.get(toolUseId) ?? []
  }

  /** The lines of the turn whose reply ends with message row `requestId`'s text. */
  linesForMessage(requestId: string, text: string): StepLine[] {
    const kept = this.replies.find(reply => reply.row === requestId)
    if (kept) return kept.lines
    const block = text.trimEnd()
    if (block === '') return []
    const reply = this.replies.find(entry => entry.row === undefined && entry.answer.endsWith(block))
    if (!reply) return []
    reply.row = requestId
    return reply.lines
  }

  private agentStep(line: StepLine) {
    const row = this.agentRow.get(line.loop)
    if (row === undefined) this.push(this.waitingForAgent, line.loop, line)
    else this.push(this.byToolUse, row, line)
  }

  private push<K>(map: Map<K, StepLine[]>, key: K, line: StepLine) {
    map.set(key, [...(map.get(key) ?? []), line])
  }
}
