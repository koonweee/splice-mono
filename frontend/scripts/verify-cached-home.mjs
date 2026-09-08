/** Production cached-launch integration. Synthetic data only; run after yarn build. */
import assert from 'node:assert/strict'
import { createServer, request as proxyRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import { chromium } from 'playwright'

const serving = process.argv.includes('--serve')
const money = (amount) => ({
  money: { amount: String(amount), currency: 'USD' },
  sign: 'positive',
})
const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://api.test')
  const token = /splice_access_token=([^;]+)/.exec(
    req.headers.cookie ?? '',
  )?.[1]
  res.setHeader('Content-Type', 'application/json')
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (!['alice', 'bob'].includes(token)) {
    res.statusCode = token === 'unavailable' ? 503 : 401
    res.end('{}')
    return
  }
  const range = {
    period: url.searchParams.get('period') ?? 'month',
    startDate: '2026-01-01',
    endDate: url.searchParams.get('endDate'),
    reportingCurrency: 'USD',
    generatedAt: new Date().toISOString(),
  }
  if (url.pathname === '/user/me') {
    res.end(
      JSON.stringify({
        id: token,
        email: `${token}@example.test`,
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          appearance: { mode: 'dark', accent: null },
          hideZeroBalanceAccounts: false,
        },
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
            id: `${token}-account`,
            name: `ACCOUNT_${token.toUpperCase()}`,
            customName: null,
            type: 'depository',
            subType: null,
            valuationMode: 'balance',
            institutionName: null,
            archivedAt: null,
            syncedAt: null,
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
  } else res.end('[]')
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
const origin = `http://localhost:${port}`
let browser
let gateway
const errors = []
const inspectSnapshot = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open('splice-home-snapshot', 1)
        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('snapshot')) {
            db.close()
            resolve(null)
            return
          }
          const get = db
            .transaction('snapshot')
            .objectStore('snapshot')
            .get('home')
          get.onsuccess = () => {
            db.close()
            resolve(get.result ?? null)
          }
          get.onerror = () => {
            db.close()
            resolve(null)
          }
        }
      }),
  )
