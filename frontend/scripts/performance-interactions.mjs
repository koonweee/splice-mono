import { writeFile } from 'node:fs/promises'
const [endpoint, origin, output] = process.argv.slice(2)
const ws = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let id = 0
const pending = new Map()
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data)
  if (m.id) {
    const p = pending.get(m.id)
    pending.delete(m.id)
    m.error
      ? p?.reject(new Error(JSON.stringify(m.error)))
      : p?.resolve(m.result)
  }
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
  if (exceptionDetails) throw new Error(exceptionDetails.text)
  return result.value
}
async function until(expression) {
  const start = Date.now()
  while (Date.now() - start < 60000) {
    try {
      if (await evaluate(expression)) return
    } catch {}
    await pause(50)
  }
  throw new Error('Timeout: ' + expression)
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}

async function nav(route) {
  await evaluate(`document.querySelector('a[href="${route}"]').click()`)
  await until(
    `location.pathname==='${route}' && document.querySelector('h1')?.textContent===${JSON.stringify(route === '/home' ? 'Home' : 'Accounts')} && document.body.innerText.includes('Fixture account')`,
  )
}
async function resetRequests() {
  await fetch('http://localhost:4310/__requests')
}
async function requests() {
  return fetch('http://localhost:4310/__requests')
    .then((r) => r.json())
    .then((rows) => rows.filter((r) => !r.path.startsWith('/__')))
}
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
await cdp('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: 200000,
  uploadThroughput: 100000,
})
await cdp('Emulation.setCPUThrottlingRate', { rate: 4 })
const results = []
async function measure(kind, action, ready) {
  await resetRequests()
  const start = await evaluate('performance.now()')
  await action()
  await until(ready)
  const duration = await evaluate(`performance.now()-${start}`)
  await pause(450)
  results.push({
    viewport: currentViewport,
    run: currentRun,
    kind,
    duration,
    requests: await requests(),
  })
  await writeFile(
    output,
    JSON.stringify(
      { origin, profile: { cpu: 4, latency: 150, download: 1600000 }, results },
      null,
      2,
    ),
  )
  console.log(
    `${currentViewport} ${currentRun + 1}/7 ${kind}: ${Math.round(duration)}ms`,
  )
}
let currentViewport, currentRun
for (const [viewport, width, height, mobile] of [
  ['desktop', 1440, 1000, false],
  ['phone', 390, 844, true],
]) {
  currentViewport = viewport
  await fetch('http://localhost:4310/__reset')
  await cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  })
  await cdp('Page.navigate', { url: origin + '/home' })
  await until(
    `document.body.innerText.includes('Fixture account') && Object.keys(document.querySelector('[aria-label="Open navigation"]')||{}).some(k=>k.startsWith('__reactProps$'))`,
  )
  await nav('/accounts')
  await pause(600)
  await nav('/home')
  await pause(600)
  for (let run = 0; run < 7; run++) {
    currentRun = run
    // Matching cached query round trip. No idle polling or writes during the step.
    await measure(
      'warm-navigation',
      async () => {
        await nav('/accounts')
        await nav('/home')
      },
      `document.querySelector('h1')?.textContent==='Home' && !!document.querySelector('h2')`,
    )
    await measure(
      'period-change',
      async () => {
        await click('input')
        await until(`!!document.querySelector('[role="option"]')`)
        await evaluate(
          `Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent==='Week').click()`,
        )
      },
      `location.search.includes('period=week') && !!document.querySelector('h2')`,
    )
    await click('input')
    await until(`!!document.querySelector('[role="option"]')`)
    await evaluate(
      `Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent==='Month').click()`,
    )
    await until(
      `!!document.querySelector('h2') && !location.search.includes('period=week')`,
    )
    await measure(
      'account-modal',
      () => click('[aria-label^="Open account details for"]'),
      `!!document.querySelector('[role="dialog"]') && !document.querySelector('[aria-label="Loading account history"]')`,
    )
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
    await nav('/accounts')
    await click('[aria-label="Edit account name"]')
    await until(`!!document.querySelector('[aria-label="Account name"]')`)
    const name = `Fixture account 0 saved ${run + 1}`
    await evaluate(
      `(()=>{const input=document.querySelector('[aria-label="Account name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(name)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    )
    await measure(
      'name-save',
      () => click('[aria-label="Save account name"]'),
      `!document.querySelector('[aria-label="Account name"]') && document.body.innerText.includes(${JSON.stringify(name)})`,
    )
    await nav('/home')
    await pause(800)
  }
}
await cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
await cdp('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
await send('Target.detachFromTarget', { sessionId })
ws.close()
