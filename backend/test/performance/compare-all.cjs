const fs = require('node:fs');
const path = require('node:path');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function compareMixed(directory) {
  const comparisons = [];
  for (const run of [1, 2, 3]) {
    const read = (variant) =>
      JSON.parse(
        fs.readFileSync(
          path.join(directory, `${variant}-mixed-run${run}.json`),
          'utf8',
        ),
      );
    const before = read('before'),
      after = read('after');
    require('./provenance.cjs').validateReportProvenance(before, 'mixed');
    require('./provenance.cjs').validateReportProvenance(after, 'mixed');
    assert(
      before.completed &&
        after.completed &&
        before.seconds >= 30 &&
        after.seconds >= 30,
      `Incomplete mixed run ${run}`,
    );
    assert(
      JSON.stringify(before.environment) ===
        JSON.stringify(after.environment) &&
        before.fixtureHash === after.fixtureHash &&
        before.fixtureHash,
      `Mismatched mixed inputs ${run}`,
    );
    assert(
      before.phases.length === 12 && after.phases.length === 12,
      `Missing mixed phases ${run}`,
    );
    for (const old of before.phases) {
      const next = after.phases.find(
        (phase) =>
          phase.transport === old.transport &&
          phase.concurrency === old.concurrency &&
          phase.withSync === old.withSync,
      );
      assert(
        next &&
          old.elapsedMs >= 30000 &&
          next.elapsedMs >= 30000 &&
          old.completedRequests > 0 &&
          next.completedRequests > 0 &&
          old.errorCount === 0 &&
          next.errorCount === 0,
        `Failed/short mixed phase ${run}/${old.transport}/${old.concurrency}/${old.withSync}`,
      );
      comparisons.push({
        run,
        transport: old.transport,
        concurrency: old.concurrency,
        withSync: old.withSync,
        before: old.latencyMs,
        after: next.latencyMs,
        throughputBefore: old.requestsPerSecond,
        throughputAfter: next.requestsPerSecond,
        poolWaitBefore: old.poolWaitMs,
        poolWaitAfter: next.poolWaitMs,
        eventLoopBefore: old.eventLoopDelayMs,
        eventLoopAfter: next.eventLoopDelayMs,
        syncCallsBefore: old.syncCalls,
        syncCallsAfter: next.syncCalls,
        syncBatchesPerSecondBefore: old.syncCalls / (old.elapsedMs / 1000),
        syncBatchesPerSecondAfter: next.syncCalls / (next.elapsedMs / 1000),
      });
    }
  }
  fs.writeFileSync(
    path.join(directory, 'comparison.json'),
    JSON.stringify({ comparisons }, null, 2) + '\n',
  );
  return comparisons;
}

async function compareAll(directory) {
  const { compare } = require('./comparison.cjs');
  const suites = [
    '',
    'extended',
    'shape',
    'sync',
    'filters',
    'auth-settings',
    ...[
      'history.ten-years.20-accounts.daily',
      'history.ten-years.100-accounts.daily',
      'extended.history.ten-years.20-accounts.compact',
      'extended.history.ten-years.100-accounts.compact',
    ].map((name) => path.join('memory', name)),
  ];
  const expected = {
    '': 35,
    extended: 24,
    shape: 8,
    sync: 17,
    filters: 3,
    'auth-settings': 4,
  };
  const summaries = [];
  for (const suite of suites) {
    const folder = path.join(directory, suite);
    for (const variant of ['before', 'after']) {
      const rows =
        suite === '' || suite === 'filters'
          ? [10000, 100000, 1000000]
          : suite === 'extended'
            ? [1000000]
            : [10000];
      for (const count of rows)
        for (const run of [1, 2, 3]) {
          const report = JSON.parse(
            fs.readFileSync(
              path.join(folder, `${variant}-${count}-run${run}.json`),
              'utf8',
            ),
          );
          require('./provenance.cjs').validateReportProvenance(
            report,
            suite.startsWith('memory/') ? 'memory' : suite || 'main',
          );
          assert(
            report.scenarios.length === (expected[suite] ?? 1),
            `Missing ${suite || 'main'} scenarios ${variant}/${count}/${run}`,
          );
          if (variant === 'after')
            assert(
              report.schema.fixtureAdapter?.kind ===
                'migration-derived-holdings-headers' &&
                report.schema.fixtureAdapter.totalHeaders === 12200,
              `Final fixture lacks migration-derived history ${suite || 'main'}/${count}/${run}`,
            );
          if (suite.startsWith('memory/'))
            assert(
              report.scenarios[0].isolatedMemory?.peakRss > 0,
              `Missing isolated memory ${suite}/${variant}/${run}`,
            );
        }
    }
    await compare(['compare', '--suite', 'directory', '--output', folder]);
    const result = JSON.parse(
      fs.readFileSync(path.join(folder, 'comparison.json'), 'utf8'),
    );
    summaries.push({ suite: suite || 'main', ...result });
  }
  const mixed = compareMixed(path.join(directory, 'mixed'));
  fs.writeFileSync(
    path.join(directory, 'all-comparisons.json'),
    JSON.stringify({ completed: true, suites: summaries, mixed }, null, 2) +
      '\n',
  );
  console.log(
    'Validated every required matrix, mixed phase and isolated-memory capture.',
  );
}
module.exports = { compareAll, compareMixed };
