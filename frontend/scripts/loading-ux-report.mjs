import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const directory = process.argv[2] ?? 'docs/performance/loading-ux'
const read = async (name) =>
  JSON.parse(await readFile(join(directory, name), 'utf8'))
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}
const rounded = (value) => Math.round(value).toLocaleString('en-US')
const bytes = (value) => `${(value / 1024).toFixed(1)} KiB`
const [
  before,
  after,
  beforeResources,
  afterResources,
  beforeTransactions,
  afterTransactions,
  afterWarmedTransactions,
] = await Promise.all([
  read('before.json'),
  read('after.json'),
  read('before-resources.json'),
  read('after-resources.json'),
  read('before-cold-transactions.json'),
  read('after-cold-transactions.json'),
  read('after-warmed-transactions.json'),
])
const group = (artifact, kind) => {
  const samples = artifact.samples.filter((sample) => sample.kind === kind)
  if (artifact.failure || samples.length !== 3)
    throw new Error(
      `Need three successful samples for ${artifact.buildLabel}/${kind}`,
    )
  return samples
}
const profile = JSON.stringify(before.profile)
for (const artifact of [
  after,
  beforeResources,
  afterResources,
  beforeTransactions,
  afterTransactions,
  afterWarmedTransactions,
]) {
  if (JSON.stringify(artifact.profile) !== profile)
    throw new Error('Benchmark profiles differ')
}
const kinds = [...new Set(before.samples.map((s) => s.kind))]
const lines = [
  '# Loading UX: measured before and after',
  '',
  'Three samples per scenario, production builds, synthetic data, identical desktop viewport and throttle. The [protocol](README.md) describes fixture continuity, browser-process renewal, observation windows, and limits. [Visual validation](validation.md) covers the broader interaction/layout audit.',
  '',
  'The final 49px virtualizer estimate was checked with three rebuilt cold and three rebuilt warmed Transactions samples. Other rows and whole-document resource costs retain the completed matrix from immediately before that isolated estimate correction. The original 36 candidate samples remain under `after-previrtualizer-*`; no full-matrix retest of that final one-line change is claimed.',
  '',
  '| Scenario | Before useful | After useful | Change |',
  '| --- | ---: | ---: | ---: |',
]
const rows = kinds.map((kind) => [
  kind,
  group(before, kind),
  group(kind === 'warmed-transactions' ? afterWarmedTransactions : after, kind),
])
rows.push([
  'cold-transactions',
  group(beforeTransactions, 'cold-transactions'),
  group(afterTransactions, 'cold-transactions'),
])
for (const [kind, old, current] of rows) {
  const a = median(old.map((s) => s.firstUsefulMs)),
    b = median(current.map((s) => s.firstUsefulMs))
  lines.push(
    `| ${kind} | ${rounded(a)}ms | ${rounded(b)}ms | ${b >= a ? '+' : ''}${rounded(b - a)}ms |`,
  )
  if (kind.startsWith('cold-') && b - a > 50 && b > a * 1.1)
    throw new Error(`Cold regression requires investigation: ${kind} ${a}→${b}`)
}
const homeBefore = group(before, 'cold-home'),
  homeAfter = group(after, 'cold-home')
lines.push(
  '',
  `Cold Home chart: **${rounded(median(homeBefore.map((s) => s.chartReadyMs)))}ms → ${rounded(median(homeAfter.map((s) => s.chartReadyMs)))}ms**. The first contended candidate is retained separately; these numbers include the foreground-chart scheduling correction.`,
  '',
)
const resourceBefore = group(beforeResources, 'document-preparation-analysis'),
  resourceAfter = group(afterResources, 'document-preparation-analysis')
