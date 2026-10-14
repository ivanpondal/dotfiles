import { MAIN, type StepArgs } from '../../hooks/ledger'

/** One request's figures: a main-loop answer with nothing in it, but for `fields`. */
export function request(fields: Partial<StepArgs>): StepArgs {
  return { loop: MAIN, index: 1, action: 'answer', context: 0, added: 0, recached: 0, output: 0, thinking: 0, cached: 0, ...fields }
}
