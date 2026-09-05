import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve(process.argv[2] ?? 'docs/performance')
const read = (name) =>
  readFile(resolve(directory, name + '.json'), 'utf8').then(JSON.parse)
const [
  before,
  after,
  beforeActions,
  afterActions,
  beforeBundles,
  afterBundles,
  chartBefore,
] = await Promise.all(
  [
    'baseline-cold',
    'after-cold',
    'baseline-interactions',
    'after-interactions',
    'baseline-bundles',
    'after-bundles',
    'baseline-chart',
  ].map(read),
)
function stats(values) {
  const sorted = values.toSorted((a, b) => a - b)
  if (sorted.length !== 7 || sorted.some((n) => !Number.isFinite(n)))
    throw new Error('Every comparison must contain seven finite samples')
  return {
    median: Math.round(sorted[3]),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[6]),
    samples: sorted.length,
  }
}
const report = {
  cold: [],
  chart: [],
  interactions: [],
  bundles: [],
  budgets: [],
}
for (const viewport of ['desktop', 'phone']) {
  for (const route of ['/home', '/transactions', '/accounts', '/analysis']) {
    const baseline = stats(
      before.results
        .filter((r) => r.viewport === viewport && r.route === route)
        .map((r) => r.firstUseful),
    )
    const current = stats(
      after.results
        .filter((r) => r.viewport === viewport && r.route === route)
        .map((r) => r.firstUseful),
    )
    const improvementPercent =
      Math.round((1 - current.median / baseline.median) * 1000) / 10
    report.cold.push({
      viewport,
      route,
      before: baseline,
      after: current,
      improvementPercent,
    })
    report.budgets.push({
      name: `${viewport} ${route} first useful content`,
      passed: improvementPercent >= (route === '/home' ? 25 : -10),
    })
  }
  report.chart.push({
    viewport,
    before: stats(
      chartBefore.results
        .filter((r) => r.viewport === viewport)
        .map((r) => r.chartReady),
    ),
    after: stats(
      after.results
        .filter((r) => r.viewport === viewport && r.route === '/home')
        .map((r) => r.chartReady),
    ),
  })
  for (const kind of [
    'warm-navigation',
    'period-change',
    'account-modal',
    'name-save',
  ]) {
    const rows = (data) =>
      data.results.filter((r) => r.viewport === viewport && r.kind === kind)
    const describe = (data) => ({
      duration: stats(rows(data).map((r) => r.duration)),
      requests: stats(rows(data).map((r) => r.requests.length)),
      rawResponseBytes: stats(
        rows(data).map((r) =>
          r.requests.reduce((sum, req) => sum + req.raw, 0),
        ),
      ),
    })
    report.interactions.push({
      viewport,
      kind,
      before: describe(beforeActions),
      after: describe(afterActions),
    })
  }
}
report.bundles.push({
  name: 'Main entry',
  before: beforeBundles.entry,
  after: afterBundles.entry,
})
for (const [route, value] of Object.entries(afterBundles.routes))
  report.bundles.push({
    name: route,
    before: beforeBundles.routes[route],
    after: value,
  })
report.budgets.push({
  name: 'Main entry gzip <= 300000 bytes',
  passed: afterBundles.entry.gzip <= 300000,
})
report.errors = [
  ...before.results,
  ...after.results,
  ...chartBefore.results,
].flatMap((r) => r.errors)
if (report.errors.length)
  throw new Error('Browser errors recorded: ' + JSON.stringify(report.errors))
await writeFile(
  resolve(directory, 'comparison.json'),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(
  JSON.stringify(
    {
      cold: report.cold,
      chart: report.chart,
      interactions: report.interactions,
      budgets: report.budgets,
    },
    null,
    2,
  ),
)
if (report.budgets.some((budget) => !budget.passed)) process.exitCode = 1
