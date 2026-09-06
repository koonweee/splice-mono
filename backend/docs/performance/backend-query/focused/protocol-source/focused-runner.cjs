const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const provenance = require('./provenance.cjs');
const outputRoot = path.resolve(__dirname, '../../docs/performance/backend-query');
const output = path.join(outputRoot, 'focused');
const roots = {
  before: process.env.BENCHMARK_BASELINE_SOURCE_ROOT,
  after: process.env.BENCHMARK_FINAL_SOURCE_ROOT,
};
const progress = { protocol: 'user-approved-focused-v1', completed: false, stages: [] };
function save() {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify(progress, null, 2) + '\n');
}
async function child(variant, args, memory = false) {
  provenance.validateSourceSelection(path.resolve(roots[variant]), variant);
  await new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, [
      ...(memory ? ['--expose-gc'] : []),
      path.join(__dirname, 'matrix-child.cjs'), ...args,
    ], {
      stdio: 'inherit',
      env: { ...process.env, BENCHMARK_SOURCE_ROOT: roots[variant] },
    });
    processChild.once('error', reject);
    processChild.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Focused ${variant} capture failed: ${code ?? signal}`)));
  });
}
async function stage(label, task) {
  const entry = { label, startedAt: new Date().toISOString() };
  progress.stages.push(entry); save();
  console.log(`Starting focused stage: ${label}`);
  await task();
  entry.completedAt = new Date().toISOString(); save();
  console.log(`Completed focused stage: ${label}`);
}
async function capture(variant, suite, rows, flags, expected, memory = false) {
  const directory = path.join(output, suite);
  const file = path.join(directory, `${variant}-${rows}-run1.json`);
  const family = memory ? 'memory' : suite.startsWith('scale') ? 'main' : suite;
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file));
    if (existing.completed && existing.samples === 3 && existing.warmups === 1 && existing.scenarios.length === expected) {
      provenance.validateReportProvenance(existing, family);
      console.log(`Reusing completed approved focused capture ${suite}/${variant}/${rows}`);
      return;
    }
  }
  await stage(`${suite}/${variant}/${rows}`, () => child(variant, [
    'capture', '--variant', variant, '--run', '1', '--rows', String(rows),
    '--samples', '3', '--warmups', '1', '--output', directory, ...flags,
  ], memory));
  const report = JSON.parse(fs.readFileSync(file));
  provenance.validateReportProvenance(report, family);
  if (!report.completed || report.scenarios.length !== expected) throw new Error(`Incomplete focused shape coverage: ${suite}/${variant}/${rows}`);
}
async function run() {
  for (const variant of ['before', 'after']) {
    if (!roots[variant]) throw new Error('Set both approved frozen source roots explicitly');
    provenance.validateSourceSelection(path.resolve(roots[variant]), variant);
  }
  save();
  for (const rows of [100000, 1000000])
    await capture('after', 'scale', rows, ['--full'], 35);
  for (const [suite, rows, flags, expected] of [
    ['shape', 10000, ['--shape', '--filter', 'shape.', '--no-transports'], 8],
    ['filters', 100000, ['--filters', '--filter', 'transactions.filter.', '--no-transports'], 3],
    ['auth-settings', 10000, ['--auth-settings', '--filter', 'auth-settings.', '--no-transports', '--correctness'], 4],
    ['extended', 1000000, ['--extended', '--filter', 'extended.', '--no-transports'], 24],
    ['sync', 10000, ['--sync', '--filter', 'sync.', '--no-transports'], 17],
  ]) {
    for (const variant of ['before', 'after']) await capture(variant, suite, rows, flags, expected);
  }
  for (const variant of ['before', 'after']) await stage(`mixed/${variant}`, () => child(variant, [
    'mixed', '--variant', variant, '--run', '1', '--seconds', '30',
    '--concurrencies', '1,10', '--output', path.join(output, 'mixed'),
  ]));
  for (const name of [
    'history.ten-years.20-accounts.daily',
    'history.ten-years.100-accounts.daily',
    'extended.history.ten-years.20-accounts.compact',
    'extended.history.ten-years.100-accounts.compact',
  ]) for (const variant of ['before', 'after'])
    await capture(variant, `memory/${name}`, 10000, ['--full', '--extended', '--memory', '--filter', name, '--no-transports'], 1, true);
  await stage('comparison', () => require('./focused-comparison.cjs').compareFocused(outputRoot));
  progress.completed = true; save();
  console.log('User-approved focused benchmark set completed and all strict source/financial/query-budget gates passed.');
}
module.exports = { run };
if (require.main === module) run().catch(error => {
  progress.error = error.message; save();
  console.error(error.message, error.stack); process.exitCode = 1;
});