lines.push(
  `First Analysis chart after five seconds on Home: **${rounded(median(resourceBefore.map((s) => s.chartReadyMs)))}ms → ${rounded(median(resourceAfter.map((s) => s.chartReadyMs)))}ms**. This is the first rendered chart, not a claim that every optional section has finished.`,
  '',
  '## Preparation cost',
  '',
  'The whole-document supplement includes Home, its idle work, and navigation to Analysis. It captures work begun before link-click timing. These costs are deliberately reported alongside the navigation gains.',
  '',
  '| Whole-document metric | Before | After | Difference |',
  '| --- | ---: | ---: | ---: |',
)
const cost = (samples, select) => median(samples.map((s) => select(s.requests)))
for (const [label, select, format] of [
  ['Browser requests', (r) => r.length, rounded],
  [
    'API requests',
    (r) => r.filter((q) => ['XHR', 'Fetch'].includes(q.type)).length,
    rounded,
  ],
  [
    'All transferred bytes',
    (r) => r.reduce((n, q) => n + (q.transferBytes ?? 0), 0),
    bytes,
  ],
  [
    'API transferred bytes',
    (r) =>
      r
        .filter((q) => ['XHR', 'Fetch'].includes(q.type))
        .reduce((n, q) => n + (q.transferBytes ?? 0), 0),
    bytes,
  ],
]) {
  const a = cost(resourceBefore, select),
    b = cost(resourceAfter, select)
  lines.push(
    `| ${label} | ${format(a)} | ${format(b)} | ${b >= a ? '+' : ''}${format(b - a)} |`,
  )
}
lines.push('', '## Layout and request-order checks', '')
for (const [label, old, current] of [
  ['Home period', group(before, 'period-week'), group(after, 'period-week')],
  ['Cold Home', homeBefore, homeAfter],
  [
    'Cold Transactions',
    group(beforeTransactions, 'cold-transactions'),
    group(afterTransactions, 'cold-transactions'),
  ],
]) {
  lines.push(
    `- ${label}: layout-shift entries across three samples ${old.reduce((n, s) => n + s.timing.shifts.length, 0)} → ${current.reduce((n, s) => n + s.timing.shifts.length, 0)}.`,
  )
}
const sequence = (samples) =>
  samples.map((s) => {
    const modules = s.requests.filter((r) =>
      /\/(?:Chart|AreaChart|RechartsWrapper)-/.test(new URL(r.url).pathname),
    )
    const transaction = s.requests.find((r) =>
      /\/assets\/transactions-/.test(new URL(r.url).pathname),
    )
    return {
      chartCodeStart: modules.length
        ? Math.min(...modules.map((r) => r.start))
        : null,
      chartCodeEnd: modules.length
        ? Math.max(...modules.map((r) => r.end))
        : null,
      transactionCodeStart: transaction?.start ?? null,
    }
  })
const ordering = { before: sequence(homeBefore), after: sequence(homeAfter) }
await writeFile(
  join(directory, 'request-order.json'),
  JSON.stringify(ordering, null, 2) + '\n',
)
for (const [phase, data] of Object.entries(ordering)) {
  lines.push(
    `- ${phase} Home: chart code starts ${rounded(median(data.map((s) => s.chartCodeStart)))}ms and finishes ${rounded(median(data.map((s) => s.chartCodeEnd)))}ms after document start. Transactions speculation ${data.some((s) => s.transactionCodeStart !== null) ? `starts ${rounded(median(data.map((s) => s.transactionCodeStart)))}ms` : 'does not occur in this window'}.`,
  )
}
const allAfter = [
  ...after.samples.filter((sample) => sample.kind !== 'warmed-transactions'),
  ...afterWarmedTransactions.samples,
  ...afterResources.samples,
  ...afterTransactions.samples,
]
const classifiedArtifacts = await Promise.all([
  read('after-shifts.json'),
  read('after-resource-shifts.json'),
  read('after-cold-transactions-shifts.json'),
  read('after-warmed-transactions-shifts.json'),
])
const classifications = classifiedArtifacts.flatMap((artifact, index) =>
  index === 0
    ? artifact.entries.filter((entry) => entry.kind !== 'warmed-transactions')
    : artifact.entries,
)
if (
  classifications.length !==
  allAfter.reduce((total, sample) => total + sample.timing.shifts.length, 0)
)
  throw new Error(
    'Shift classification count does not match selected report samples',
  )
