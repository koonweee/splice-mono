// Run from repository root: TS_NODE_PROJECT=backend/tsconfig.json node -r
// ./backend/node_modules/ts-node/register/transpile-only -r
// ./backend/node_modules/tsconfig-paths/register frontend/scripts/performance-fixture.cjs
const http = require('node:http')
const { gzipSync } = require('node:zlib')
const {
  createDashboardFixture,
  DASHBOARD_FIXTURE_USER_ID: userId,
} = require('../../backend/test/balance-query/fixtures/dashboard.fixture.ts')
const fixtures = new Map([
  ['large', createDashboardFixture(20)],
  ['mixed', createDashboardFixture(4)],
  ['empty', createDashboardFixture(0)],
])
const cache = new Map()
const requests = []
const controls = { failPath: null, delayPath: null, delayMs: 0 }
const date = '2026-09-05'
const money = (amount) => ({
  money: { amount: Math.abs(amount), currency: 'USD' },
  sign: amount < 0 ? 'negative' : 'positive',
})
const user = {
  id: userId,
  email: 'fixture@example.test',
  displayName: 'Performance fixture',
  settings: { currency: 'USD', timezone: 'UTC', theme: 'splice-dark' },
  createdAt: `${date}T00:00:00Z`,
  updatedAt: `${date}T00:00:00Z`,
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:4310')
  res.setHeader(
    'Access-Control-Allow-Origin',
    req.headers.origin || 'http://localhost:4301',
  )
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method === 'OPTIONS') return res.end()
  const selected =
    /(?:fixture=|splice_access_token=fixture_)(empty|mixed|large)/.exec(
      req.headers.cookie || '',
    )?.[1] || 'large'
  const fixture = fixtures.get(selected)
  let body
  try {
    if (url.pathname === '/__control') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      Object.assign(controls, JSON.parse(raw))
      res.end('{}')
      return
    }
    if (url.pathname === '/__reset') {
      for (const [name, count] of [
        ['large', 20],
        ['mixed', 4],
        ['empty', 0],
      ])
        fixtures.set(name, createDashboardFixture(count))
      cache.clear()
      requests.length = 0
      Object.assign(controls, { failPath: null, delayPath: null, delayMs: 0 })
      Object.assign(user.settings, {
        currency: 'USD',
        timezone: 'UTC',
        theme: 'splice-dark',
      })
      res.end('{}')
      return
    }
    if (controls.delayPath === url.pathname)
      await new Promise((resolve) => setTimeout(resolve, controls.delayMs))
    if (controls.failPath === url.pathname) {
      res.statusCode = 503
      res.end('{"message":"Synthetic outage"}')
      return
    }

    if (url.pathname === '/__requests') {
      body = requests.splice(0)
    } else if (url.pathname === '/health') {
      body = { status: 'ok' }
    } else if (url.pathname === '/user/me') {
      body = user
    } else if (url.pathname === '/user/refresh') {
      body = {}
      res.setHeader('Set-Cookie', [
        'splice_access_token=fixture; HttpOnly; Path=/; SameSite=Lax',
        'splice_refresh_token=fixture; HttpOnly; Path=/; SameSite=Lax',
      ])
    } else if (
      url.pathname === '/user/logout' ||
      url.pathname === '/user/logout-all'
    ) {
      res.setHeader('Set-Cookie', [
        'splice_access_token=; Max-Age=0; HttpOnly; Path=/',
        'splice_refresh_token=; Max-Age=0; HttpOnly; Path=/',
      ])
      body = {}
    } else if (url.pathname === '/user/settings') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      Object.assign(user.settings, JSON.parse(raw))
      body = user.settings
    } else if (url.pathname === '/account') {
      body = fixture.accounts.map((account) => account.toObject())
    } else if (/^\/account\//.test(url.pathname)) {
      const account = fixture.accounts.find(
        (a) => a.id === url.pathname.split('/')[2],
      )
      if (req.method === 'PATCH') {
        let raw = ''
        for await (const chunk of req) raw += chunk
        Object.assign(account, JSON.parse(raw))
        cache.clear()
      }
      body = account?.toObject()
    } else if (url.pathname.startsWith('/balance-query/')) {
      const key = selected + url.pathname + url.search
      if (!cache.has(key)) {
        const query = {
          period: url.searchParams.get('period') || 'month',
          endDate: url.searchParams.get('endDate') || date,
        }
        if (url.pathname.endsWith('/dashboard-summary'))
          body = await fixture.dashboard.getSummary(userId, query)
        else if (url.pathname.endsWith('/dashboard-series'))
          body = await fixture.dashboard.getSeries(userId, query)
        else if (url.pathname.endsWith('/balances'))
          body = await fixture.legacy.getBalancesForDateRange(
            (url.searchParams.get('accountIds') || '').split(','),
            url.searchParams.get('startDate') || '2026-08-06',
            query.endDate,
            userId,
          )
        else
          body = await fixture.legacy.getAllBalancesForDateRange(
            url.searchParams.get('startDate') || '2026-08-06',
            query.endDate,
            userId,
          )
        cache.set(key, body)
      }
      body = cache.get(key)
    } else if (url.pathname === '/transaction') {
      const rows =
        selected === 'empty'
          ? []
          : Array.from({ length: 65 }, (_, index) => ({
              id: `fixture-tx-${index}`,
              source: 'manual',
              amount: money(-1234 - index),
              accountId: fixture.accounts[0].id,
              merchantName: `Fixture purchase ${index + 1}`,
              providerTransactionName: null,
              originalDescription: 'Synthetic transaction',
              pending: false,
              activityDate: date,
              providerDate: date,
              categoryId: null,
              accountName: 'Fixture account 0',
              categoryAssignmentSource: 'manual',
              createdAt: `${date}T12:00:00Z`,
              updatedAt: `${date}T12:00:00Z`,
              userId,
            }))
      const start = Number(url.searchParams.get('pageIndex') || 0) * 50
      body = {
        data: rows.slice(start, start + 50),
        total: rows.length,
        pageIndex: String(start / 50),
        pageSize: '50',
      }
    } else if (url.pathname === '/transaction-analysis')
      body = {
        startDate: date,
        endDate: date,
        currency: 'USD',
        inflows: [],
        outflows: [],
        totalInflow: 150000,
        totalOutflow: 25000,
        netFlow: 125000,
        uncategorizedInflow: 150000,
        uncategorizedOutflow: 25000,
      }
    else body = []
    const raw = Buffer.from(JSON.stringify(body ?? null))
    const bytes = /gzip/.test(req.headers['accept-encoding'] || '')
      ? gzipSync(raw)
      : raw
    requests.push({
      path: url.pathname,
      search: url.search,
      method: req.method,
      raw: raw.length,
      bytes: bytes.length,
    })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Timing-Allow-Origin', '*')
    if (bytes !== raw) res.setHeader('Content-Encoding', 'gzip')
    res.end(bytes)
  } catch (error) {
    console.error(error.message)
    res.statusCode = 500
    res.end(JSON.stringify({ message: error.message }))
  }
})
server.listen(4310, '127.0.0.1', () =>
  console.log('Synthetic performance API on localhost:4310'),
)
