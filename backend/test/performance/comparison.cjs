const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');

const arg = (args, name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Text-only normalization preserves all exact digits; it never converts final money to Number.
function decimalText(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) return value;
  const exponent = Number(match[4] || 0);
  assert(
    Math.abs(exponent) <= 1000,
    'Unexpected decimal exponent in benchmark output',
  );
  let digits = match[2] + (match[3] || '');
  const point = match[2].length + exponent;
  if (point <= 0) digits = '0.' + '0'.repeat(-point) + digits;
  else if (point >= digits.length) digits += '0'.repeat(point - digits.length);
  else digits = digits.slice(0, point) + '.' + digits.slice(point);
  digits = digits
    .replace(/^0+(?=\d)/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `${match[1] && digits !== '0' ? '-' : ''}${digits}`;
}

const EXACT_NUMERIC_FIELDS = new Set([
  'amount',
  'totalAmount',
  'totalInflow',
  'totalOutflow',
  'netFlow',
  'uncategorizedInflow',
  'uncategorizedOutflow',
  'quantity',
  'institutionPrice',
  'rate',
  'numerator',
  'denominator',
  'min',
  'max',
]);
function normalize(value, field = '', parents = []) {
  const exactNumeric =
    EXACT_NUMERIC_FIELDS.has(field) ||
    (field === 'value' && parents.includes('chartData'));
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'Nonfinite benchmark output');
    return exactNumeric ? decimalText(String(value)) : value;
  }
  if (typeof value === 'string')
    return exactNumeric ? decimalText(value) : value;
  if (Array.isArray(value))
    return value.map((item) => normalize(item, field, parents));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter(
          (key) => !['createdAt', 'updatedAt', 'completedAt'].includes(key),
        )
        .map((key) => [key, normalize(value[key], key, [...parents, field])]),
    );
  return value;
}

function structured(value) {
  return value.structuredContent ?? value;
}

const isHoldingsRead = (name) =>
  name.startsWith('holdings.') ||
  name.startsWith('extended.holdings.') ||
  name === 'mcp.transport.holdings-20';

/** Only named contract additions are omitted. Financial values and transaction order remain. */
function economicProjection(name, input) {
  const value = structured(input);
  if (isHoldingsRead(name)) {
    assert(
      new Set(value.data.map((row) => row.id)).size === value.data.length,
      `${name}: duplicate holding IDs`,
    );
    return normalize({
      data: [...value.data].sort((a, b) => a.id.localeCompare(b.id)),
      query: value.query,
    });
  }
  if (name.includes('history.') || name === 'mcp.transport.history-month') {
    const { sampling, ...data } = value;
    return normalize(data);
  }
  if (name.includes('cashflow'))
    return normalize(value.app ? value.data : value);
  if (name.includes('transactions') && value.data) {
    if (name.includes('fx-') || name.startsWith('extended.transactions.'))
      return normalize({
        data: value.data,
        reportingCurrency: value.conversion.reportingCurrency,
        query: value.query,
      });
    if (name.startsWith('http.'))
      return normalize({
        data: value.data,
        total: value.total,
        pageSize: value.pageSize,
      });
  }
  return normalize(value);
}

function assertSame(before, after, name) {
  assert(
    digest(before) === digest(after),
    `Unexpected financial/selection difference: ${name}`,
  );
}