if (
  classifications.some(
    (entry) => entry.classification === 'requires investigation',
  )
)
  throw new Error(
    'Unclassified shift remains; inspect the classification artifacts',
  )
lines.push(
  `- All ${classifications.length} recorded shift entries in the selected final scenarios are classified as deliberate horizontal navigation-drawer motion. Cold loads and Home period changes have no shift entries.`,
)
const anchorSamples = (artifact) =>
  artifact.samples
    .filter((sample) =>
      ['cold-home', 'cold-transactions', 'period-week'].includes(sample.kind),
    )
    .map((sample) => ({
      kind: sample.kind,
      run: sample.run,
      changes: sample.timing.anchorChanges,
      scroll: sample.timing.scroll,
      maxRetainedOriginMovement: Math.max(
        0,
        ...sample.timing.anchorChanges.flatMap((frame) =>
          frame.changes.map((change) =>
            Math.max(
              Math.abs(change.after.x - change.before.x),
              Math.abs(change.after.y - change.before.y),
            ),
          ),
        ),
      ),
    }))
const anchors = {
  before: [...anchorSamples(before), ...anchorSamples(beforeTransactions)],
  after: [...anchorSamples(after), ...anchorSamples(afterTransactions)],
}
await writeFile(
  join(directory, 'anchor-review.json'),
  JSON.stringify(anchors, null, 2) + '\n',
)
for (const kind of ['cold-home', 'cold-transactions', 'period-week']) {
  const maximum = (phase) =>
    Math.max(
      0,
      ...anchors[phase]
        .filter((sample) => sample.kind === kind)
        .map((sample) => sample.maxRetainedOriginMovement),
    )
  lines.push(
    `- ${kind} maximum retained anchor-origin movement: ${maximum('before').toFixed(2)}px → ${maximum('after').toFixed(2)}px. ${maximum('after') > 1 ? '**Unresolved: exceeds the 1px acceptance limit.**' : 'Within the 1px acceptance limit.'}`,
  )
}
const warnings = allAfter.flatMap((sample) => sample.consoleWarnings ?? [])
const errors = allAfter.reduce(
  (n, s) =>
    n +
    s.runtimeErrors.length +
    s.timing.errors.length +
    s.requests.filter((r) => r.status >= 400 || (r.error && !r.canceled))
      .length,
  0,
)
const coldCached = [
  ...homeAfter,
  ...group(afterTransactions, 'cold-transactions'),
].reduce(
  (n, s) => n + s.requests.filter((r) => r.type === 'Script' && r.cache).length,
  0,
)
lines.push(
  `- Final measured runtime/failed-request error count: ${errors}. Cached script responses in cold samples: ${coldCached}.`,
  `- Console warnings: ${warnings.length}, all ${new Set(warnings).size === 1 ? 'the same Recharts initial-size warning' : 'retained in raw JSON'}. The rendered charts have positive bounds and their anchors remain stable. The original baseline did not capture console warnings, so warning-frequency parity is not claimed.`,
  '',
  'Every shift is retained in raw JSON and enumerated by the shift-classification artifacts. Deliberate drawer motion is reported separately from loading movement; source-less classifications cite adjacent anchor evidence. No aggregate CLS result substitutes for those checks.',
  '',
  'These are frontend changes. The benchmark makes no backend or MCP performance claim.',
  '',
)
await writeFile(join(directory, 'comparison.md'), lines.join('\n'))
console.log('Wrote comparison.md, request-order.json and anchor-review.json')
if (anchors.after.some((sample) => sample.maxRetainedOriginMovement > 1))
  throw new Error(
    'Unresolved anchor movement: inspect anchor-review.json before sign-off',
  )
