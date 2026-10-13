import { describe, expect, test, tier } from 'claude-code/testing'

import { Ledger, MAIN } from '../hooks/ledger'
import { filesDetail, outputOf, overview, turnDetail } from '../hooks/report'
import { request } from './fixtures/request'

tier('user')

/** A session that read three files: one then edited, one twice in parts, one then overwritten. */
function readThree(): Ledger {
  const ledger = new Ledger()
  ledger.startTurn('work')
  ledger.beginStep(MAIN)
  ledger.step(request({ action: 'Read×3', added: 20_000, cached: 20_000 }))
  ledger.toolResult(MAIN, 'Read', 'edited.ts', 4_000)
  ledger.toolResult(MAIN, 'Read', 'parts.ts', 2_000, { range: '1–100' })
  ledger.toolResult(MAIN, 'Read', 'written.ts', 2_000)
  ledger.beginStep(MAIN)
  ledger.step(request({ index: 2, action: 'Edit, Write, Read', context: 20_000, added: 2_000, cached: 22_000 }))
  ledger.toolResult(MAIN, 'Edit', 'edited.ts', 400)
  ledger.toolResult(MAIN, 'Write', 'written.ts', 400)
  ledger.toolResult(MAIN, 'Read', 'parts.ts', 2_000, { range: '101–200' })
  ledger.beginStep(MAIN)
  ledger.step(request({ index: 3, context: 22_000, added: 700, cached: 22_700 }))
  return ledger
}

