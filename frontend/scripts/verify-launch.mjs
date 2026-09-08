/** Built launch regression with synthetic users only. Run after yarn build. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import { chromium } from 'playwright'

const calls = []
const money = (amount) => ({
  money: { amount: String(Math.abs(amount)), currency: 'USD' },
  sign: amount < 0 ? 'negative' : 'positive',
})
const api = createServer((req, res) => {
  calls.push(req.url)
  const url = new URL(req.url, 'http://api.test')
  const token = /splice_access_token=([^;]+)/.exec(
    req.headers.cookie ?? '',
  )?.[1]
  res.setHeader('Content-Type', 'application/json')
  if (token !== 'alice') {
    res.statusCode = token === 'unavailable' ? 503 : 401
    res.end('{}')
    return
  }
  const range = {
    period: url.searchParams.get('period') ?? 'month',
    startDate: '2026-08-07',
    endDate: url.searchParams.get('endDate'),
    reportingCurrency: 'USD',
  }
  if (url.pathname === '/user/me') {
    res.end(
      JSON.stringify({
        id: 'alice',
        email: 'alice@example.test',
        settings: { timezone: 'UTC', currency: 'USD' },
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }),
    )
  } else if (url.pathname === '/balance-query/dashboard-summary') {
    res.end(
      JSON.stringify({
        ...range,
        netWorth: money(123456),
        changeAmount: money(1200),
        changePercent: 1,
        assets: [
          {
            id: 'alice-account',
            name: 'ACCOUNT_ALICE',
            type: 'depository',
            valuationMode: 'balance',
            effectiveBalance: money(123456),
            changeAmount: money(1200),
            changePercent: 1,
          },
        ],
        liabilities: [],
      }),
    )
  } else if (url.pathname === '/balance-query/dashboard-series') {
    res.end(
      JSON.stringify({
        ...range,
        points: [{ date: range.endDate, netWorth: money(123456) }],
      }),
    )
  } else {
    res.end('[]')
  }
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

  for (const token of ['alice', 'invalid', 'unavailable']) {
    const before = calls.length
    const launch = await fetch(origin, {
      headers: { Cookie: `splice_access_token=${token}` },
    })
    assert.equal(launch.status, 200)
    const html = await launch.text()
    assert.ok(html.includes('Checking session'))
    assert.ok(!html.includes('ACCOUNT_'))
    assert.equal(calls.length, before, 'Launch HTML must not wait for the API')
  }
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({
      viewport: { width: 430, height: 932 },
      serviceWorkers: 'block',
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let releaseSession
    let sessionToken = 'alice'
    const sessionGate = new Promise((resolve) => {
      releaseSession = resolve
    })
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.hostname !== 'localhost' || url.port !== '3000')
        return route.continue()
      if (url.pathname === '/user/me') await sessionGate
      const response = await fetch(
        `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`,
        {
          headers: { Cookie: `splice_access_token=${sessionToken}` },
        },
      )
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: await response.text(),
      })
    })
    // Browser API resolution uses localhost:3000 for a localhost preview.
    await page.goto(`http://localhost:${port}`)
    await page
      .getByRole('status')
      .filter({ hasText: 'Checking session' })
      .waitFor()
    assert.equal(await page.getByText('ACCOUNT_ALICE').count(), 0)
    releaseSession()
    await page.waitForURL('**/home')
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    sessionToken = 'invalid'
    await page.goto(`http://localhost:${port}`)
    await page.getByRole('button', { name: /Google/ }).waitFor()
    assert.equal(await page.getByText('ACCOUNT_ALICE').count(), 0)
    sessionToken = 'unavailable'
    await page.goto(`http://localhost:${port}`)
    await page
      .locator('button[data-size="lg"]')
      .filter({ hasText: /^Retry$/ })
      .waitFor()
    assert.equal(await page.getByText('ACCOUNT_ALICE').count(), 0)
    assert.deepEqual(errors, [], 'Launch must hydrate without errors')

    // Direct entry must reserve the same known page controls before hydration.
    // These synthetic settings reads are empty; no real account data is needed.
    for (const width of [390, 1440]) {
      for (const tab of [
        'categories',
        'analysis',
        'categorization',
        'recurring',
      ]) {
        const positions = []
        for (const javaScriptEnabled of [false, true]) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            javaScriptEnabled,
            serviceWorkers: 'block',
          })
          try {
            await context.addCookies([
              {
                name: 'splice_access_token',
                value: 'alice',
                url: `http://localhost:${port}`,
              },
            ])
            await context.route('http://localhost:3000/**', async (route) => {
              const url = new URL(route.request().url())
              const response = await fetch(
                `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`,
                { headers: { Cookie: 'splice_access_token=alice' } },
              )
              await route.fulfill({
                status: response.status,
                contentType: 'application/json',
                body: await response.text(),
              })
            })
            const settings = await context.newPage()
            const hydrationErrors = []
            settings.on('pageerror', (error) =>
              hydrationErrors.push(error.message),
            )
            await settings.goto(
              `http://localhost:${port}/settings?tab=${tab}`,
              { waitUntil: 'networkidle' },
            )
            const heading =
              tab === 'categories'
                ? 'Categories'
                : tab === 'analysis'
                  ? 'Analysis rules'
                  : tab === 'categorization'
                    ? 'Categorization rules'
                    : 'Recurring transactions'
            const section = settings
              .locator('[data-typography="sectionHeading"]:visible')
              .filter({ hasText: new RegExp(`^${heading}$`) })
            await section.waitFor()
            const anchor = await section.boundingBox()
            assert.ok(
              anchor,
              `${tab} section must be visible before and after hydration`,
            )
            const search =
              tab === 'recurring'
                ? null
                : await settings
                    .locator(
                      `input[placeholder="${tab === 'categories' ? 'Search categories...' : 'Search rules...'}"]:visible`,
                    )
                    .boundingBox()
            if (tab !== 'recurring')
              assert.ok(search, `${tab} filter must exist before hydration`)
            positions.push({ heading: anchor.y, filter: search?.y })
            assert.deepEqual(
              hydrationErrors,
              [],
              `${tab} must hydrate without errors`,
            )
          } finally {
            await context.close()
          }
        }
        assert.ok(
          Math.abs(positions[0].heading - positions[1].heading) <= 1,
          `${tab} ${width}px heading moved on hydration: ${JSON.stringify(positions)}`,
        )
        if (positions[0].filter !== undefined)
          assert.ok(
            Math.abs(positions[0].filter - positions[1].filter) <= 1,
            `${tab} ${width}px filter moved on hydration: ${JSON.stringify(positions)}`,
          )
        console.log(`PASS: ${tab} ${width}px SSR/hydrated control anchors`)
      }
    }
  } finally {
    await browser.close()
  }

  const privateHome = await fetch(`${origin}/home`, {
    headers: { Cookie: 'splice_access_token=alice' },
  })
  assert.ok((await privateHome.text()).includes('>ACCOUNT_ALICE<'))
  const anonymousHome = await fetch(`${origin}/home`, { redirect: 'manual' })
  assert.equal(anonymousHome.status, 307)
  assert.ok(anonymousHome.headers.get('location').includes('login=true'))
  console.log(
    'PASS: immediate launch HTML, delayed session, Home redirect, login/retry outcomes, hydration, and private-route SSR/auth.',
  )
} finally {
  server.kill('SIGTERM')
  await once(server, 'exit')
  await new Promise((resolve) => api.close(resolve))
}
