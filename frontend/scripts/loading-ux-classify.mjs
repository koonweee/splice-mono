// Classifications are evidence summaries, never permission to ignore an unknown shift.
import { readFile, writeFile } from 'node:fs/promises'
const [input, output] = process.argv.slice(2)
const artifact = JSON.parse(await readFile(input, 'utf8'))
const entries = []
for (const sample of artifact.samples) {
  const hasHorizontalAnchors = sample.timing.anchorChanges.some((frame) =>
    frame.changes.some((a) => Math.abs(a.after.x - a.before.x) > 1),
  )
  for (const [index, shift] of sample.timing.shifts.entries()) {
    const elapsedMs = shift.at - sample.timing.start
    const vertical = shift.sources.filter(
      (s) => Math.abs(s.current.y - s.previous.y) > 1,
    )
    const horizontal = shift.sources.filter(
      (s) =>
        Math.abs(s.current.x - s.previous.x) > 1 ||
        Math.abs(s.current.width - s.previous.width) > 1,
    )
    let classification = 'requires investigation'
    let evidence = 'No matching source/anchor explanation.'
    if (
      sample.kind === 'period-week' &&
      vertical.length &&
      vertical.every(
        (s) => Math.abs(Math.abs(s.current.y - s.previous.y) - 32.296875) < 1,
      )
    ) {
      classification = 'loading: Home period status row insertion/removal'
      evidence =
        'Retained Grid/Paper and account origins move by32.296875px; no user scroll or expansion.'
    } else if (
      sample.kind !== 'period-week' &&
      !sample.kind.startsWith('cold-') &&
      elapsedMs < 750 &&
      !vertical.length &&
      (horizontal.length ||
        (shift.sources.length === 0 && hasHorizontalAnchors))
    ) {
      classification = 'intentional: navigation drawer closing'
      evidence = horizontal.length
        ? 'Only horizontal coordinates/widths change while the user-opened desktop navigation closes.'
        : 'Chrome supplied no source nodes; the same short drawer transition has horizontal anchor changes and adjacent sourced entries.'
    }
    entries.push({
      kind: sample.kind,
      run: sample.run,
      index,
      elapsedMs,
      value: shift.value,
      hadRecentInput: shift.hadRecentInput,
      classification,
      evidence,
      sources: shift.sources,
    })
  }
}
const counts = Object.fromEntries(
  [...new Set(entries.map((e) => e.classification))].map((name) => [
    name,
    entries.filter((e) => e.classification === name).length,
  ]),
)
await writeFile(
  output,
  JSON.stringify({ schemaVersion: 1, input, counts, entries }, null, 2) + '\n',
)
console.log(JSON.stringify(counts))
