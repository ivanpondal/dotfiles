import type { SessionContextBreakdown } from 'claude-code'

import type { Ledger } from './ledger'
import { filesDetail, framed, overview, turnDetail } from './report'

export const TOKENS_USAGE = 'usage: /tokens [<prompt #> | files]'

/** Which view `/tokens` was asked for: the map, one prompt, the files read, or none it knows. */
export type TokensQuery = { view: 'overview' } | { view: 'prompt'; number: number } | { view: 'files' } | { view: 'usage' }

/** `/tokens`' words: none, a prompt number (`3`, `#3`), or `files`; anything else is a usage error. */
export function parseTokens(args: string): TokensQuery {
  const words = args.trim().split(/\s+/).filter(word => word !== '')
  const [word] = words
  if (word === undefined) return { view: 'overview' }
  if (words.length > 1) return { view: 'usage' }
  if (word === 'files') return { view: 'files' }
  const number = /^#?(\d+)$/.exec(word)?.[1]
  return number === undefined ? { view: 'usage' } : { view: 'prompt', number: Number(number) }
}

/**
 * The lines `/tokens` prints for `query`, the same in a session and from a
 * saved ledger; `breakdown` is the engine's, live only.
 */
export function tokensView(
  ledger: Ledger,
  query: TokensQuery,
  breakdown: SessionContextBreakdown | undefined,
  cwd: string,
): string[] {
  switch (query.view) {
    case 'overview':
      return framed('token map', overview(ledger, breakdown, cwd))
    case 'prompt':
      return framed(`prompt #${query.number}`, turnDetail(ledger, query.number))
    case 'files':
      return framed('files read', filesDetail(ledger))
    case 'usage':
      return [TOKENS_USAGE]
  }
}
