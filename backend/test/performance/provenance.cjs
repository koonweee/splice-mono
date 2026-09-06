const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const families = [
  'main',
  'extended',
  'shape',
  'sync',
  'filters',
  'auth-settings',
  'memory',
  'mixed',
];
const defaultApproval = path.join(
  __dirname,
  '../../docs/performance/backend-query/approved-provenance.json',
);
const files = (root) =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(root, entry.name))
        : [path.join(root, entry.name)],
    )
    .sort();
function compiledHash(root) {
  const build = fs.existsSync(path.join(root, '.benchmark-build/src'))
    ? path.join(root, '.benchmark-build/src')
    : path.join(root, '.benchmark-build');
  return hash(
    JSON.stringify(
      Object.fromEntries(
        files(build)
          .filter((file) => file.endsWith('.js'))
          .map((file) => [
            path.relative(build, file),
            hash(fs.readFileSync(file)),
          ]),
      ),
    ),
  );
}
function profile(family) {
  const harness = require('./benchmark-runner.cjs');
  const capture = harness.capture.toString();
  const sampling = capture.slice(
    capture.indexOf('for (let i = 0; i < warmups; i++)'),
    capture.indexOf('for (const statement of statements)'),
  );
  if (!sampling.includes('recorder.pause()'))
    throw new Error('Cannot fingerprint benchmark sampling interval');
  const result = Object.fromEntries(
    [
      'instrument',
      'stats',
      'seed',
      'makeServices',
      'createDatabase',
      'transports',
      'workloads',
    ].map((name) => [name, hash(harness[name].toString())]),
  );
  result.sampling = hash(sampling);
  const extra = {
    extended: ['extended-workloads.cjs'],
    shape: ['shape-workloads.cjs'],
    sync: ['sync-workloads.cjs'],
    filters: ['filter-workloads.cjs'],
    'auth-settings': ['auth-settings-workloads.cjs'],
    memory: ['memory-observer.cjs', 'extended-workloads.cjs'],
    mixed: ['mixed-workload.cjs', 'sync-workloads.cjs'],
  };
  for (const file of ['schema-fixture-adapter.cjs', ...(extra[family] || [])])
    result[file] = hash(fs.readFileSync(path.join(__dirname, file)));
  return { family, components: result, hash: hash(JSON.stringify(result)) };
}
function captureProvenance(sourceRoot, family) {
  return {
    compiledHash: compiledHash(sourceRoot),
    measurement: profile(family),
  };
}
function validateReportProvenance(
  report,
  family,
  approvalFile = defaultApproval,
) {
  const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
  const expected = approval.variants[report.variant];
  if (!expected || report.source.hash !== expected.sourceHash)
    throw new Error(`Unapproved ${report.variant} application source`);
  if (
    report.variant === 'after' &&
    (!report.implementation?.applicationDatabaseMetrics ||
      (family !== 'mixed' && !report.implementation?.httpRequestMetrics))
  )
    throw new Error(
      'Final capture omitted production application instrumentation',
    );
  if (report.provenance) {
    if (
      report.provenance.compiledHash !== expected.compiledHash ||
      report.provenance.measurement.hash !== approval.profiles[family].hash ||
      !approval.approvedRunnerHashes.includes(
        report.harness?.files?.['benchmark-runner.cjs'],
      )
    )
      throw new Error(
        `Unapproved compiled output or measurement harness: ${report.variant}/${family}`,
      );
  } else {
    const runnerHash = report.harness?.files?.['benchmark-runner.cjs'];
    if (
      report.variant !== 'before' ||
      family !== 'main' ||
      !approval.legacyBeforeMainRunnerHashes.includes(runnerHash) ||
      !report.environment.instrumentation.startsWith('v2:')
    )
      throw new Error('Capture lacks approved measurement provenance');
  }
  return true;
}
function approveProvenance(args) {
  const beforeRoot = path.resolve(process.env.BENCHMARK_SOURCE_ROOT);
  const afterRoot = path.resolve(process.env.BENCHMARK_FINAL_SOURCE_ROOT);
  const harness = require('./benchmark-runner.cjs');
  const outputAt = args.indexOf('--output');
  const output =
    outputAt < 0 ? defaultApproval : path.resolve(args[outputAt + 1]);
  const directory = path.dirname(output);
  const source = (root) => hash(JSON.stringify(harness.sourceManifest(root)));
  const originalSourceHash = source(beforeRoot);
  const legacy = [];
  for (const file of fs
    .readdirSync(directory)
    .filter((file) => /^before-\d+-run\d+\.json$/.test(file))) {
    const report = JSON.parse(fs.readFileSync(path.join(directory, file)));
    if (
      report.source.hash !== originalSourceHash ||
      !report.environment.instrumentation.startsWith('v2:')
    )
      throw new Error('Cannot approve a non-frozen or non-v2 original capture');
    if (!report.provenance)
      legacy.push({
        file,
        runnerHash: report.harness.files['benchmark-runner.cjs'],
        capturedHarness: report.harness.files,
      });
  }
  const approval = {
    approvedAt: new Date().toISOString(),
    approvedRunnerHashes: [
      hash(fs.readFileSync(path.join(__dirname, 'benchmark-runner.cjs'))),
    ],
    variants: {
      before: {
        sourceHash: originalSourceHash,
        compiledHash: compiledHash(beforeRoot),
        root: beforeRoot,
      },
      after: {
        sourceHash: source(afterRoot),
        compiledHash: compiledHash(afterRoot),
        root: afterRoot,
      },
    },
    profiles: Object.fromEntries(
      families
        .filter(
          (family) =>
            family !== 'auth-settings' ||
            fs.existsSync(path.join(__dirname, 'auth-settings-workloads.cjs')),
        )
        .map((family) => [family, profile(family)]),
    ),
    legacyBeforeMainRunnerHashes: [
      ...new Set(legacy.map((report) => report.runnerHash)),
    ],
    legacyBeforeMain: legacy,
    legacyEvidence:
      'These explicitly enumerated original main captures predate per-function fingerprints. Their saved full harness hashes and observer-v2 label were audited during this task. Subsequent edits added disjoint suites, schema handling gated to the final schema, final-only production metrics, output oracles, and reporting/provenance fields; the original sampling/observer interval stayed unchanged. The baseline source/build remained the same frozen on-disk snapshot. Legacy compiled hashes are established by that frozen build, not represented as originally captured per-report evidence. Unknown source/harness revisions and observer-v1 captures are rejected.',
  };
  fs.writeFileSync(output, JSON.stringify(approval, null, 2) + '\n');
  console.log(
    'Saved explicit source/build/measurement approval; no captures or application files changed.',
  );
  return approval;
}
function validateSourceSelection(
  root,
  variant,
  approvalFile = defaultApproval,
) {
  const approval = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
  const expected = approval.variants[variant];
  const actual = hash(
    JSON.stringify(require('./benchmark-runner.cjs').sourceManifest(root)),
  );
  if (
    !expected ||
    actual !== expected.sourceHash ||
    compiledHash(root) !== expected.compiledHash
  )
    throw new Error(
      'Selected source/build does not match approved ' +
        variant +
        ' implementation',
    );
}
module.exports = {
  compiledHash,
  profile,
  captureProvenance,
  validateReportProvenance,
  validateSourceSelection,
  approveProvenance,
};
