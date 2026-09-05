/**
 * Real-browser first-paint checks on synthetic production fixtures.
 * First launch an isolated named agent-browser session, then pass its browser
 * WebSocket endpoint. Run agent-browser commands with sandbox escalation.
 * node scripts/verify-browser-preferences.mjs <browser-ws> [origin] [api] [output-dir]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [
  endpoint,
  origin = 'http://localhost:4302',
  api = 'http://localhost:4310',
  output = 'docs/performance/preferences',
] = process.argv.slice(2)
if (!endpoint?.startsWith('ws://'))
  throw new Error('Pass the dedicated agent-browser browser WebSocket endpoint')
const directory = path.resolve(output)
await mkdir(directory, { recursive: true })
const websocket = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  websocket.onopen = resolve
  websocket.onerror = reject
})
let nextId = 0
const pending = new Map()
const listeners = new Map()
websocket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const task = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) task?.reject(new Error(message.error.message))
    else task?.resolve(message.result)
  } else {
    for (const callback of listeners.get(message.method) ?? [])
      callback(message.params, message.sessionId)
  }
}
function send(method, params = {}, sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    websocket.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      }),
    )
  })
}
async function evaluate(sessionId, expression) {
  const { result, exceptionDetails } = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  if (exceptionDetails) throw new Error(exceptionDetails.text)
  return result.value
}
async function waitFor(sessionId, expression, description, timeout = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(sessionId, expression)) return
    } catch {
      /* navigation replaces the execution context */
    }
    await new Promise((resolve) => setTimeout(resolve, 75))
  }
  throw new Error(`Timed out: ${description}`)
}
async function fixtureRequest(route, data, method = 'POST') {
  const response = await fetch(api + route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  if (!response.ok)
    throw new Error(`Synthetic API ${route}: ${response.status}`)
  return response.json()
}
const observer = `
window.__preferenceEvidence={errors:[],leakedCurrency:false};
window.addEventListener('error',event=>window.__preferenceEvidence.errors.push(event.message));
window.addEventListener('unhandledrejection',event=>window.__preferenceEvidence.errors.push(String(event.reason)));
function inspectMoney(){
 const text=document.body?.innerText??'';
 if(/[$€£¥]\\s*[-\\d]/.test(text))window.__preferenceEvidence.leakedCurrency=true;
}
new MutationObserver(inspectMoney).observe(document,{childList:true,subtree:true,characterData:true});
`
const viewports = [
  ['desktop', 1440, 1000, false],
  ['tablet', 820, 1180, true],
  ['phone', 390, 844, true],
]
const themes = [
  ['splice-dark', 'Splice dark', 'dark'],
  ['splice-light', 'Splice light', 'light'],
  ['dracula', 'Dracula', 'dark'],
  ['oled-black', 'OLED black', 'dark'],
]
const report = {
  origin,
  syntheticApi: api,
  checkedAt: new Date().toISOString(),
  firstPaint: [],
  auth: [],
  failures: [],
}
const sessions = []
const pausedScripts = new Map()
const heldSessions = new Set()
const runtimeErrors = new Map()
listeners.set('Fetch.requestPaused', [
  (event, sessionId) => {
    if (heldSessions.has(sessionId)) {
      const paused = pausedScripts.get(sessionId) ?? []
      paused.push(event.requestId)
      pausedScripts.set(sessionId, paused)
    } else
      void send(
        'Fetch.continueRequest',
        { requestId: event.requestId },
        sessionId,
      )
  },
])
listeners.set('Runtime.exceptionThrown', [
  (event, sessionId) => {
    const errors = runtimeErrors.get(sessionId) ?? []
    errors.push(
      event.exceptionDetails.exception?.description ??
        event.exceptionDetails.text,
    )
    runtimeErrors.set(sessionId, errors)
  },
])
listeners.set('Runtime.consoleAPICalled', [
  (event, sessionId) => {
    if (event.type !== 'error') return
    const errors = runtimeErrors.get(sessionId) ?? []
    errors.push(
      event.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
    )
    runtimeErrors.set(sessionId, errors)
  },
])
function check(condition, label) {
  if (!condition) throw new Error(label)
}
async function releaseScripts(sessionId) {
  heldSessions.delete(sessionId)
  const requests = pausedScripts.get(sessionId) ?? []
  pausedScripts.delete(sessionId)
  await Promise.all(
    requests.map((requestId) =>
      send('Fetch.continueRequest', { requestId }, sessionId),
    ),
  )
}
async function attach(targetId) {
  const { sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  sessions.push(sessionId)
  for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable'])
    await send(method, {}, sessionId)
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)
  await send('Network.setBypassServiceWorker', { bypass: true }, sessionId)
  await send(
    'Fetch.enable',
    {
      patterns: [
        { urlPattern: '*.js', requestStage: 'Request' },
        { urlPattern: '*.js?*', requestStage: 'Request' },
      ],
    },
    sessionId,
  )
  return sessionId
}
async function screenshot(sessionId, name) {
  await evaluate(
    sessionId,
    'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',
  )
  const { data } = await send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false },
    sessionId,
  )
  await writeFile(
    path.join(directory, name + '.png'),
    Buffer.from(data, 'base64'),
  )
  return name + '.png'
}
const captureState = `(() => {
 const body=document.body, text=body?.innerText??'';
 return {
  scheme:document.documentElement.dataset.mantineColorScheme,
  routerInitialized:!!window.__TSR_ROUTER__,
  bodyVisibility:body?getComputedStyle(body).visibility:null,
  bodyDisplay:body?getComputedStyle(body).display:null,
  bodyBackground:body?getComputedStyle(body).backgroundColor:null,
  bodyHeight:body?.getBoundingClientRect().height,
  overflow:document.documentElement.scrollWidth>innerWidth+1,
  hasAccounts:text.includes('Fixture account'),
  hasMasks:text.includes('****'),
  hasCurrency:/[$€£¥]\\s*[-\\d]/.test(text),
  errors:window.__preferenceEvidence?.errors??[],
  leakedCurrency:window.__preferenceEvidence?.leakedCurrency??false,
  currency:document.querySelector('input[placeholder="Select currency"]')?.value,
  timezone:document.querySelector('input[placeholder="Select timezone"]')?.value,
  selectedTheme:document.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('aria-label'),
  dialog:!!document.querySelector('[role="dialog"]'),
  themeCookie:document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('splice_theme=')),
  maskCookie:document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('splice_mask_balances='))
 }
})()`

