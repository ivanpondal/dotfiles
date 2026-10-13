import { load, savedIds, type Store } from './archive'

/** A saved session as a listing shows it: its id, the prompt it opened with, and how much it holds. */
export type SavedSession = { id: string; firstPrompt: string; prompts: number; steps: number }

/**
 * The saved sessions newest first, those with a request recorded: an empty
 * ledger, or one saved in another shape, has nothing to show.
 */
export async function savedSessions(store: Store): Promise<SavedSession[]> {
  const sessions: SavedSession[] = []
  for (const id of (await savedIds(store)).reverse()) {
    const ledger = await load(store, id)
    if (ledger.steps.length === 0) continue
    sessions.push({ id, firstPrompt: ledger.turns[0]?.text ?? '', prompts: ledger.turns.length, steps: ledger.steps.length })
  }
  return sessions
}

/** The saved session whose id starts with `prefix`; when several do, an error naming them, newest first. */
export async function findSession(store: Store, prefix: string): Promise<{ id: string } | { error: string }> {
  const matches = (await savedSessions(store)).filter(session => session.id.startsWith(prefix))
  const [match] = matches
  if (!match) return { error: `no saved session ${prefix}` }
  if (matches.length > 1) return { error: `ambiguous session ${prefix}: ${matches.map(session => session.id).join(', ')}` }
  return { id: match.id }
}