function validateOutput(name, beforeInput, afterInput, afterScenario) {
  const before = structured(beforeInput),
    after = structured(afterInput);
  if (name.startsWith('auth-settings.settings.')) {
    assert(
      after.bothPatchesPreserved === true &&
        after.outcome === 'both-preserved' &&
        afterScenario.validation?.observations?.lostUpdatePairs === 0,
      `${name}: final settings lost a patch`,
    );
    assert(
      ['both-preserved', 'baseline-lost-update'].includes(before.outcome),
      `${name}: unnamed original settings outcome`,
    );
    const expected = structuredClone(before.settings);
    if (name.endsWith('parallel-disjoint')) {
      expected.currency = 'EUR';
      expected.hideZeroBalanceAccounts = true;
    } else {
      expected.notifications.transactions.newSyncedTransactions = false;
      expected.notifications.bankLinks.needsAttention = false;
    }
    assertSame(
      normalize(expected),
      normalize(after.settings),
      `${name}: exact patches and unaffected siblings`,
    );
    return 'named settings concurrency correction; both requested patches and all unrelated siblings preserved';
  }
  if (name.startsWith('auth-settings.pat.')) {
    const expected = name.endsWith('usage-due') ? 1 : 0;
    assert(
      afterScenario.validation?.physicallyUpdatedRows === expected &&
        afterScenario.validation?.lastUsedAtChanged === Boolean(expected),
      `${name}: incorrect physical usage-write result`,
    );
  }
  if (name.startsWith('extended.cursor.')) {
    assert(
      after.total === null && after.hasMore === true && after.nextCursor,
      `${name}: missing count-free cursor continuation`,
    );
    assertSame(
      normalize(before.data),
      normalize(after.data),
      `${name}: ordered page data`,
    );
    return 'exact ordered deep-page data; initial count retained by caller, continuation omits count';
  }
  if (isHoldingsRead(name)) {
    const accounts = after.query.accountIds;
    assert(
      Array.isArray(after.snapshots) &&
        after.snapshots.length === accounts.length,
      `${name}: missing completed snapshot metadata`,
    );
    for (const account of accounts) {
      const snapshots = after.snapshots.filter(
        (row) => row.accountId === account,
      );
      assert(
        snapshots.length === 1 &&
          snapshots[0].snapshotDate === '2026-09-04' &&
          snapshots[0].holdingCount ===
            after.data.filter((row) => row.accountId === account).length,
        `${name}: incorrect empty/latest snapshot`,
      );
    }
  }
  if (name.includes('history.') || name === 'mcp.transport.history-month') {
    const compact = name.endsWith('.compact');
    assert(
      after.sampling?.resolution === (compact ? 'compact' : 'daily') &&
        after.sampling.sourcePointCount === before.chartData.length &&
        after.sampling.returnedPointCount === after.chartData.length,
      `${name}: incorrect sampling metadata`,
    );
    if (compact) {
      assert(
        after.chartData.length <= 122 && after.sampling.maxPoints === 122,
        `${name}: compact point budget`,
      );
      const source = new Map(
        before.chartData.map((point) => [point.date, point]),
      );
      after.chartData.forEach((point) =>
        assertSame(
          normalize(source.get(point.date), 'chartData'),
          normalize(point, 'chartData'),
          `${name}/${point.date}`,
        ),
      );
      assertSame(
        normalize([before.chartData[0], before.chartData.at(-1)], 'chartData'),
        normalize([after.chartData[0], after.chartData.at(-1)], 'chartData'),
        `${name}: endpoints`,
      );
      assert(
        Buffer.byteLength(JSON.stringify(after.chartData)) <=
          Buffer.byteLength(JSON.stringify(before.chartData)) * 0.2,
        `${name}: compact chart bytes did not fall by 80%`,
      );
      assertSame(
        economicProjection(name, { ...before, chartData: [] }),
        economicProjection(name, { ...after, chartData: [] }),
        name,
      );
      return 'exact boundaries/accounts; selected original daily points; explicit compact chart';
    }
    if (name === 'shape.history.year.100-accounts.sparse-prior-fx.daily') {
      assert(
        before.chartData.every(
          (point) => String(point.value) === '115554.99999999999',
        ),
        `${name}: unexpected baseline correction input`,
      );
      assert(
        after.chartData.every((point) => point.value === '115555'),
        `${name}: exact EUR-to-USD projection is incorrect`,
      );
      assertSame(
        normalize(before.chartData.map(({ value, ...point }) => point)),
        normalize(after.chartData.map(({ value, ...point }) => point)),
        `${name}: dates and labels`,
      );
      assertSame(
        economicProjection(name, { ...before, chartData: [] }),
        economicProjection(name, { ...after, chartData: [] }),
        name,
      );
      return 'named baseline arithmetic correction: 115554.99999999999 → exact 115555; all integer totals, accounts, dates and labels unchanged';
    }
  }
  if (name.startsWith('extended.transactions.')) {
    assert(
      afterScenario.validation?.completeContinuationParity === true,
      `${name}: missing full continuation/SQL-oracle validation`,
    );
    assertSame(
      normalize(before.data.slice(0, after.data.length)),
      normalize(after.data),
      `${name}: first-call selection prefix`,
    );
    if (after.pageInfo.hasMore)
      assert(
        after.pageInfo.continuationReason === 'scan_budget' &&
          after.pageInfo.nextCursor,
        `${name}: dishonest scan continuation`,
      );
    return 'bounded first call; full advancing continuation checked against ordered SQL oracle';
  }
  if (name.includes('fx-')) {
    assert(
      after.pageInfo.hasMore === false && after.pageInfo.nextCursor === null,
      `${name}: full final page continuation`,
    );
    for (const rate of after.conversion.rates) {
      assert(
        rate.requestedDate &&
          rate.rateDate &&
          typeof rate.rate === 'string' &&
          ['DB', 'FORWARD_FILLED', 'BACKWARD_FILLED', 'IDENTITY'].includes(
            rate.source,
          ),
        `${name}: missing exact FX provenance`,
      );
      if (rate.source === 'FORWARD_FILLED')
        assert(
          rate.rateDate < rate.requestedDate,
          `${name}: incorrect prior quote provenance`,
        );
      if (rate.source === 'DB')
        assert(
          rate.rateDate === rate.requestedDate,
          `${name}: incorrect exact quote provenance`,
        );
    }
  }
  assertSame(
    economicProjection(name, beforeInput),
    economicProjection(name, afterInput),
    name,
  );
  return 'exact economic/selection parity after documented representation and metadata changes';
}

