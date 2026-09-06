import { readFile, writeFile } from 'node:fs/promises'
const [input, output, beforePath] = process.argv.slice(2)
if (!input || !output)
  throw new Error(
    'Supply input artifact and output path; optional baseline artifact for comparison',
  )
const median = (values) => {
  const sorted = values
    .filter((x) => x !== null && Number.isFinite(x))
    .sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}
function summarize(artifact) {
  return Object.fromEntries(
    [...new Set(artifact.samples.map((s) => s.kind))].map((kind) => {
      const samples = artifact.samples.filter((s) => s.kind === kind)
      const api = (requests) =>
        requests.filter((r) => ['XHR', 'Fetch'].includes(r.type))
      return [
        kind,
        {
          samples: samples.length,
          usefulMedianMs: median(samples.map((s) => s.firstUsefulMs)),
          chartMedianMs: median(samples.map((s) => s.chartReadyMs)),
          browserRequestCountMedian: median(
            samples.map((s) => s.requests.length),
          ),
          apiRequestCountMedian: median(
            samples.map((s) => api(s.requests).length),
          ),
          transferredBytesMedian: median(
            samples.map((s) =>
              s.requests.reduce((n, r) => n + (r.transferBytes ?? 0), 0),
            ),
          ),
          apiTransferredBytesMedian: median(
            samples.map((s) =>
              api(s.requests).reduce((n, r) => n + (r.transferBytes ?? 0), 0),
            ),
          ),
          preparationApiCountMedian: median(
            samples.map((s) =>
              s.preparation ? api(s.preparation.requests).length : null,
            ),
          ),
          preparationTransferredBytesMedian: median(
            samples.map((s) =>
              s.preparation
                ? s.preparation.requests.reduce(
                    (n, r) => n + (r.transferBytes ?? 0),
                    0,
                  )
                : null,
            ),
          ),
          ordinaryCls: samples.map((s) => s.ordinaryCls),
          interactionShiftSum: samples.map((s) => s.interactionShiftSum),
          shiftEntries: samples.map((s) => s.timing.shifts.length),
          anchorChangeEntries: samples.map(
            (s) => s.timing.anchorChanges.length,
          ),
          errorCount: samples.reduce(
            (n, s) =>
              n +
              s.runtimeErrors.length +
              s.timing.errors.length +
              s.requests.filter(
                (r) => r.status >= 400 || (r.error && !r.canceled),
              ).length,
            0,
          ),
        },
      ]
    }),
  )
}
const artifact = JSON.parse(await readFile(input, 'utf8'))
const summary = summarize(artifact)
const result = {
  schemaVersion: 1,
  profile: artifact.profile,
  buildLabel: artifact.buildLabel,
  summary,
}
if (beforePath) {
  const before = summarize(JSON.parse(await readFile(beforePath, 'utf8')))
  result.comparison = Object.fromEntries(
    Object.entries(summary).map(([kind, after]) => {
      const old = before[kind]
      const delta = old ? after.usefulMedianMs - old.usefulMedianMs : null
      return [
        kind,
        {
          usefulDeltaMs: delta,
          usefulDeltaPercent: old ? (delta / old.usefulMedianMs) * 100 : null,
          coldRegressionNeedsInvestigation:
            kind.startsWith('cold-') &&
            delta > 50 &&
            delta > old.usefulMedianMs * 0.1,
          transferredBytesDelta: old
            ? after.transferredBytesMedian - old.transferredBytesMedian
            : null,
          apiRequestCountDelta: old
            ? after.apiRequestCountMedian - old.apiRequestCountMedian
            : null,
        },
      ]
    }),
  )
}
await writeFile(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
