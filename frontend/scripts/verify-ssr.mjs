/** Built-Nitro integration, with synthetic users only. Run after yarn build. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'

const calls = []
let releaseSeries
let holdSeries = true
let failedPath
const money = (amount) => ({
  money: { amount: Math.abs(amount), currency: 'USD' },
  sign: amount < 0 ? 'negative' : 'positive',
})
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://api.test')
  const cookie = req.headers.cookie ?? ''
  const token = /splice_access_token=([^;]+)/.exec(cookie)?.[1] ?? ''
  calls.push({ path: req.url, token, cookie })
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  if (url.pathname === failedPath) {
    res.statusCode = 503
    res.end('{}')
    return
  }
  if (token === 'unavailable') {
    res.statusCode = 503
    res.end('{}')
    return
  }
  if (req.url === '/user/refresh') {
    if (!cookie.includes('splice_refresh_token=valid')) {
      res.statusCode = 401
      res.end('{}')
      return
    }
    res.setHeader('Set-Cookie', [
      'splice_access_token=alice; Path=/; HttpOnly; SameSite=Lax',
      'splice_refresh_token=rotated; Path=/; HttpOnly; Expires=Wed, 01 Jan 2031 00:00:00 GMT',
    ])
    res.end(
      JSON.stringify({
        accessToken: 'DO_NOT_SERIALIZE_REFRESH_BODY',
        refreshToken: 'DO_NOT_SERIALIZE_REFRESH_BODY',
      }),
    )
    return
  }
  if (!['alice', 'bob'].includes(token)) {
    res.statusCode = 401
    res.end('{}')
    return
  }
  if (req.url === '/user/me') {
    res.end(
      JSON.stringify({
        id: token,
        email: `${token}@example.test`,
        settings: {
          theme: token === 'alice' ? 'splice-light' : 'oled-black',
          timezone: 'UTC',
          currency: 'USD',
        },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }),
    )
    return
  }
  if (req.url === '/account') {
    res.end(
      JSON.stringify([
        {
          id: `${token}-account`,
          name: `ACCOUNT_${token.toUpperCase()}`,
          customName: null,
          type: 'depository',
          valuationMode: 'balance',
          userId: token,
          providerAccountId: token,
          isManual: true,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ]),
    )
    return
  }
  const endDate = url.searchParams.get('endDate') ?? '2026-09-05'
  const range = {
    period: url.searchParams.get('period') ?? 'month',
    startDate: '2026-08-07',
    endDate,
    reportingCurrency: 'USD',
    generatedAt: `${endDate}T12:00:00Z`,
  }
  if (url.pathname === '/balance-query/dashboard-summary') {
    res.end(
      JSON.stringify({
        ...range,
        netWorth: money(123456),
        changeAmount: money(1200),
        changePercent: 1,
        assets: [
          {
            id: `${token}-account`,
            name: `ACCOUNT_${token.toUpperCase()}`,
            customName: null,
            type: 'depository',
            subType: null,
            valuationMode: 'balance',
            institutionName: null,
            archivedAt: null,
            syncedAt: `${endDate}T12:00:00Z`,
            effectiveBalance: money(123456),
            changeAmount: money(1200),
            changePercent: 1,
          },
        ],
        liabilities: [],
      }),
    )
    return
  }
  if (url.pathname === '/balance-query/dashboard-series') {
    releaseSeries = () =>
      res.end(
        JSON.stringify({
          ...range,
          points: [{ date: endDate, netWorth: money(123456) }],
        }),
      )
    if (!holdSeries) releaseSeries()
    return
  }
  if (url.pathname === '/transaction') {
    res.end(
      JSON.stringify({
        data: [
          {
            id: 'first-transaction',
            source: 'manual',
            amount: money(-1234),
            accountId: `${token}-account`,
            merchantName: 'SSR_FIRST_TRANSACTION',
            providerTransactionName: null,
            originalDescription: 'Synthetic transaction',
            pending: false,
            activityDate: endDate,
            providerDate: endDate,
            categoryId: null,
            accountName: `ACCOUNT_${token.toUpperCase()}`,
            categoryAssignmentSource: 'manual',
            createdAt: `${endDate}T12:00:00Z`,
            updatedAt: `${endDate}T12:00:00Z`,
            userId: token,
          },
        ],
        total: 1,
        pageIndex: '0',
        pageSize: '50',
      }),
    )
    return
  }
  if (url.pathname === '/transaction-analysis') {
    res.end(
      JSON.stringify({
        startDate: url.searchParams.get('startDate'),
        endDate,
        currency: 'USD',
        inflows: [],
        outflows: [],
        totalInflow: 150000,
        totalOutflow: 25000,
        netFlow: 125000,
        uncategorizedInflow: 150000,
        uncategorizedOutflow: 25000,
      }),
    )
    return
  }
  res.end('[]')
})
api.listen(0, '127.0.0.1')
await once(api, 'listening')
const apiPort = api.address().port
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((resolve) => reservation.close(resolve))
let log = ''
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    SPLICE_INTERNAL_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (chunk) => {
  log += chunk
})
server.stderr.on('data', (chunk) => {
  log += chunk
})
const origin = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(origin)
      ready = true
      break
    } catch {
      await pause(100)
    }
  }
  assert.ok(ready, `Nitro failed to start: ${log}`)
  calls.length = 0
  const responses = await Promise.all(
    ['alice', 'bob'].map(async (user) => {
      const response = await fetch(`${origin}/accounts`, {
        headers: {
          Cookie: `splice_access_token=${user}; unrelated=NEVER_FORWARD`,
        },
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      return response.text()
    }),
  )
  assert.ok(
    responses[0].includes('ACCOUNT_ALICE'),
    'Alice account must appear in server-rendered content',
  )
  assert.ok(
    !responses[0].includes('ACCOUNT_BOB'),
    'Alice response must not contain Bob data',
  )
  assert.ok(
    responses[1].includes('ACCOUNT_BOB'),
    'Bob account must appear in server-rendered content',
  )
  assert.ok(
    !responses[1].includes('ACCOUNT_ALICE'),
    'Bob response must not contain Alice data',
  )
  assert.ok(responses[0].includes('data-mantine-color-scheme="light"'))
  assert.ok(responses[1].includes('data-mantine-color-scheme="dark"'))
  assert.ok(
    responses.every((html) => !html.includes('data-splice-theme-loading')),
  )
  assert.equal(
    calls.filter((call) => call.path === '/user/me').length,
    2,
    'Exactly one session request per SSR document',
  )
  assert.ok(calls.every((call) => !call.cookie.includes('NEVER_FORWARD')))

  calls.length = 0
  const recovered = await fetch(`${origin}/accounts`, {
    headers: {
      Cookie: 'splice_access_token=expired; splice_refresh_token=valid',
    },
  })
  const recoveredHtml = await recovered.text()
  assert.equal(recovered.status, 200)
  assert.equal(
    recovered.headers.getSetCookie().length,
    2,
    'Separate rotated cookies reach the document before streaming',
  )
  assert.ok(
    recovered.headers.getSetCookie()[1].includes('Expires=Wed, 01 Jan 2031'),
  )
  assert.ok(recoveredHtml.includes('ACCOUNT_ALICE'))
  assert.ok(!recoveredHtml.includes('DO_NOT_SERIALIZE_REFRESH_BODY'))
  assert.equal(calls.filter((call) => call.path === '/user/refresh').length, 1)
  assert.equal(calls.filter((call) => call.path === '/user/me').length, 2)

  calls.length = 0
  // The fake API returns the same replacement for the old token, matching
  // the backend AuthService's separately tested duplicate-within-grace contract.
  const concurrentRecovery = await Promise.all(
    ['/accounts', '/accounts'].map(async (route) => {
      const response = await fetch(origin + route, {
        headers: {
          Cookie: 'splice_access_token=expired; splice_refresh_token=valid',
        },
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.getSetCookie().length, 2)
      const html = await response.text()
      assert.ok(html.includes('ACCOUNT_ALICE'))
      assert.ok(!html.includes('DO_NOT_SERIALIZE_REFRESH_BODY'))
      return response.headers.getSetCookie()
    }),
  )
  assert.deepEqual(concurrentRecovery[0], concurrentRecovery[1])
  assert.equal(calls.filter((call) => call.path === '/user/refresh').length, 2)

  calls.length = 0
  const homeFetch = fetch(`${origin}/home`, {
    headers: { Cookie: 'splice_access_token=alice; splice_mask_balances=0' },
  })
  const home = await Promise.race([homeFetch, pause(2500).then(() => null)])
  if (!home) releaseSeries?.()
  assert.ok(home, 'Home response headers must not wait for chart data')
  assert.equal(home.headers.get('cache-control'), 'private, no-store')
  const reader = home.body.getReader()
  let firstHtml = ''
  const usefulContent = (async () => {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) return false
      firstHtml += new TextDecoder().decode(chunk.value)
      if (firstHtml.includes('>ACCOUNT_ALICE<')) return true
    }
  })()
  const summaryArrived = await Promise.race([
    usefulContent,
    pause(2500).then(() => false),
  ])
  releaseSeries?.()
  holdSeries = false
  assert.ok(
    summaryArrived,
    'Home must render account cards before the chart response completes',
  )
  while (!(await reader.read()).done) {
    /* drain deferred query hydration */
  }
  assert.equal(
    calls.filter((call) =>
      call.path.startsWith('/balance-query/dashboard-summary?'),
    ).length,
    1,
  )
  assert.equal(calls.filter((call) => call.path === '/user/me').length, 1)

  calls.length = 0
  const transactions = await fetch(
    `${origin}/transactions?startDate=2026-08-01&endDate=2026-08-31`,
    { headers: { Cookie: 'splice_access_token=alice' } },
  )
  const transactionsHtml = await transactions.text()
  assert.equal(transactions.status, 200)
  assert.equal(transactions.headers.get('cache-control'), 'private, no-store')
  assert.ok(
    transactionsHtml.includes('>SSR_FIRST_TRANSACTION<'),
    'First transaction must appear in server-rendered table rows',
  )
  const transactionRequests = calls.filter((call) =>
    call.path.startsWith('/transaction?'),
  )
  assert.equal(transactionRequests.length, 1, 'SSR loads one first page only')
  assert.ok(transactionRequests[0].path.includes('pageSize=50'))
  assert.ok(transactionRequests[0].path.includes('pageIndex=0'))
  assert.ok(transactionRequests[0].path.includes('startDate=2026-08-01'))

  calls.length = 0
  const analysis = await fetch(
    `${origin}/analysis?startDate=2026-08-01&endDate=2026-08-31`,
    { headers: { Cookie: 'splice_access_token=alice' } },
  )
  const analysisHtml = await analysis.text()
  assert.equal(analysis.status, 200)
  assert.ok(
    analysisHtml.includes('No transactions in this period'),
    'Analysis summary/empty state must render on the server',
  )
  assert.equal(
    calls.filter((call) => call.path.startsWith('/transaction-analysis?'))
      .length,
    1,
  )
  assert.ok(calls.every((call) => !call.path.includes('/audit')))

  for (const tab of ['general', 'categorization']) {
    calls.length = 0
    const settings = await fetch(`${origin}/settings?tab=${tab}`, {
      headers: { Cookie: 'splice_access_token=alice' },
    })
    const settingsHtml = await settings.text()
    assert.equal(settings.status, 200)
    assert.ok(settingsHtml.includes('Settings'))
    assert.equal(calls.filter((call) => call.path === '/user/me').length, 1)
    const sectionCalls = calls.filter((call) => call.path !== '/user/me')
    assert.ok(
      tab === 'general'
        ? sectionCalls.length === 0
        : sectionCalls.length === 1 &&
            sectionCalls[0].path.startsWith('/categorization-rules?'),
      'Only selected Settings list is fetched',
    )
  }

  failedPath = '/account'
  const accountFailure = await fetch(`${origin}/accounts`, {
    headers: { Cookie: 'splice_access_token=alice' },
  })
  const failureHtml = await accountFailure.text()
  failedPath = undefined
  assert.equal(
    accountFailure.status,
    200,
    'Essential read errors stay within the page shell',
  )
  assert.ok(
    failureHtml.includes('Failed to load accounts'),
    'Failed essential reads render local recovery UI',
  )

  for (const [route, path, label] of [
    ['/home', '/balance-query/dashboard-summary', 'Retry dashboard'],
    ['/analysis', '/transaction-analysis', 'Retry analysis'],
  ]) {
    failedPath = path
    const response = await fetch(`${origin}${route}`, {
      headers: { Cookie: 'splice_access_token=alice' },
    })
    const html = await response.text()
    assert.equal(response.status, 200)
    assert.ok(
      html.includes(`>${label}<`),
      `Cold ${route} failure needs an actionable Retry button`,
    )
    failedPath = undefined
  }

  const invalid = await fetch(`${origin}/accounts`, {
    redirect: 'manual',
    headers: {
      Cookie: 'splice_access_token=invalid; splice_refresh_token=invalid',
    },
  })
  assert.equal(invalid.status, 307)
  assert.ok(invalid.headers.get('location')?.includes('login=true'))
  assert.ok(!(await invalid.text()).includes('ACCOUNT_'))
  const publicUnavailable = await fetch(origin, {
    headers: { Cookie: 'splice_access_token=unavailable' },
  })
  assert.equal(publicUnavailable.status, 200)
  assert.ok((await publicUnavailable.text()).includes('Retry'))
  console.log(
    'PASS: built Nitro private SSR, two-user isolation, themes, refresh cookies, Home streaming, first transaction rows, Analysis, selected Settings list, local errors, anonymous redirect, and transient public landing.',
  )
} finally {
  releaseSeries?.()
  server.kill('SIGTERM')
  await once(server, 'exit')
  await new Promise((resolve) => api.close(resolve))
}
