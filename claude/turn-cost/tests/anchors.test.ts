import { describe, expect, test, tier } from 'claude-code/testing'

import { Anchors } from '../hooks/anchors'
import { MAIN } from '../hooks/ledger'

tier('user')

describe('anchors', () => {
  test("a step that called tools is drawn under its first call's row", async () => {
    const anchors = new Anchors()

    anchors.toolStep('call-1', { kind: 'step', loop: MAIN, text: 'step 1 · Read' })

    expect(anchors.linesForToolUse('call-1')).toEqual([{ kind: 'step', loop: MAIN, text: 'step 1 · Read' }])
    expect(anchors.linesForToolUse('call-2')).toEqual([])
  })

  test("a subagent's steps wait for its Agent call, then are drawn under it", async () => {
    const anchors = new Anchors()
    anchors.toolStep('glob-9', { kind: 'step', loop: 'agent-1', text: 'agent step 1 · Glob' })

    expect(anchors.linesForToolUse('glob-9')).toEqual([])
    anchors.linkAgent('agent-1', 'agent-call')
    anchors.answerStep({ kind: 'step', loop: 'agent-1', text: 'agent step 2 · answer' })

    expect(anchors.linesForToolUse('agent-call').map(line => line.text)).toEqual([
      'agent step 1 · Glob',
      'agent step 2 · answer',
    ])
  })

  test("an answering step and the turn's total are drawn under the reply's last block once the turn ends", async () => {
    const anchors = new Anchors()
    anchors.answerStep({ kind: 'step', loop: MAIN, text: 'step 2 · answer' })

    expect(anchors.linesForMessage('message-1', 'It is main.dart.')).toEqual([])
    const isDrawn = anchors.turnAnswered('Found it.\n\nIt is main.dart.', { kind: 'total', loop: MAIN, text: '↳ total' })

    expect(isDrawn).toBe(true)
    expect(anchors.linesForMessage('message-0', 'Found it.')).toEqual([])
    expect(anchors.linesForMessage('message-1', 'It is main.dart.').map(line => line.text)).toEqual([
      'step 2 · answer',
      '↳ total',
    ])
  })

  test('a turn with no reply text has nowhere to draw its lines', async () => {
    const anchors = new Anchors()
    anchors.answerStep({ kind: 'step', loop: MAIN, text: 'step 1 · answer' })

    const isDrawn = anchors.turnAnswered('  ', { kind: 'total', loop: MAIN, text: '↳ total' })

    expect(isDrawn).toBe(false)
    expect(anchors.linesForMessage('message-1', '  ')).toEqual([])
  })

  test('two turns that end with the same reply each keep their own lines', async () => {
    const anchors = new Anchors()
    anchors.turnAnswered('ok', { kind: 'total', loop: MAIN, text: '↳ first' })
    anchors.turnAnswered('ok', { kind: 'total', loop: MAIN, text: '↳ second' })

    const first = anchors.linesForMessage('message-1', 'ok').map(line => line.text)
    const second = anchors.linesForMessage('message-2', 'ok').map(line => line.text)

    expect([first, second]).toEqual([['↳ first'], ['↳ second']])
    expect(anchors.linesForMessage('message-1', 'ok').map(line => line.text)).toEqual(['↳ first'])
  })
})
