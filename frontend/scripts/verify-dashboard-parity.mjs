/**
 * Compare the actual frontend history transform with compact dashboard APIs.
 * Usage: node scripts/verify-dashboard-parity.mjs [--report /absolute/report.json]
 * Only synthetic fixtures are used; temporary legacy payloads are removed.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const script = fileURLToPath(import.meta.url)
const frontend = path.resolve(path.dirname(script), '..')
const backend = path.resolve(frontend, '../backend')
const periods = [
  'day',
  'week',
  'month',
  'year',
  'threeYears',
  'fiveYears',
  'tenYears',
]

async function writeFixtures(directory) {
  const load = createRequire(path.join(backend, 'package.json'))
  load('ts-node').register({
    project: path.join(backend, 'tsconfig.json'),
    transpileOnly: true,
  })
  load('tsconfig-paths').register({
    baseUrl: backend,
    paths: { 'src/*': ['src/*'] },
  })
  load('@nestjs/common').Logger.overrideLogger(false)
  const { createDashboardFixture, fixtureSnapshot, DASHBOARD_FIXTURE_USER_ID } =
    load('./test/balance-query/fixtures/dashboard.fixture.ts')
  const next = createInterface({ input: process.stdin })[Symbol.asyncIterator]()
  let index = 0
  for (const count of [0, 4, 20]) {
    for (const currency of ['USD', 'JPY']) {
      for (const period of periods) {
        const fixture = createDashboardFixture(count)
        const originalUser = fixture.users.findOne
        fixture.users.findOne = async (id) => {
          const user = await originalUser(id)
          return user ? { ...user, settings: { currency } } : null
        }
        const originalRates = fixture.rates.getRatesForDateRange
        const usdValue = { USD: 1, EUR: 1.1, JPY: 0.007 }
        fixture.rates.getRatesForDateRange = async (...args) =>
          (await originalRates(...args)).map((row) => ({
            ...row,
            rates: row.rates.map((rate) => ({
              ...rate,
              rate: usdValue[rate.baseCurrency] / usdValue[rate.targetCurrency],
            })),
          }))
        if (count === 4) {
          // Add explicit zero baselines, negative debt, currency changes, an
          // archived negative asset, and real sync later than the selected range.
          const [asset, other, empty, debt] = fixture.accounts
          fixture.snapshots.splice(
            0,
            fixture.snapshots.length,
            fixtureSnapshot(asset.id, '2016-09-01', 10000, 'JPY'),
            fixtureSnapshot(asset.id, '2026-09-01', -20000, 'USD'),
            fixtureSnapshot(asset.id, '2026-10-01', 80000, 'USD'),
            fixtureSnapshot(other.id, '2016-09-01', 30000, 'USD'),
            fixtureSnapshot(other.id, '2026-09-05', 40000, 'USD'),
            fixtureSnapshot(empty.id, '2026-09-05', 12345, 'JPY'),
            fixtureSnapshot(debt.id, '2016-09-01', -5000, 'USD'),
            fixtureSnapshot(debt.id, '2026-09-05', 6000, 'USD'),
          )
        }
        const query = { period, endDate: '2026-09-05' }
        const summary = await fixture.dashboard.getSummary(
          DASHBOARD_FIXTURE_USER_ID,
          query,
        )
        const series = await fixture.dashboard.getSeries(
          DASHBOARD_FIXTURE_USER_ID,
          query,
        )
        const legacy = await fixture.legacy.getAllBalancesForDateRange(
          summary.startDate,
          summary.endDate,
          DASHBOARD_FIXTURE_USER_ID,
        )
        const filename = path.join(directory, `fixture-${index++}.json`)
        await writeFile(
          filename,
          JSON.stringify({ count, currency, period, legacy, summary, series }),
        )
        process.stdout.write(`${filename}\n`)
        // Keep at most one full legacy payload on disk and one in each process.
        const acknowledgment = await next.next()
        if (acknowledgment.done) return
      }
    }
  }
  process.stdin.destroy()
}

function normalizedAccount(account) {
  return {
    id: account.id,
    name: account.name,
    customName: account.customName ?? null,
    type: account.type,
    subType: account.subType ?? null,
    valuationMode: account.valuationMode,
    institutionName: account.institutionName ?? null,
    archivedAt: account.archivedAt ?? null,
    syncedAt: account.syncedAt ?? null,
    effectiveBalance: account.effectiveBalance,
    convertedEffectiveBalance: account.convertedEffectiveBalance ?? null,
    changeAmount: account.changeAmount ?? null,
    changePercent: account.changePercent ?? null,
  }
}

function verifyFixture(fixture, transform, signedAmount, moneyFromMajor) {
  const { count, currency, period, legacy, summary, series } = fixture
  const label = `${count} accounts / ${currency} / ${period}`
  const equal = (actual, expected, field) => {
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error(`${label}: ${field} differs`)
    }
  }
  const previous = transform(legacy, period, currency)
  equal(summary.netWorth, previous.netWorth, 'net worth')
  equal(summary.changeAmount, previous.changeAmount, 'change amount')
  equal(summary.changePercent, previous.changePercent, 'change percent')
  equal(
    summary.assets.map(normalizedAccount),
    previous.assets.map(normalizedAccount),
    'asset fields and ordering',
  )
  equal(
    summary.liabilities.map(normalizedAccount),
    previous.liabilities.map(normalizedAccount),
    'liability fields and ordering',
  )
  // The old chart accumulated major-unit floats (including fractional-cent
  // binary tails). Canonicalize with the existing frontend money function to
  // compare exact minor units under the new integer-money wire contract.
  const previousPoints = previous.chartData.map(({ date, value }) => ({
    date,
    netWorth: moneyFromMajor(value, currency),
  }))
  equal(series.points, previousPoints, 'chart dates and minor-unit values')
  equal(
    series.points.map((point) => signedAmount(point.netWorth)),
    previousPoints.map((point) => signedAmount(point.netWorth)),
    'chart presentation values',
  )
  equal(summary.assets.length + summary.liabilities.length, count, 'cohort')
  if (series.points.length > 122) throw new Error(`${label}: chart bound`)
  if (count > 0) {
    equal(series.points.at(-1).netWorth, summary.netWorth, 'final point')
  }
  const oldJson = JSON.stringify(legacy)
  const summaryJson = JSON.stringify(summary)
  const seriesJson = JSON.stringify(series)
  const measurements = {
    accounts: count,
    reportingCurrency: currency,
    period,
    legacyDays: legacy.length,
    chartPoints: series.points.length,
    oldBytes: Buffer.byteLength(oldJson),
    compactBytes:
      Buffer.byteLength(summaryJson) + Buffer.byteLength(seriesJson),
    oldGzipBytes: gzipSync(oldJson).byteLength,
    compactGzipBytes:
      gzipSync(summaryJson).byteLength + gzipSync(seriesJson).byteLength,
  }
  if (
    count === 20 &&
    period === 'tenYears' &&
    measurements.compactBytes >= measurements.oldBytes * 0.1
  ) {
    throw new Error(`${label}: payload reduction budget`)
  }
  return measurements
}

async function verify() {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'splice-dashboard-parity-'),
  )
  const reportIndex = process.argv.indexOf('--report')
  const reportPath =
    reportIndex === -1
      ? path.join(tmpdir(), 'splice-dashboard-parity-report.json')
      : path.resolve(process.argv[reportIndex + 1])
  let child
  let completion
  try {
    const bundledTransform = path.join(directory, 'balance-utils.mjs')
    await build({
      entryPoints: [path.join(frontend, 'src/lib/balance-utils.ts')],
      outfile: bundledTransform,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    })
    const { transformToDashboardData, getSignedAmount, createMoneyWithSign } =
      await import(pathToFileURL(bundledTransform).href)
    child = spawn(process.execPath, [script, '--fixture-worker', directory], {
      cwd: backend,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    completion = new Promise((resolve) => {
      child.once('error', (error) => resolve({ error }))
      child.once('close', (code) => resolve({ code }))
    })
    // Keep failure messages bounded and avoid logging fixture financial values.
    child.stderr.resume()
    const measurements = []
    for await (const filename of createInterface({ input: child.stdout })) {
      const fixture = JSON.parse(await readFile(filename, 'utf8'))
      measurements.push(
        verifyFixture(
          fixture,
          transformToDashboardData,
          getSignedAmount,
          createMoneyWithSign,
        ),
      )
      await rm(filename)
      child.stdin.write('next\n')
    }
    const result = await completion
    if (result.error) throw result.error
    if (result.code !== 0)
      throw new Error(`Fixture process exited with code ${result.code}`)
    if (measurements.length !== 42) throw new Error('Incomplete fixture matrix')
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          cases: measurements.length,
          accountCohorts: [0, 4, 20],
          reportingCurrencies: ['USD', 'JPY'],
          periods,
          comparison: 'Current frontend transform versus compact API responses',
          chartPrecision:
            'Exact reporting-currency minor units via the existing frontend createMoneyWithSign; removes old binary floating-point tails only',
          measurements,
        },
        null,
        2,
      ) + '\n',
    )
    console.info(`Dashboard parity passed: ${measurements.length} cases.`)
    console.info(`Measurement report: ${reportPath}`)
  } finally {
    child?.kill()
    if (completion) await completion
    await rm(directory, { recursive: true, force: true })
  }
}

try {
  if (process.argv[2] === '--fixture-worker')
    await writeFixtures(process.argv[3])
  else await verify()
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Dashboard parity failed',
  )
  process.exitCode = 1
}