try {
  let ready = false
  for (let n = 0; n < 100; n++) {
    try {
      await fetch(origin)
      ready = true
      break
    } catch {
      await pause(100)
    }
  }
  assert.ok(ready, `Nitro did not start: ${log}`)
  if (serving) {
    gateway = createServer((req, res) => {
      const apiRequest =
        /^\/(user|balance-query|notification|account)(\/|\?|$)/.test(req.url)
      const upstream = proxyRequest(
        {
          hostname: '127.0.0.1',
          port: apiRequest ? apiPort : port,
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers)
          response.pipe(res)
        },
      )
      upstream.on('error', () => {
        res.statusCode = 502
        res.end()
      })
      req.pipe(upstream)
    })
    gateway.listen(0, '::1')
    await once(gateway, 'listening')
    console.log(
      `Synthetic cached-Home fixture ready: http://[::1]:${gateway.address().port}`,
    )
    console.log(
      'Set browser cookie splice_access_token=alice on this origin, then open /. Only synthetic Alice/Bob data exists; API shares this origin and leaves port 3000 untouched.',
    )
    await once(process, 'SIGTERM')
  } else {
    browser = await chromium.launch({ channel: 'chromium' })
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'allow',
    })
    let token = 'alice'
    let offline = false
    let sessionGate = Promise.resolve()
    let heldRequests = 0
    let dashboardGate = Promise.resolve()
    let failDashboard = false
    let summaryRequests = 0
    const apiPaths = []
    context.on('page', (page) =>
      page.on('pageerror', (error) => errors.push(error.message)),
    )
    await context.addCookies([
      { name: 'splice_access_token', value: 'alice', url: origin },
    ])
    await context.route('http://localhost:3000/**', async (route) => {
      const url = new URL(route.request().url())
      apiPaths.push(url.pathname)
      if (url.pathname === '/balance-query/dashboard-summary') summaryRequests++
      if (offline) return route.abort('internetdisconnected')
      if (url.pathname === '/user/me') {
        heldRequests++
        await sessionGate
      }
      if (url.pathname.startsWith('/balance-query/')) await dashboardGate
      if (failDashboard && url.pathname === '/balance-query/dashboard-summary')
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        })
      if (route.request().frame().isDetached()) return
      const response = await fetch(
        `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`,
        { headers: { Cookie: `splice_access_token=${token}` } },
      )
      await route
        .fulfill({
          status: response.status,
          contentType: 'application/json',
          body: await response.text(),
        })
        .catch(() => {})
    })
    let page = await context.newPage()
    await page.goto(origin)
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    await page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    )
    let saved
    for (let n = 0; n < 60; n++) {
      saved = await inspectSnapshot(page)
      if (saved?.series) break
      await pause(100)
    }
    assert.equal(
      saved?.identity,
      'alice',
      'Verified Home must create a persistent snapshot',
    )
    assert.ok(saved.series, 'Successful series must persist independently')
    console.log(
      'PASS: online Home seeds bounded snapshot with summary and series',
    )

    let releaseSession
    sessionGate = new Promise((resolve) => {
      releaseSession = resolve
    })
    heldRequests = 0
    await page.close()
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page
      .locator('[inert][aria-label^="Saved Home"]')
      .waitFor()
      .catch(async (error) => {
        console.error('Cold preview diagnostics:', {
          url: page.url(),
          errors,
          heldRequests,
          state: await page.evaluate(() => ({
            text: document.body.innerText,
            local: document.documentElement.dataset.spliceLaunch,
            controlled: Boolean(navigator.serviceWorker.controller),
            storage: Object.fromEntries(Object.entries(localStorage)),
          })),
          snapshot: await inspectSnapshot(page),
        })
        throw error
      })
    assert.equal(
      await page.locator('html').getAttribute('data-splice-launch'),
      'local',
    )
    assert.ok(
      heldRequests > 0,
      'Session is validating concurrently with preview',
    )
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    assert.equal(
      await page.getByText('Checking session…', { exact: true }).count(),
      0,
    )
    let releaseFirstDashboard
    dashboardGate = new Promise((resolve) => {
      releaseFirstDashboard = resolve
    })
    releaseSession()
    await page
      .getByRole('button', { name: 'Hide balances', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Show balances', exact: true })
      .waitFor()
    releaseFirstDashboard()
    await page
      .locator('[inert][aria-label^="Saved Home"]')
      .waitFor({ state: 'detached' })
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    await page
      .getByRole('button', { name: 'Show balances', exact: true })
      .waitFor()
    assert.equal(
      await page.getByText('$1,234.56', { exact: true }).count(),
      0,
      'Masking changed during validation must survive handoff',
    )
    console.log(
      'PASS: cold document paints local saved Home before held session, then live handoff preserves masking',
    )

    let releasePeriod
    dashboardGate = new Promise((resolve) => {
      releasePeriod = resolve
    })
    const beforePeriodRequests = summaryRequests
    const liveHeader = await page.locator('header').elementHandle()
    await page.getByRole('button', { name: 'Week', exact: true }).click()
    for (let n = 0; n < 30 && summaryRequests === beforePeriodRequests; n++)
      await pause(100)
    assert.ok(
      summaryRequests > beforePeriodRequests,
      'Changing period requests matching data',
    )
    // Wait beyond router pending delay while the response remains held.
    await page.waitForTimeout(1500)
    assert.equal(
      await liveHeader.evaluate((element) => element.isConnected),
      true,
      'Period changes keep the verified live shell mounted',
    )
    assert.equal(
      await page.locator('[inert][aria-label^="Saved Home"]').count(),
      0,
      'Period changes never re-enter launch preview',
    )
    assert.equal(
      await page.getByRole('button', { name: 'Week', exact: true }).isEnabled(),
      true,
    )
    releasePeriod()
    await page.waitForURL('**period=week')
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    console.log(
      'PASS: held period-change read retains verified live page and never re-enters cached launch',
    )

    await page.close()
    offline = true
    await context.setOffline(true)
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.locator('[inert][aria-label^="Saved Home"]').waitFor()
    await page.getByRole('button', { name: /^Offline/ }).waitFor()
    console.log(
      'PASS: offline cold restart boots saved Home and offline header icon',
    )
    await page.close()
    offline = false
    await context.setOffline(false)

    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const opening = indexedDB.open('splice-home-snapshot', 1)
          opening.onsuccess = () => {
            const db = opening.result
            const tx = db.transaction('snapshot', 'readwrite')
            const store = tx.objectStore('snapshot')
            const get = store.get('home')
            get.onsuccess = () => {
              const value = get.result
              const yesterday = new Date(Date.now() - 86400000)
                .toISOString()
                .slice(0, 10)
              value.endDate = yesterday
              value.summary.data.endDate = yesterday
              if (value.series) {
                value.series.data.endDate = yesterday
                value.series.data.points = value.series.data.points.map(
                  (point) => ({ ...point, date: yesterday }),
                )
              }
              store.put(value, 'home')
            }
            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }
          opening.onerror = () => reject(opening.error)
        }),
    )
    failDashboard = true
    await page.close()
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Couldn't refresh/ }).waitFor()
    await page.locator('[inert][aria-label^="Saved Home"]').waitFor()
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    console.log(
      'PASS: yesterday snapshot remains a truthful saved preview when today summary fails',
    )
    failDashboard = false
    await page.close()

    token = 'unavailable'
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Couldn't refresh/ }).waitFor()
    await page.getByText('ACCOUNT_ALICE', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: /^Couldn't refresh/ }).click()
    await page
      .getByRole('dialog', { name: /^Couldn't refresh/ })
      .waitFor({ timeout: 3000 })
      .catch(async (error) => {
        console.error(
          'Popover diagnostics',
          await page
            .locator('[role="dialog"], [role="tooltip"]')
            .evaluateAll((nodes) => nodes.map((n) => n.outerHTML)),
        )
        throw error
      })
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor()
    console.log(
      'PASS: transient failure retains preview with header detail and Retry',
    )

    token = 'bob'
    let releaseDashboard
    dashboardGate = new Promise((resolve) => {
      releaseDashboard = resolve
    })
    await page.close()
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => localStorage.getItem('splice:home-snapshot-identity') === 'bob',
    )
    await page
      .getByText('ACCOUNT_ALICE', { exact: true })
      .first()
      .waitFor({ state: 'detached' })
    assert.equal(
      await page.locator('[inert][aria-label^="Saved Home"]').count(),
      0,
      'Old identity preview must disappear while new dashboard is held',
    )
    releaseDashboard()
    await page.getByText('ACCOUNT_BOB', { exact: true }).first().waitFor()
    assert.equal(
      await page.getByText('ACCOUNT_ALICE', { exact: true }).count(),
      0,
    )
    for (let n = 0; n < 60; n++) {
      saved = await inspectSnapshot(page)
      if (saved?.identity === 'bob') break
      await pause(100)
    }
    assert.equal(saved?.identity, 'bob')
    console.log(
      'PASS: verified account switch removes old preview and replaces persisted identity',
    )

    await page.evaluate(() => {
      localStorage.setItem(
        'splice:pending-logout',
        JSON.stringify({
          id: crypto.randomUUID(),
          mode: 'device',
          issuedAt: Date.now(),
        }),
      )
    })
    await page.close()
    offline = true
    await context.setOffline(true)
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    // A bootable shell may still load, but a durable pending sign-out wins over data.
    await page.waitForTimeout(1000)
    assert.equal(
      await page.getByText('ACCOUNT_BOB', { exact: true }).count(),
      0,
    )
    assert.equal(
      await page.locator('[inert][aria-label^="Saved Home"]').count(),
      0,
    )
    console.log('PASS: pending offline logout prevents cached private preview')
    await page.evaluate(() => localStorage.removeItem('splice:pending-logout'))
    await page.close()
    offline = false
    await context.setOffline(false)
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.getByText('ACCOUNT_BOB', { exact: true }).first().waitFor()

    await page.close()
    page = await context.newPage()
    await page.clock.install()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.getByText('ACCOUNT_BOB', { exact: true }).first().waitFor()
    await page
      .locator('[inert][aria-label^="Saved Home"]')
      .waitFor({ state: 'detached' })
    const headerBefore = await page.locator('header').boundingBox()
    const accountBefore = await page
      .getByText('ACCOUNT_BOB', { exact: true })
      .first()
      .boundingBox()
    const previousRequests = summaryRequests
    let releaseHourly
    dashboardGate = new Promise((resolve) => {
      releaseHourly = resolve
    })
    await page.clock.fastForward(60 * 60 * 1000 + 1000)
    for (let n = 0; n < 30 && summaryRequests === previousRequests; n++)
      await pause(100)
    assert.ok(
      summaryRequests > previousRequests,
      'An open visible Home refreshes after one hour',
    )
    await page.clock.runFor(250)
    await page
      .locator('header span[class*="edge"][aria-hidden="true"]')
      .waitFor()
    assert.deepEqual(
      await page.locator('header').boundingBox(),
      headerBefore,
      'Refreshing header must preserve bounds',
    )
    assert.deepEqual(
      await page
        .getByText('ACCOUNT_BOB', { exact: true })
        .first()
        .boundingBox(),
      accountBefore,
      'Refreshing data must preserve existing content bounds',
    )
    releaseHourly()
    await page
      .locator('header span[class*="edge"][aria-hidden="true"]')
      .waitFor({ state: 'detached' })
    assert.ok(
      apiPaths.every((path) => !/\/sync(?:\/|$)/.test(path)),
      'Periodic reads must not trigger provider sync',
    )
    console.log(
      'PASS: visible Home refreshes hourly with subtle header edge and stable content, without provider sync',
    )

    token = 'invalid'
    await page.close()
    page = await context.newPage()
    await page.goto(`${origin}/home`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Google/ }).waitFor()
    assert.equal(
      await page.getByText('ACCOUNT_BOB', { exact: true }).count(),
      0,
    )
    for (let n = 0; n < 20; n++) {
      saved = await inspectSnapshot(page)
      if (!saved) break
      await pause(100)
    }
    assert.equal(saved, null, 'Confirmed anonymous session must purge snapshot')
    console.log(
      'PASS: confirmed anonymous response purges persisted private Home',
    )

    const denied = await browser.newContext({ serviceWorkers: 'allow' })
    denied.on('page', (p) =>
      p.on('pageerror', (error) => errors.push(error.message)),
    )
    await denied.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        get: () => {
          throw new Error('Storage denied')
        },
      })
    })
    await denied.route('http://localhost:3000/**', async (route) => {
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
    const deniedPage = await denied.newPage()
    await deniedPage.goto(origin)
    await deniedPage
      .getByText('ACCOUNT_ALICE', { exact: true })
      .first()
      .waitFor()
    await denied.close()
    console.log('PASS: denied snapshot storage falls back to online launch')
    assert.deepEqual(
      errors,
      [],
      'Launch/preview/handoff must have no runtime or hydration errors',
    )
    await context.close()
    console.log('PASS: cached Home production lifecycle integration')
  }
} catch (error) {
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        console.error('Page diagnostics', {
          url: page.url(),
          errors,
          state: await page
            .evaluate(() => ({
              text: document.body.innerText,
              local: document.documentElement.dataset.spliceLaunch,
              online: navigator.onLine,
            }))
            .catch(() => null),
        })
      }
  throw error
} finally {
  await browser?.close()
  if (gateway) await new Promise((resolve) => gateway.close(resolve))
  server.kill('SIGTERM')
  await once(server, 'exit')
  await new Promise((resolve) => api.close(resolve))
}