describe('report', () => {
  test('a prompt row stacks re-cached input and new input in its bar', async () => {
    const ledger = new Ledger()
    ledger.startTurn('first')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))
    ledger.startTurn('second')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 2_000, recached: 2_000, cached: 24_000 }))

    const lines = overview(ledger, undefined, '/work')

    const rowOf = (prompt: string) => lines.find(line => line.includes(`"${prompt}"`)) ?? ''
    expect(rowOf('first')).toContain(`—        —   20.0k / 20.0k       —         —  ${'█'.repeat(20)}`)
    expect(rowOf('second')).toContain(`2.0k        —     2.0k / 4.0k       —         —  ${'▒'.repeat(2)}${'█'.repeat(2)} `)
  })

  test('the tokens line reads like a step line, misses counted only when there were some', async () => {
    const ledger = new Ledger()
    ledger.startTurn('first')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))

    const clean = overview(ledger, undefined, '/work')
    ledger.startTurn('second')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 500, recached: 6_900, cached: 27_400 }))
    const missed = overview(ledger, undefined, '/work')

    const tokensLine = (lines: string[]) => lines.find(line => line.startsWith('tokens')) ?? ''
    expect(clean[0]).toBe('window   20.0k now · fixed ~20.0k')
    expect(tokensLine(clean)).toBe('tokens   in 20.0k new · out 0')
    expect(tokensLine(missed)).toBe('tokens   in 6.9k re-cached + 20.5k new / 27.4k · out 0 (1 cache miss)')
  })

  test('a prompt row shows what its steps read back from the cache', async () => {
    const ledger = new Ledger()
    ledger.startTurn('warm start')
    ledger.beginStep(MAIN)
    ledger.step(request({ context: 17_700, added: 9_500, cached: 27_200 }))

    const lines = overview(ledger, undefined, '/work')

    const row = lines.find(line => line.includes('"warm start"')) ?? ''
    expect(row).toContain('17.7k    9.5k / 27.2k')
  })

  test('steps recorded before the first prompt get a row and a detail of their own', async () => {
    const ledger = new Ledger()
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 13, context: 190_000, added: 2_000, cached: 192_000 }))
    ledger.startTurn('next')
    ledger.beginStep(MAIN)
    ledger.step(request({ context: 192_000, added: 300, cached: 192_300 }))

    const lines = overview(ledger, undefined, '/work')
    const detail = turnDetail(ledger, 0)

    expect(lines.find(line => line.includes('(before recording began)'))).toMatch(/^ {2}0 {2}\(before recording began\)/)
    expect(detail[0]).toBe('#0 (before recording began)')
    expect(detail.find(line => line.startsWith('  #0.13'))).toBeDefined()
  })

  test("a prompt row shows its steps' output, and how much of it was thinking", async () => {
    const ledger = new Ledger()
    ledger.startTurn('pondered')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Read', added: 20_000, output: 900, thinking: 800, cached: 20_000 }))
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 1_000, output: 500, thinking: 400, cached: 21_000 }))
    ledger.startTurn('quick')
    ledger.beginStep(MAIN)
    ledger.step(request({ context: 21_000, added: 600, output: 20, cached: 21_600 }))

    const lines = overview(ledger, undefined, '/work')

    const rowOf = (prompt: string) => lines.find(line => line.includes(`"${prompt}"`)) ?? ''
    expect(rowOf('pondered')).toMatch(/ 1\.4k +86% {2}/)
    expect(rowOf('quick')).toMatch(/ 20 +— {2}/)
  })

  test('a thinking hotspot names the largest thing that arrived before it, errors flagged', async () => {
    const ledger = new Ledger()
    ledger.startTurn('fix the tests')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Bash, Read', added: 20_000, output: 100, cached: 20_000 }))
    ledger.toolResult(MAIN, 'Bash', 'flutter test', 4_000, { isError: true })
    ledger.toolResult(MAIN, 'Read', 'lib/main.dart', 1_000)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 1_350, output: 1_500, thinking: 1_400, cached: 21_350 }))

    const lines = overview(ledger, undefined, '/work')

    const hotspots = lines.slice(lines.findIndex(line => line.includes('thinking hotspots')) + 1)
    expect(hotspots[0]).toContain('#1.2 answer')
    expect(hotspots[0]).toContain('1.4k  Bash flutter test (error) 1.0k +1 more')
    expect(hotspots[1]).toBe('')
  })

  test('a long hotspot trigger is cut to the label width', async () => {
    const ledger = new Ledger()
    ledger.startTurn('build it')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Bash', added: 20_000, output: 100, cached: 20_000 }))
    ledger.toolResult(MAIN, 'Bash', `flutter test ${'--dart-define=FLAG=on '.repeat(10)}`, 400)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 200, output: 900, thinking: 800, cached: 20_200 }))

    const lines = overview(ledger, undefined, '/work')

    const hotspot = lines[lines.findIndex(line => line.includes('thinking hotspots')) + 1] ?? ''
    expect(hotspot).toContain('Bash flutter test --dart-define=FLAG=on… 100')
    expect(hotspot.length).toBeLessThan(110)
  })

  test('the files in the main window say what came after each was read', async () => {
    const lines = overview(readThree(), undefined, '/work')

    const start = lines.findIndex(line => line.includes('files in the main window'))
    const section = lines.slice(start, lines.indexOf('', start))
    expect(section[0]).toMatch(/files in the main window +reads {2}tokens {2}carried {2}after$/)
    expect(section[1]).toMatch(/^ {2}edited\.ts +1 +1\.0k +1\.0k {2}edited$/)
    expect(section[2]).toMatch(/^ {2}parts\.ts +2 +1\.0k +500 {2}read ×2, partial$/)
    expect(section[3]).toMatch(/^ {2}written\.ts +1 +500 +500 {2}written, 500 superseded$/)
    expect(section[4]).toBe('  3 files · 2.5k now · 500 superseded')
  })

  test('the files section stays out of a session that read nothing', async () => {
    const ledger = new Ledger()
    ledger.startTurn('hi')
    ledger.beginStep(MAIN)
    ledger.step(request({ added: 20_000, cached: 20_000 }))

    const lines = overview(ledger, undefined, '/work')

    expect(lines.some(line => line.includes('files in the main window'))).toBe(false)
  })

  test('the files detail lists each read with its range, and what changed the file', async () => {
    const detail = filesDetail(readThree())

    expect(detail[0]).toBe('3 files read · 3 in the main window · 2.5k now · 500 superseded · 2.0k carried')
    const at = (path: string) => detail.findIndex(line => line.startsWith(`  ${path}`))
    expect(detail[at('edited.ts')]).toMatch(/1\.0k now · 1\.0k carried · edited$/)
    expect(detail.slice(at('parts.ts') + 1, at('parts.ts') + 3)).toEqual(['      #1 1–100 ~500', '      #1 101–200 ~500'])
    expect(detail[at('written.ts') + 1]).toBe('      #1 ~500 superseded')
    expect(detail[at('written.ts') + 2]).toBe('      then Write #1')
  })

  test('a file compacted out of the window is still in the detail, marked', async () => {
    const ledger = readThree()
    ledger.compacted(MAIN, 22_700, 2_000)

    const detail = filesDetail(ledger)

    expect(detail[0]).toContain('3 files read · 0 in the main window')
    expect(detail.find(line => line.startsWith('  edited.ts'))).toContain('⟲ compacted')
    expect(overview(ledger, undefined, '/work').some(line => line.includes('files in the main window'))).toBe(false)
  })

  test('the files detail says so when nothing was read', async () => {
    expect(filesDetail(new Ledger())).toEqual(['files: no file read in the main window yet'])
  })

  test("a prompt's detail is a map of its steps, then each step with what it brought in", async () => {
    const ledger = new Ledger()
    ledger.startTurn('plan it')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Bash', added: 20_000, output: 200, cached: 20_000 }))
    ledger.toolResult(MAIN, 'Bash', 'git ls-files', 1_600)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, action: 'Write', context: 20_000, added: 600, output: 10_000, thinking: 6_000, cached: 20_600 }))
    ledger.toolResult(MAIN, 'Write', 'plan.md', 400)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 3, context: 20_000, added: 10_100, recached: 600, output: 80, cached: 30_700 }))

    const detail = turnDetail(ledger, 1)

    expect(detail[0]).toBe('#1 "plan it"')
    expect(detail[1]).toBe('window   20.0k → 30.7k · 3 steps')
    expect(detail[2]).toBe('tokens   in 600 re-cached + 40.0k cached + 30.7k new / 71.3k · out 10.3k (58% thinking) (1 cache miss)')
    expect(detail[3]).toBe('')
    expect(detail[4]).toMatch(/^ {2}# +action +re-cached {3}cached {8}new \/ in {5}out {2}thinking {2}▒ re-cached █ new/)
    const row = (at: string) => detail.find(line => line.startsWith(`  ${at} `)) ?? ''
    expect(row('#1.1')).toMatch(/Bash +— +— +20\.0k \/ 20\.0k +200 +— {2}█{20} *$/)
    expect(row('#1.2')).toMatch(/Write +— +20\.0k +600 \/ 20\.6k +10\.0k +60% {2}█ *$/)
    expect(row('#1.3')).toMatch(/answer +600 +20\.0k +10\.1k \/ 30\.7k +80 +— {2}▒█{10} *$/)
    expect(detail[detail.indexOf(row('#1.3')) + 1]).toBe('')
    const breakdown = detail.slice(detail.indexOf(row('#1.3')) + 2)
    expect(breakdown.slice(-3)).toEqual([
      '  step 3 · answer · in 600 re-cached + 20.0k cached + 10.1k new / 30.7k · out 80',
      '      + reply #1.2 ~10.0k',
      '      + Write plan.md ~100',
    ])
    expect(breakdown.filter(line => line.startsWith('  step'))).toHaveLength(3)
  })

  test("a prompt's breakdown spells out a long item in full, a huge one cut at a generous length", async () => {
    const command = 'cd /Users/someone/Projects/a-long-project-name && flutter test test/some/deep/path_test.dart'
    const ledger = new Ledger()
    ledger.startTurn('test it')
    ledger.beginStep(MAIN)
    ledger.step(request({ action: 'Bash×2', added: 20_000, cached: 20_000 }))
    ledger.toolResult(MAIN, 'Bash', command, 400)
    ledger.toolResult(MAIN, 'Bash', `cat <<'EOF'\n${'x'.repeat(1_000)}\nEOF`, 400)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 2, context: 20_000, added: 200, cached: 20_200 }))

    const detail = turnDetail(ledger, 1)

    expect(detail).toContain(`      + Bash ${command} ~100`)
    const huge = detail.find(line => line.includes("cat <<'EOF' x")) ?? ''
    expect(huge).toMatch(/x… ~100$/)
    expect(huge.length).toBeLessThan(320)
  })

  test('output reads with its share of thinking, a sliver as under 1%, none left out', async () => {
    expect(outputOf(1_400, 1_300)).toBe('out 1.4k (93% thinking)')
    expect(outputOf(1_000, 3)).toBe('out 1.0k (<1% thinking)')
    expect(outputOf(1_000, 0)).toBe('out 1.0k')
  })

  test('the files detail counts repeated changes in one prompt once', async () => {
    const ledger = readThree()
    ledger.toolResult(MAIN, 'Edit', 'edited.ts', 100)
    ledger.toolResult(MAIN, 'Edit', 'edited.ts', 100)
    ledger.beginStep(MAIN)
    ledger.step(request({ index: 4, context: 22_700, added: 100, cached: 22_800 }))
    ledger.startTurn('again')
    ledger.toolResult(MAIN, 'Edit', 'edited.ts', 100)
    ledger.beginStep(MAIN)
    ledger.step(request({ context: 22_800, added: 100, cached: 22_900 }))

    const detail = filesDetail(ledger)

    expect(detail[detail.findIndex(line => line.startsWith('  edited.ts')) + 2]).toBe('      then Edit #1 ×3 · Edit #2')
  })
})