function queryBudget(name) {
  if (name.startsWith('matching.')) return 0;
  if (name.startsWith('holdings.') || name.startsWith('extended.holdings.'))
    return 3;
  if (name === 'mcp.transport.holdings-20') return 4;
  if (name.startsWith('mcp-transactions.fx-')) return 4;
  if (name === 'mcp.transport.transactions.fx-100') return 5;
  if (name.startsWith('transactions.')) return 3;
  if (name.startsWith('extended.cursor.')) return 2;
  if (name.includes('history.')) return 7;
  if (name === 'mcp.transport.history-month') return 8;
  if (name.startsWith('cashflow.') || name.startsWith('shape.cashflow.'))
    return 4;
  if (name === 'mcp.transport.cashflow-comparison') return 9;
  const banking = /^sync\.banking(?:-modified)?\.(\d+)\./.exec(name);
  if (banking) return Math.ceil(Number(banking[1]) / 250) + 3;
  const investment = /^sync\.investment-transactions\.(\d+)$/.exec(name);
  if (investment) return Math.ceil(Number(investment[1]) / 300) + 3;
  return null;
}

function loadOutput(directory, scenario) {
  assert(
    scenario.outputArtifact,
    `Missing original-output evidence: ${scenario.name}`,
  );
  const target = path.resolve(directory, scenario.outputArtifact);
  assert(
    target.startsWith(path.resolve(directory) + path.sep),
    'Output evidence must stay within benchmark artifacts',
  );
  return JSON.parse(gunzipSync(fs.readFileSync(target)));
}

