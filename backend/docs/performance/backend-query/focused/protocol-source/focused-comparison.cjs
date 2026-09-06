const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const comparison = require('./comparison.cjs');
const { validateReportProvenance } = require('./provenance.cjs');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function reportAt(root, file) {
  const report = read(file);
  for (const scenario of report.scenarios) if (scenario.outputArtifact)
    scenario.outputArtifact = path.relative(root, path.resolve(path.dirname(file), scenario.outputArtifact));
  return report;
}
function validateShort(report, family, count) {
  validateReportProvenance(report, family);
  assert(report.completed && report.samples === 3 && report.warmups === 1 && report.scenarios.length === count,
    `Incomplete focused capture ${family}/${report.variant}`);
  assert(report.scenarios.every(scenario => scenario.baselineFailure || scenario.raw.length === 3), 'Missing focused raw calls');
  if (report.variant === 'after') assert(report.schema.fixtureAdapter?.totalHeaders === 12200, 'Final fixture lacks migration-derived holdings facts');
}
function diagnostic(pair, before, after) {
  return {
    name: pair.name,
    rows: pair.rows,
    baselineSamples: before.samples,
    finalSamples: after.samples,
    independentFinalProcesses: 1,
    policy: pair.policy,
    semanticValidation: pair.semanticValidation,
    baselineFailure: pair.baselineFailure,
    corrected: pair.corrected,
    medianBeforeMs: pair.before?.p50 ?? null,
    medianAfterMs: pair.after.p50,
    rangeBeforeMs: pair.before ? [pair.before.min, pair.before.max] : null,
    rangeAfterMs: [pair.after.min, pair.after.max],
    cpuMedianBeforeMs: pair.beforeCpu?.p50 ?? null,
    cpuMedianAfterMs: pair.afterCpu.p50,
    selectsBefore: pair.beforeQueries ?? null,
    selectsAfter: pair.afterQueries,
    queryBudget: pair.queryBudget,
    diagnosticsBefore: pair.beforeDiagnostics ?? null,
    diagnosticsAfter: pair.afterDiagnostics,
    isolatedMemoryBefore: pair.isolatedMemoryBefore,
    isolatedMemoryAfter: pair.isolatedMemoryAfter,
    materialRegressionCandidate: pair.regression?.length > 0,
    confidence: 'Diagnostic single-process samples; no p95 improvement or stable tail claim.',
  };
}
function compareMixedFocused(directory) {
  const before = read(path.join(directory, 'before-mixed-run1.json'));
  const after = read(path.join(directory, 'after-mixed-run1.json'));
  for (const report of [before, after]) {
    validateReportProvenance(report, 'mixed');
    assert(report.completed && report.seconds === 30 && report.phases.length === 8, 'Incomplete focused mixed phases');
  }
  assert(before.fixtureHash === after.fixtureHash && JSON.stringify(before.environment) === JSON.stringify(after.environment), 'Mismatched focused mixed inputs');
  const result = [];
  for (const transport of ['http', 'mcp']) for (const concurrency of [1, 10]) for (const withSync of [false, true]) {
    const find = report => report.phases.filter(phase => phase.transport === transport && phase.concurrency === concurrency && phase.withSync === withSync);
    const old = find(before), next = find(after);
    assert(old.length === 1 && next.length === 1, 'Missing or duplicate focused mixed phase');
    for (const phase of [old[0], next[0]]) assert(phase.elapsedMs >= 30000 && phase.completedRequests > 0 && phase.errorCount === 0, 'Failed or short focused mixed phase');
    const describe = phase => ({
      observedLatencyMs: phase.latencyMs,
      completedRequests: phase.completedRequests,
      requestsPerSecond: phase.requestsPerSecond,
      elapsedMs: phase.elapsedMs,
      errorCount: phase.errorCount,
      poolWaitMs: phase.poolWaitMs,
      eventLoopDelayMs: phase.eventLoopDelayMs,
      syncCalls: phase.syncCalls,
      syncBatchesPerSecond: phase.syncCalls / (phase.elapsedMs / 1000),
    });
    result.push({ transport, concurrency, withSync, before: describe(old[0]), after: describe(next[0]), confidence: 'One 30-second phase per variant; observed percentiles are descriptive, with no repeated-run tail-confidence claim. Sync is a saturated producer, not a matched offered write rate.' });
  }
  return result;
}
async function compareFocused(root) {
  const output = path.join(root, 'focused');
  await comparison.compare(['compare', '--suite', 'main', '--rows', '10000', '--output', root]);
  const strong = read(path.join(root, 'comparison-10000.json'));
  assert(strong.summary.length === 35 && strong.summary.every(row => row.runs === 3), 'Missing retained strong 10k evidence');
  const suites = [];
  for (const rows of [100000, 1000000]) {
    const before = reportAt(root, path.join(root, `before-${rows}-run1.json`));
    const after = reportAt(root, path.join(output, 'scale', `after-${rows}-run1.json`));
    validateReportProvenance(before, 'main'); validateShort(after, 'main', 35);
    assert(before.samples >= 100 && before.warmups >= 5, 'Saved scale baseline is not the original completed capture');
    const pairs = comparison.compareReports(before, after, root, { exploratory: true });
    suites.push({ suite: `scale-${rows}`, samples: 'Saved original 100-call run versus final 3-call diagnostic run', comparisons: pairs.map(pair => diagnostic(pair, before, after)) });
  }
  for (const [suite, rows, count] of [['shape', 10000, 8], ['filters', 100000, 3], ['auth-settings', 10000, 4], ['extended', 1000000, 24], ['sync', 10000, 17]]) {
    const before = reportAt(root, path.join(output, suite, `before-${rows}-run1.json`));
    const after = reportAt(root, path.join(output, suite, `after-${rows}-run1.json`));
    validateShort(before, suite, count); validateShort(after, suite, count);
    if (suite === 'auth-settings') {
      require('./correctness-probes.cjs').validateCorrectness(after.correctness);
      require('./edge-correctness-probes.cjs').validateEdgeCorrectness(after.edgeCorrectness);
    }
    const pairs = comparison.compareReports(before, after, root, { exploratory: true });
    suites.push({ suite, samples: '1 warmup + 3 measured calls, one independent process per variant', comparisons: pairs.map(pair => diagnostic(pair, before, after)) });
  }
  for (const scenario of ['history.ten-years.20-accounts.daily', 'history.ten-years.100-accounts.daily', 'extended.history.ten-years.20-accounts.compact', 'extended.history.ten-years.100-accounts.compact']) {
    const before = reportAt(root, path.join(output, 'memory', scenario, 'before-10000-run1.json'));
    const after = reportAt(root, path.join(output, 'memory', scenario, 'after-10000-run1.json'));
    validateShort(before, 'memory', 1); validateShort(after, 'memory', 1);
    assert(before.scenarios[0].isolatedMemory?.peakRss > 0 && after.scenarios[0].isolatedMemory?.peakRss > 0, 'Missing isolated memory measurement');
    const pairs = comparison.compareReports(before, after, root, { exploratory: true });
    suites.push({ suite: `memory/${scenario}`, samples: 'Fresh isolated process; 1 warmup + 3 measured calls per variant', comparisons: pairs.map(pair => diagnostic(pair, before, after)) });
  }
  const mixed = compareMixedFocused(path.join(output, 'mixed'));
  const result = {
    completed: true,
    protocol: 'user-approved-focused-v1',
    completedAt: new Date().toISOString(),
    originalFullMatrixCompleted: false,
    sourceAndFinancialGates: 'Strict approved source/build/harness, exact economic outputs, deterministic query budgets and workload-specific SQL oracles retained.',
    strongEvidence: { file: '../comparison-10000.json', scenarios: 35, samples: 100, warmups: 5, independentRuns: 3, originalAmountSortFailures: 2 },
    diagnosticEvidence: 'Single-process short samples broaden coverage but do not support p95 improvement or stable-tail claims. The long full matrix remains an optional reproducibility command, superseded by the user-approved shorter acceptance set.',
    scriptHashes: Object.fromEntries(['focused-runner.cjs', 'focused-comparison.cjs'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, file))).digest('hex')])),
    suites,
    mixed,
  };
  fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify(result, null, 2) + '\n');
  const n = value => Number.isFinite(value) ? value.toFixed(2) : 'failed/unavailable';
  const table = ['| Suite / scenario | Rows | Observed median before → after (ms) | SELECTs before → after | Validation |', '| --- | ---: | ---: | ---: | --- |'];
  for (const suite of suites) for (const row of suite.comparisons) table.push(`| ${suite.suite}: ${row.name} | ${row.rows} | ${n(row.medianBeforeMs)} → ${n(row.medianAfterMs)} | ${row.selectsBefore ?? '—'} → ${row.selectsAfter} | ${row.corrected ? 'Named original failure corrected' : row.semanticValidation} |`);
  const mixedTable = ['| Transport | Concurrency | Sync | Requests/s before → after | Completed sync batches/s before → after | Errors |', '| --- | ---: | --- | ---: | ---: | ---: |'];
  for (const row of mixed) mixedTable.push(`| ${row.transport} | ${row.concurrency} | ${row.withSync} | ${n(row.before.requestsPerSecond)} → ${n(row.after.requestsPerSecond)} | ${n(row.before.syncBatchesPerSecond)} → ${n(row.after.syncBatchesPerSecond)} | 0 → 0 |`);
  fs.writeFileSync(path.join(output, 'comparison.md'), `# Focused backend benchmark evidence\n\nThe user shortened the original full matrix. The retained [10k result](../comparison-10000.md) remains the strong repeated-run p50/p95 evidence. This report adds diagnostic scale and shape checks, with strict financial/source/query gates. All new normal cases use one warmup and three measured calls in one process per variant; scale checks reuse completed original 100-call captures. Do not interpret these three-call medians or stored raw p95 fields as a stable speedup/tail estimate.\n\n${table.join('\n')}\n\nMixed load uses one 30-second phase at each listed shape. Its saturated sync producer processes different write rates in the two variants; compare that rate alongside read throughput. Raw observed tails, event-loop delay and pool waits are retained in comparison.json, with no repeated-run confidence claim.\n\n${mixedTable.join('\n')}\n\nIsolated memory rows retain sampled process RSS peaks, including observer/worker overhead. The stronger three-process memory matrix was intentionally omitted. Schema parity, actual sync write plans, migration runtime/locks and production browser evidence remain separately retained.\n`);
  console.log(`Focused validation passed: ${suites.reduce((sum, suite) => sum + suite.comparisons.length, 0)} diagnostic pairs and ${mixed.length} paired mixed phases, plus retained35-shape strong10k evidence.`);
  return result;
}
module.exports = { compareFocused, compareMixedFocused };
