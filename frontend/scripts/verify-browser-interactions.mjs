import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const [endpoint, output = 'docs/performance/interaction-completion.json'] =
  process.argv.slice(2)
const origin = 'http://localhost:4302'
const api = 'http://localhost:4310'
const ws = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let id = 0
const pending = new Map()
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (!message.id) return
  const task = pending.get(message.id)
  pending.delete(message.id)
  message.error
    ? task.reject(new Error(JSON.stringify(message.error)))
    : task.resolve(message.result)
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const next = ++id
    pending.set(next, { resolve, reject })
    ws.send(
      JSON.stringify({
        id: next,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      }),
    )
  })
const { targetInfos } = await send('Target.getTargets')
const target = targetInfos.find(
  (t) => t.type === 'page' && t.url.includes('localhost:430'),
)
const { sessionId } = await send('Target.attachToTarget', {
  targetId: target.targetId,
  flatten: true,
})
const cdp = (method, params) => send(method, params, sessionId)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function evaluate(expression) {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails))
  return result.value
}
async function until(expression) {
  for (let i = 0; i < 300; i++) {
    try {
      if (await evaluate(expression)) return
    } catch {}
    await pause(100)
  }
  throw new Error('Timeout: ' + expression)
}
const requests = async () =>
  (await fetch(api + '/__requests').then((r) => r.json())).filter(
    (r) => !r.path.startsWith('/__'),
  )
const control = (value) =>
  fetch(api + '/__control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
async function go(route, ready) {
  await cdp('Page.navigate', { url: origin + route })
  await until(`!!window.__TSR_ROUTER__ && (${ready})`)
  await pause(500)
}
async function activate(selector, touch = false) {
  const point = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  )
  if (touch) {
    await cdp('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...point, radiusX: 2, radiusY: 2, id: 1 }],
    })
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button: 'left',
      clickCount: 1,
    })
    await cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      clickCount: 1,
    })
  }
}
async function navigate(route) {
  await evaluate(`document.querySelector('a[href="${route}"]').click()`)
  await until(
    `location.pathname===${JSON.stringify(route)} && document.querySelector('h1')?.textContent===${JSON.stringify(route === '/home' ? 'Home' : 'Accounts')}`,
  )
}
const checks = []
try {
  await fetch(api + '/__reset')
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Network.enable')
  await cdp('Network.setCookie', {
    name: 'splice_access_token',
    value: 'fixture',
    url: origin,
    httpOnly: true,
    sameSite: 'Lax',
  })
  await cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
  await cdp('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await cdp('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  })
  await go(
    '/transactions',
    `!!document.querySelector('[aria-label="Transactions list, 65 total"]')`,
  )
  await evaluate(
    `window.__qaTouches=0;document.addEventListener('touchstart',()=>window.__qaTouches++);`,
  )
  await activate('[data-interactive="true"]', true)
  await until(
    `!!document.querySelector('[role="dialog"]') && document.querySelector('[role="dialog"]').textContent.includes('Fixture purchase')`,
  )
  assert.equal(await evaluate('window.__qaTouches'), 1)
  checks.push({ name: 'actual-touch-opens-transaction-drawer', passed: true })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await cdp('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await until(`!document.querySelector('[role="dialog"]')`)
  await requests()
  await evaluate(
    `(()=>{const e=document.querySelector('[aria-label="Transactions list, 65 total"]');e.scrollTop=e.scrollHeight})()`,
  )
  await until(
    `document.querySelectorAll('[aria-label^="Open transaction details for"]').length===65`,
  )
  const paging = await requests()
  assert.equal(
    paging.filter(
      (r) => r.path === '/transaction' && r.search.includes('pageIndex=1'),
    ).length,
    1,
  )
  checks.push({
    name: 'mobile-pagination-50-to-65-on-container-scroll',
    passed: true,
    requests: paging,
  })

  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false })
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await requests()
  await go(
    '/settings?tab=categories',
    `!!document.querySelector('[role="tab"][aria-selected="true"]')`,
  )
  const settings = await requests()
  assert.equal(
    settings.filter(
      (r) =>
        r.path === '/category/manage' && r.search.includes('archived=false'),
    ).length,
    1,
  )
  // This section also reads archived categories for its existing comparison UI.
  assert.equal(
    settings.filter(
      (r) =>
        r.path === '/category/manage' && r.search.includes('archived=true'),
    ).length,
    1,
  )
  assert.ok(
    !settings.some((r) =>
      [
        '/user/tokens',
        '/analysis-rule',
        '/categorization-rule',
        '/recurring-manual-transaction',
      ].includes(r.path),
    ),
  )
  checks.push({
    name: 'selected-settings-list-only',
    passed: true,
    requests: settings,
  })

  await go(
    '/home',
    `document.body.innerText.includes('Fixture account') && !!document.querySelector('.recharts-area-curve')`,
  )
  await navigate('/accounts')
  await until(`document.body.innerText.includes('Fixture account')`)
  await navigate('/home')
  await pause(500)
  await requests()
  await navigate('/accounts')
  await navigate('/home')
  await pause(500)
  const fresh = await requests()
  assert.equal(
    fresh.filter((r) =>
      [
        '/account',
        '/balance-query/dashboard-summary',
        '/balance-query/dashboard-series',
      ].includes(r.path),
    ).length,
    0,
  )
  checks.push({
    name: 'fresh-navigation-no-primary-request',
    passed: true,
    requests: fresh,
  })
  // Allow the actual approved freshness window to expire; no artificial cache mutation.
  await pause(31000)
  await control({ failPath: '/balance-query/dashboard-summary' })
  await navigate('/accounts')
  await requests()
  await navigate('/home')
  await until(
    `document.body.innerText.includes('Previously loaded results are shown below.')`,
  )
  assert.ok(
    await evaluate(
      `document.body.innerText.includes('Fixture account') && !!document.querySelector('h2')`,
    ),
  )
  const stale = await requests()
  checks.push({
    name: 'stale-refresh-failure-retains-labeled-content',
    passed: true,
    requests: stale,
  })
  await control({ failPath: null })
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Retry dashboard').click()`,
  )
  await until(
    `!document.body.innerText.includes('Previously loaded results are shown below.') && document.body.innerText.includes('Fixture account')`,
  )
  checks.push({ name: 'stale-failure-retry-recovers', passed: true })
  console.log(JSON.stringify(checks, null, 2))
} finally {
  await writeFile(
    output,
    JSON.stringify(
      { checkedAt: new Date().toISOString(), origin, checks },
      null,
      2,
    ) + '\n',
  )
  await fetch(api + '/__reset')
  await send('Target.detachFromTarget', { sessionId })
  ws.close()
}