function compareReports(
  before,
  after,
  directory,
  { exploratory = false } = {},
) {
  if (!exploratory) {
    const family = after.provenance?.measurement.family || 'main';
    require('./provenance.cjs').validateReportProvenance(before, family);
    require('./provenance.cjs').validateReportProvenance(after, family);
  }
  assert(
    before.completed &&
      after.completed &&
      before.fixtureHash === after.fixtureHash &&
      JSON.stringify(before.environment) === JSON.stringify(after.environment),
    'Incomplete or mismatched benchmark inputs',
  );
  assert(
    exploratory ||
      (before.samples >= 100 &&
        after.samples >= 100 &&
        before.warmups >= 5 &&
        after.warmups >= 5),
    'Final comparison requires 100 samples and 5 warmups',
  );
  return before.scenarios.map((old) => {
    const next = after.scenarios.find((scenario) => scenario.name === old.name);
    assert(
      next && !next.baselineFailure,
      `Missing/failed final scenario ${old.name}`,
    );
    const budget = queryBudget(old.name);
    if (old.name.startsWith('extended.cursor.'))
      assert(
        after.plans[old.name].every(
          (statement) => !/\bOFFSET\b|\bCOUNT\s*\(/i.test(statement.sql),
        ),
        `${old.name}: continuation performed an offset/count query`,
      );
    assert(
      budget === null || next.raw.every((sample) => sample.sqlCount <= budget),
      `${old.name}: SELECT budget ${budget} exceeded`,
    );
    if (old.name.includes('fx-'))
      assert(
        next.raw.every(
          (sample) => sample.fxSelects === undefined || sample.fxSelects <= 3,
        ),
        `${old.name}: FX SELECT budget exceeded`,
      );
    if (old.name.startsWith('sync.banking'))
      assert(
        next.raw.every(
          (sample) =>
            sample.categorizationRuleSelects === undefined ||
            sample.categorizationRuleSelects <= 1,
        ),
        `${old.name}: rules were loaded per row`,
      );
    if (old.baselineFailure)
      assert(
        !/^(transactions|extended\.cursor)\.amount\./.test(old.name) ||
          next.validation?.orderedAmountPageParity === true,
        `${old.name}: corrected amount page lacks ordered SQL-oracle verification`,
      );
    if (old.baselineFailure)
      return {
        name: old.name,
        rows: before.fixture.rows,
        run: before.run,
        baselineFailure: old.baselineFailure,
        corrected: true,
        queryBudget: budget,
        afterQueries: next.raw[0].sqlCount,
        after: next.latencyMs,
        afterCpu: next.cpuMs,
        afterDiagnostics: diagnosticStats(next),
      };
    const semanticValidation = validateOutput(
      old.name,
      loadOutput(directory, old),
      loadOutput(directory, next),
      next,
    );
    const regression = ['p50', 'p95'].filter(
      (percentile) =>
        next.latencyMs[percentile] - old.latencyMs[percentile] > 5 &&
        next.latencyMs[percentile] > old.latencyMs[percentile] * 1.1,
    );
    const transport =
      old.name.startsWith('http.') || old.name.startsWith('mcp.transport.');
    const clientCompletion = (scenario) =>
      require('./benchmark-runner.cjs').stats(
        scenario.raw.map((sample) => sample.ms - sample.serializationMs),
      );
    return {
      name: old.name,
      rows: before.fixture.rows,
      run: before.run,
      policy: old.policy,
      semanticValidation,
      before: old.latencyMs,
      after: next.latencyMs,
      beforeCpu: old.cpuMs,
      afterCpu: next.cpuMs,
      beforeDiagnostics: diagnosticStats(old),
      afterDiagnostics: diagnosticStats(next),
      beforeClientCompletion: transport ? clientCompletion(old) : undefined,
      afterClientCompletion: transport ? clientCompletion(next) : undefined,
      isolatedMemoryBefore: old.isolatedMemory,
      isolatedMemoryAfter: next.isolatedMemory,
      p50ImprovementPercent: 100 * (1 - next.latencyMs.p50 / old.latencyMs.p50),
      p95ImprovementPercent: 100 * (1 - next.latencyMs.p95 / old.latencyMs.p95),
      beforeQueries: old.raw[0].sqlCount,
      afterQueries: next.raw[0].sqlCount,
      beforeBytes: old.raw[0].responseBytes,
      afterBytes: next.raw[0].responseBytes,
      beforeGzipBytes: old.raw[0].gzipBytes,
      afterGzipBytes: next.raw[0].gzipBytes,
      beforeSqlBytes: old.raw[0].sqlBytes,
      afterSqlBytes: next.raw[0].sqlBytes,
      queryBudget: budget,
      regression,
    };
  });
}

function diagnosticStats(scenario) {
  const stats = require('./benchmark-runner.cjs').stats;
  return Object.fromEntries(
    [
      'sqlMs',
      'totalDataSqlMs',
      'topLevelWriteSqlMs',
      'sqlRows',
      'sqlBytes',
      'sqlWriteCount',
      'dataModifyingStatements',
      'transactionStatements',
      'serializationMs',
      'poolWaitMs',
      'poolAcquisitions',
      'heapDelta',
      'rss',
      'responseBytes',
      'gzipBytes',
    ].map((key) => {
      const values = scenario.raw.map((sample) => sample[key]);
      return [
        key,
        values.every((value) => Number.isFinite(value)) ? stats(values) : null,
      ];
    }),
  );
}

function summaries(comparisons) {
  const groups = new Map();
  for (const value of comparisons) {
    const key = `${value.rows}/${value.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const spread = (values) => ({
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  });
  const diagnostics = (runs, side) => {
    const values = runs.map((run) => run[side]);
    if (!values.every(Boolean)) return null;
    return Object.fromEntries(
      Object.keys(values[0]).map((key) => [
        key,
        values.every((value) => value[key])
          ? {
              p50: spread(values.map((value) => value[key].p50)),
              p95: spread(values.map((value) => value[key].p95)),
            }
          : null,
      ]),
    );
  };
  return [...groups.values()].map((runs) =>
    runs[0].baselineFailure
      ? {
          name: runs[0].name,
          rows: runs[0].rows,
          runs: runs.length,
          baselineFailure: runs[0].baselineFailure,
          corrected: runs.every((run) => run.corrected),
          p50After: spread(runs.map((run) => run.after.p50)),
          p95After: spread(runs.map((run) => run.after.p95)),
          cpuMedianAfter: median(runs.map((run) => run.afterCpu.p50)),
          queriesAfter: runs[0].afterQueries,
          diagnosticsBefore: null,
          diagnosticsAfter: diagnostics(runs, 'afterDiagnostics'),
        }
      : {
          name: runs[0].name,
          rows: runs[0].rows,
          runs: runs.length,
          policy: runs[0].policy,
          semanticValidation: runs[0].semanticValidation,
          p50Before: spread(runs.map((run) => run.before.p50)),
          p50After: spread(runs.map((run) => run.after.p50)),
          p95Before: spread(runs.map((run) => run.before.p95)),
          p95After: spread(runs.map((run) => run.after.p95)),
          cpuMedianBefore: median(runs.map((run) => run.beforeCpu.p50)),
          cpuMedianAfter: median(runs.map((run) => run.afterCpu.p50)),
          queriesBefore: runs[0].beforeQueries,
          queriesAfter: runs[0].afterQueries,
          bytesBefore: runs[0].beforeBytes,
          bytesAfter: runs[0].afterBytes,
          sqlBytesBefore: runs[0].beforeSqlBytes,
          sqlBytesAfter: runs[0].afterSqlBytes,
          gzipBytesBefore: runs[0].beforeGzipBytes,
          gzipBytesAfter: runs[0].afterGzipBytes,
          diagnosticsBefore: diagnostics(runs, 'beforeDiagnostics'),
          diagnosticsAfter: diagnostics(runs, 'afterDiagnostics'),
          clientP50Before: runs[0].beforeClientCompletion
            ? spread(runs.map((run) => run.beforeClientCompletion.p50))
            : undefined,
          clientP50After: runs[0].afterClientCompletion
            ? spread(runs.map((run) => run.afterClientCompletion.p50))
            : undefined,
          clientP95Before: runs[0].beforeClientCompletion
            ? spread(runs.map((run) => run.beforeClientCompletion.p95))
            : undefined,
          clientP95After: runs[0].afterClientCompletion
            ? spread(runs.map((run) => run.afterClientCompletion.p95))
            : undefined,
          sampledPeakRssBefore: runs[0].isolatedMemoryBefore
            ? spread(runs.map((run) => run.isolatedMemoryBefore.peakRss))
            : undefined,
          sampledPeakRssAfter: runs[0].isolatedMemoryAfter
            ? spread(runs.map((run) => run.isolatedMemoryAfter.peakRss))
            : undefined,
          regressionRuns: runs
            .filter((run) => run.regression.length)
            .map((run) => run.run),
        },
  );
}

async function compare(args) {
  const directory = path.resolve(
    arg(
      args,
      'output',
      path.join(__dirname, '../../docs/performance/backend-query'),
    ),
  );
  const suite = arg(
    args,
    'suite',
    directory ===
      path.resolve(__dirname, '../../docs/performance/backend-query')
      ? 'all'
      : 'directory',
  );
  if (suite === 'all')
    return require('./compare-all.cjs').compareAll(directory);
  const selectedRows = arg(args, 'rows', '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const reportSuffix = selectedRows.length ? `-${selectedRows.join('-')}` : '';
  const reports = fs
    .readdirSync(directory)
    .filter((file) => /^(before|after)-\d+-run\d+\.json$/.test(file))
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')),
    )
    .filter(
      (report) =>
        !selectedRows.length || selectedRows.includes(report.fixture.rows),
    );
  const exploratory = args.includes('--exploratory');
  const comparisons = [];
  for (const before of reports.filter(
    (report) => report.variant === 'before',
  )) {
    const after = reports.find(
      (report) =>
        report.variant === 'after' &&
        report.fixture.rows === before.fixture.rows &&
        report.run === before.run,
    );
    assert(
      after,
      `Missing after capture for ${before.fixture.rows} run ${before.run}`,
    );
    comparisons.push(
      ...compareReports(before, after, directory, { exploratory }),
    );
  }
  assert(comparisons.length, 'No complete comparison pairs');
  const summary = summaries(comparisons);
  assert(
    exploratory || summary.every((row) => row.runs === 3),
    'Final comparisons require three independent process runs per shape',
  );
  fs.writeFileSync(
    path.join(directory, `comparison${reportSuffix}.json`),
    JSON.stringify(
      {
        exploratory,
        rowScope: selectedRows.length
          ? selectedRows
          : 'all available rows in the selected suite',
        comparisons,
        summary,
      },
      null,
      2,
    ) + '\n',
  );
  const table = [
    '| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of summary)
    table.push(
      row.baselineFailure
        ? `| ${row.name} | ${row.rows} | Failed → ${row.p50After.median.toFixed(2)} | — → ${row.p95After.median.toFixed(2)} | — → ${row.queriesAfter} | See diagnostics |`
        : `| ${row.name} | ${row.rows} | ${row.p50Before.median.toFixed(2)} → ${row.p50After.median.toFixed(2)} | ${row.p95Before.median.toFixed(2)} → ${row.p95After.median.toFixed(2)} | ${row.queriesBefore} → ${row.queriesAfter} | ${row.bytesBefore} → ${row.bytesAfter} |`,
    );
  const format = (value, digits = 2) =>
    Number.isFinite(value) ? value.toFixed(digits) : 'unavailable';
  const metric = (row, side, key) =>
    row[`diagnostics${side}`]?.[key]?.p50.median;
  const pair = (row, key, digits = 2) =>
    `${format(metric(row, 'Before', key), digits)} → ${format(metric(row, 'After', key), digits)}`;
  const timingTable = [
    '| Scenario | Rows | CPU p50 ms | SELECT/CTE elapsed p50 ms | All data SQL elapsed p50 ms | Serialization p50 ms | Pool acquisition p50 ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summary.map(
      (row) =>
        `| ${row.name} | ${row.rows} | ${format(row.cpuMedianBefore)} → ${format(row.cpuMedianAfter)} | ${pair(row, 'sqlMs')} | ${pair(row, 'totalDataSqlMs')} | ${pair(row, 'serializationMs')} | ${pair(row, 'poolWaitMs')} |`,
    ),
  ];
  const payloadTable = [
    '| Scenario | Rows | SELECT/CTE result rows p50 | SELECT/CTE serialized bytes p50 | Logical JSON bytes p50 | Logical gzip bytes p50 | Data-modifying statements p50 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summary.map(
      (row) =>
        `| ${row.name} | ${row.rows} | ${pair(row, 'sqlRows', 0)} | ${pair(row, 'sqlBytes', 0)} | ${pair(row, 'responseBytes', 0)} | ${pair(row, 'gzipBytes', 0)} | ${pair(row, 'dataModifyingStatements', 0)} |`,
    ),
  ];
  const memoryTable = [
    '| Scenario | Rows | Heap change p50 bytes | Completion RSS p50 bytes | Isolated sampled peak RSS bytes |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.map(
      (row) =>
        `| ${row.name} | ${row.rows} | ${pair(row, 'heapDelta', 0)} | ${pair(row, 'rss', 0)} | ${format(row.sampledPeakRssBefore?.median, 0)} → ${format(row.sampledPeakRssAfter?.median, 0)} |`,
    ),
  ];
  fs.writeFileSync(
    path.join(directory, `comparison${reportSuffix}.md`),
    `${exploratory ? 'Exploratory only. ' : ''}${selectedRows.length ? `Dataset scope: ${selectedRows.join(', ')} total transaction rows only; this is not full-matrix completion. ` : ''}Median of each independent process run’s percentiles; spread, policy and semantic validation are retained in comparison${reportSuffix}.json. Bounded-continuation rows compare different per-call scan budgets, and compact rows compare explicit chart resolutions; neither is an equivalent full-output latency claim. Transport intervals include separately retained post-client JSON reserialization; client-completion percentiles are also in comparison${reportSuffix}.json. Named original failures have verified final results and final timings, with no computed speedup.\n\n${table.join('\n')}\n\nDiagnostic p50 values below are medians of per-process medians. SQL elapsed can include connection acquisition: pool wait is not an additional disjoint cost. SELECT/CTE time excludes top-level writes; all-data SQL time is unavailable in earlier captures. CPU and serialization overlap the measured request, and are not additive stages.\n\n${timingTable.join('\n')}\n\nSQL bytes are serialized database-result bytes measured after the request interval. JSON/gzip are logical payloads, not wire captures. A data-modifying statement can update zero physical rows; use PAT tuple-transition validation for physical usage writes.\n\n${payloadTable.join('\n')}\n\nCompletion RSS and heap changes are descriptive and can reflect prior workloads and the common observer. Only the explicitly isolated memory suite measures a per-scenario sampled peak; its observer/worker overhead is included. Negative heap changes reflect collection, not negative allocation.\n\n${memoryTable.join('\n')}\n`,
  );
  console.log(
    `Compared ${comparisons.length} scenario/run pairs; ${summary.filter((row) => row.regressionRuns?.length).length} shapes require regression review.`,
  );
}

module.exports = {
  compare,
  compareReports,
  decimalText,
  economicProjection,
  normalize,
  queryBudget,
  summaries,
  validateOutput,
};
