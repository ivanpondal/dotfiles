import { describe, expect, test, tier } from 'claude-code/testing'

import { Ledger, MAIN } from '../hooks/ledger'
import { parseTokens, TOKENS_USAGE, tokensView } from '../hooks/tokens'
import { request } from './fixtures/request'

tier('user')

describe('tokens', () => {
  test('the words /tokens takes: none, a prompt number with or without #, files', async () => {
    expect(parseTokens('')).toEqual({ view: 'overview' })
    expect(parseTokens('  ')).toEqual({ view: 'overview' })
    expect(parseTokens('3')).toEqual({ view: 'prompt', number: 3 })
    expect(parseTokens('#12')).toEqual({ view: 'prompt', number: 12 })
    expect(parseTokens(' files ')).toEqual({ view: 'files' })
  })

  test('anything else, or more than one word, is a usage error', async () => {
    for (const args of ['100k', 'files 3', '3 4', 'file', '#']) expect(parseTokens(args)).toEqual({ view: 'usage' })
    expect(TOKENS_USAGE).toBe('usage: /tokens [<prompt #> | files]')
  })

  test('each view comes framed under its own title; a usage error comes bare', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))

    const top = (args: string) => tokensView(ledger, parseTokens(args), undefined, '/work')[0]

    expect(top('')).toMatch(/^━━ token map ━+$/)
    expect(top('1')).toMatch(/^━━ prompt #1 ━+$/)
    expect(top('files')).toMatch(/^━━ files read ━+$/)
    expect(tokensView(ledger, { view: 'usage' }, undefined, '/work')).toEqual([TOKENS_USAGE])
  })
})