try {
  const { targetInfos } = await send('Target.getTargets')
  const target =
    targetInfos.find(
      (value) => value.type === 'page' && value.url.startsWith(origin),
    ) ??
    targetInfos.find(
      (value) => value.type === 'page' && value.url === 'about:blank',
    )
  if (!target)
    throw new Error(
      'Open the synthetic origin in the dedicated preference session first',
    )
  const session = await attach(target.targetId)
  await fixtureRequest('/__reset', {})
  async function runFirstPaint({
    name,
    theme,
    label,
    scheme,
    viewport,
    route = '/home',
    mask = '1',
    legacyHidden = true,
    settings = false,
  }) {
    const [viewportName, width, height, mobile] = viewport
    await fixtureRequest(
      '/user/settings',
      {
        theme,
        currency: settings ? 'JPY' : 'USD',
        timezone: settings ? 'Asia/Tokyo' : 'UTC',
      },
      'PATCH',
    )
    await fixtureRequest('/__requests', undefined, 'GET')
    await releaseScripts(session)
    await send('Page.navigate', { url: 'about:blank' }, session)
    await send('Network.clearBrowserCookies', {}, session)
    for (const [cookieName, value, httpOnly] of [
      ['splice_access_token', 'fixture', true],
      ['splice_theme', 'splice-light', false],
      ...(mask === null ? [] : [['splice_mask_balances', mask, false]]),
    ]) {
      await send(
        'Network.setCookie',
        { name: cookieName, value, url: origin, httpOnly, sameSite: 'Lax' },
        session,
      )
    }
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile },
      session,
    )
    const { identifier } = await send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `localStorage.clear();localStorage.setItem('splice:home-balances-hidden',${JSON.stringify(String(legacyHidden))});localStorage.setItem('splice_theme_preset','splice-light');${observer}`,
      },
      session,
    )
    runtimeErrors.set(session, [])
    heldSessions.add(session)
    await send('Network.clearBrowserCache', {}, session)
    await send('Page.navigate', { url: origin + route }, session)
    await waitFor(
      session,
      settings
        ? `document.querySelector('[role="radio"][aria-checked="true"]')&&document.querySelector('input[placeholder="Select timezone"]')`
        : `document.body?.innerText.includes('Fixture account')`,
      `${name} useful SSR content`,
    )
    await waitFor(
      session,
      `document.styleSheets.length>=6&&getComputedStyle(document.body).backgroundColor!=='rgba(0, 0, 0, 0)'`,
      `${name} styles`,
    )
    const before = await evaluate(session, captureState)
    const blockedScriptCount = (pausedScripts.get(session) ?? []).length
    check(
      blockedScriptCount > 0 && !before.routerInitialized,
      `${name}: scripts were not delayed before hydration`,
    )
    check(
      before.bodyVisibility === 'visible' &&
        before.bodyDisplay !== 'none' &&
        before.bodyHeight > 0,
      `${name}: body hidden before hydration`,
    )
    check(before.scheme === scheme, `${name}: wrong initial color scheme`)
    check(!before.overflow, `${name}: horizontal overflow`)
    if (settings) {
      check(
        before.selectedTheme === label &&
          before.currency?.startsWith('JPY') &&
          before.timezone?.includes('Tokyo'),
        `${name}: saved settings missing before hydration`,
      )
    } else {
      check(
        before.hasAccounts &&
          before.hasMasks &&
          !before.hasCurrency &&
          !before.leakedCurrency,
        `${name}: hidden balances exposed before hydration`,
      )
    }
    const image = await screenshot(session, `${name}-${viewportName}-before-js`)
    await releaseScripts(session)
    await waitFor(
      session,
      `window.__TSR_ROUTER__?.state?.status==='idle'&&document.readyState==='complete'`,
      `${name} hydration`,
    )
    await waitFor(
      session,
      `document.cookie.includes('splice_theme=${theme}')`,
      `${name} saved theme migration`,
    )
    if (!settings && mask === null)
      await waitFor(
        session,
        `document.cookie.includes('splice_mask_balances=${legacyHidden ? '1' : '0'}')`,
        `${name} masking migration`,
      )
    if (route.includes('accountId='))
      await waitFor(
        session,
        `!!document.querySelector('[role="dialog"]')`,
        `${name} account dialog`,
      )
    const after = await evaluate(session, captureState)
    check(
      before.bodyBackground === after.bodyBackground && after.scheme === scheme,
      `${name}: theme changed during hydration`,
    )
    if (!settings && (mask === '1' || legacyHidden))
      check(
        !after.hasCurrency && !after.leakedCurrency,
        `${name}: hidden balances exposed during hydration`,
      )
    const errors = [...after.errors, ...(runtimeErrors.get(session) ?? [])]
    check(errors.length === 0, `${name}: runtime or hydration error`)
    const requests = await fixtureRequest('/__requests', undefined, 'GET')
    check(
      requests.filter((request) => request.path === '/user/me').length === 1,
      `${name}: session query not reused on hydration`,
    )
    report.firstPaint.push({
      name,
      theme,
      viewport: viewportName,
      route,
      maskCookie: mask,
      legacyHidden,
      blockedScriptCount,
      before,
      after,
      image,
      requests,
    })
    if (route.includes('accountId='))
      await screenshot(session, `${name}-${viewportName}-hydrated`)
    await send(
      'Page.removeScriptToEvaluateOnNewDocument',
      { identifier },
      session,
    )
    await writeFile(
      path.join(directory, 'browser-preferences.json'),
      JSON.stringify(report, null, 2) + '\n',
    )
    console.info(`Passed ${name} ${viewportName}`)
  }
  if (!process.env.PREFERENCES_AUTH_ONLY) {
    for (const [theme, label, scheme] of themes) {
      for (const viewport of viewports)
        await runFirstPaint({ name: theme, theme, label, scheme, viewport })
      await runFirstPaint({
        name: `${theme}-settings`,
        theme,
        label,
        scheme,
        viewport: viewports[0],
        route: '/settings',
        settings: true,
      })
    }
    for (const legacyHidden of [true, false])
      await runFirstPaint({
        name: `legacy-masking-${legacyHidden}`,
        theme: 'dracula',
        label: 'Dracula',
        scheme: 'dark',
        viewport: viewports[2],
        mask: null,
        legacyHidden,
      })
    await runFirstPaint({
      name: 'masked-account-modal',
      theme: 'oled-black',
      label: 'OLED black',
      scheme: 'dark',
      viewport: viewports[0],
      route: '/home?accountId=00000000-0000-4000-8000-000000000102',
    })

    check(
      new Set(
        report.firstPaint
          .filter(
            (result) =>
              result.route === '/home' && result.viewport === 'desktop',
          )
          .map((result) => result.before.bodyBackground),
      ).size === 4,
      'Theme first-paint backgrounds are not distinct',
    )
  }

  // Anonymous SSR must remain anonymous through hydration without a browser probe.
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    session,
  )
  await releaseScripts(session)
  await send('Network.clearBrowserCookies', {}, session)
  await fixtureRequest('/__requests', undefined, 'GET')
  await send('Page.navigate', { url: origin + '/' }, session)
  await waitFor(
    session,
    `window.__TSR_ROUTER__?.state?.status==='idle'&&document.readyState==='complete'`,
    'anonymous landing hydration',
  )
  const anonymousRequests = await fixtureRequest(
    '/__requests',
    undefined,
    'GET',
  )
  check(
    !anonymousRequests.some((request) => request.path === '/user/me'),
    'Anonymous hydration repeated the session probe',
  )
  check(
    !(await evaluate(
      session,
      `document.body.innerText.includes('Fixture account')`,
    )),
    'Anonymous page displays private data',
  )
  report.auth.push({
    name: 'anonymous-no-probe',
    passed: true,
    requests: anonymousRequests,
    image: await screenshot(session, 'anonymous-phone'),
  })

  // Exercise the actual logout button and its cross-tab cache/document boundary.
  await send(
    'Network.setCookie',
    {
      name: 'splice_access_token',
      value: 'fixture',
      url: origin,
      httpOnly: true,
    },
    session,
  )
  await send('Page.navigate', { url: origin + '/home' }, session)
  await waitFor(
    session,
    `window.__TSR_ROUTER__?.state?.status==='idle'&&document.readyState==='complete'&&document.body.innerText.includes('Fixture account')`,
    'first authenticated tab',
  )
  const second = await send('Target.createTarget', { url: 'about:blank' })
  const secondSession = await attach(second.targetId)
  await send('Page.navigate', { url: origin + '/home' }, secondSession)
  await waitFor(
    secondSession,
    `window.__TSR_ROUTER__?.state?.status==='idle'&&document.readyState==='complete'&&document.body.innerText.includes('Fixture account')`,
    'second authenticated tab',
  )
  await evaluate(
    session,
    `document.querySelector('button[aria-label="Log out"]').click()`,
  )
  await waitFor(
    session,
    `location.pathname==='/'&&document.readyState==='complete'&&!document.body.innerText.includes('Fixture account')`,
    'first tab logout teardown',
  )
  await waitFor(
    secondSession,
    `location.pathname==='/'&&document.readyState==='complete'&&!document.body.innerText.includes('Fixture account')`,
    'second tab logout teardown',
  )
  await Promise.all(
    [session, secondSession].map((id) =>
      waitFor(
        id,
        `window.__TSR_ROUTER__?.state?.status==='idle'&&document.readyState==='complete'&&document.body.innerText.includes('Continue with Google')&&!document.body.innerText.includes('Enter Splice')`,
        'settled anonymous logout',
      ),
    ),
  )
  const logoutStates = await Promise.all(
    [session, secondSession].map((id) =>
      evaluate(
        id,
        `({pathname:location.pathname, ready:document.readyState, router:window.__TSR_ROUTER__?.state?.status, hasPrivate:document.body.innerText.includes('Fixture account'), authenticated:document.body.innerText.includes('Enter Splice'), anonymous:document.body.innerText.includes('Continue with Google')})`,
      ),
    ),
  )
  const cookies = (
    await send('Network.getCookies', { urls: [origin] }, session)
  ).cookies.map(({ name }) => name)
  report.auth.push({
    name: 'cross-tab-logout-button',
    states: logoutStates,
    cookieNames: cookies,
    passed: true,
    image: await screenshot(secondSession, 'cross-tab-logout'),
  })
  await send('Target.closeTarget', { targetId: second.targetId })
  check(
    logoutStates.every(
      (state) => state.anonymous && !state.authenticated && !state.hasPrivate,
    ),
    'Logout did not settle to anonymous in both tabs',
  )
  console.info(
    `Browser preference checks passed: ${report.firstPaint.length} first-paint cases and ${report.auth.length} auth cases`,
  )
} catch (error) {
  report.failures.push(error instanceof Error ? error.message : String(error))
  throw error
} finally {
  await writeFile(
    path.join(directory, 'browser-preferences.json'),
    JSON.stringify(report, null, 2) + '\n',
  )
  for (const sessionId of sessions) {
    try {
      await releaseScripts(sessionId)
      await send('Target.detachFromTarget', { sessionId })
    } catch {
      /* closed target */
    }
  }
  await fixtureRequest('/__reset', {}).catch(() => {})
  websocket.close()
}
