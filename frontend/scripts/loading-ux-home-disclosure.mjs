// Additional visual coverage, separate from the three-sample timing benchmark.
// node scripts/loading-ux-surfaces.mjs <browser-ws> <origin> <task-tab-id> <scenario.json> <output-dir>
// Scenario: { name, path, width, height, mobile?, readyText?, delayPattern?, delayMs?, failPattern?, action?: { selector, touch?, key? }, resultText? }
// Loopback synthetic fixture only. Uses the existing task-owned agent-browser tab.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const [endpoint, suppliedOrigin, targetId, scenarioPath, outputDir] =
  process.argv.slice(2)
if (
  ![endpoint, suppliedOrigin, targetId, scenarioPath, outputDir].every(Boolean)
)
  throw new Error('Five arguments required')
const origin = new URL(suppliedOrigin).origin
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Loopback fixture only')
const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'))
if (!scenario.path.startsWith('/') || scenario.path.startsWith('//'))
  throw new Error('Relative fixture path required')
const socket = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
})
let nextId = 0
const waiting = new Map()
const events = new Map()
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const item = waiting.get(message.id)
    waiting.delete(message.id)
    message.error
      ? item.reject(new Error(JSON.stringify(message.error)))
      : item.resolve(message.result)
  } else events.get(message.method)?.(message.params, message.sessionId)
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    waiting.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
const { targetInfos } = await send('Target.getTargets')
const target = targetInfos.find(
  (item) => item.type === 'page' && item.targetId === targetId,
)
if (!target || new URL(target.url).origin !== origin)
  throw new Error('Wrong explicit task tab/origin')
const { sessionId } = await send('Target.attachToTarget', {
  targetId,
  flatten: true,
})
const cdp = (method, params) => send(method, params, sessionId)
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails)
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    )
  return result.value
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const out = {}
let failTokens = false
let delayPeriod = false
const until = async (expression) => {
  for (let i = 0; i < 200; i++) {
    try {
      if (await evaluate(expression)) return
    } catch {}
    await pause(100)
  }
  throw Error('Timeout ' + expression)
}
const click = async (selector) => {
  const p = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  )
  await cdp('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...p,
  })
  await cdp('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...p,
  })
}
events.set('Fetch.requestPaused', async (e) => {
  if (failTokens && e.request.url.includes('/user/tokens'))
    await cdp('Fetch.failRequest', {
      requestId: e.requestId,
      errorReason: 'Failed',
    })
  else {
    if (delayPeriod && e.request.url.includes('balance-query')) {
      ;(out.delayedRequests ??= []).push({ url: e.request.url, delayMs: 4000 })
      await pause(4000)
    }
    await cdp('Fetch.continueRequest', { requestId: e.requestId })
  }
})
try {
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 768,
    height: 600,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await cdp('Page.navigate', { url: origin + '/home' })
  await until(
    `Boolean(window.__TSR_ROUTER__&&document.querySelector('button[aria-label="Collapse Liabilities"]')&&!document.querySelector('[aria-busy="true"]'))`,
  )
  await pause(500)
  await evaluate(
    `document.querySelector('button[aria-label="Collapse Liabilities"]').scrollIntoView({block:'center'})`,
  )
  await click('button[aria-label="Collapse Liabilities"]')
  await pause(400)
  await evaluate('scrollTo(0,20)')
  out.homeBefore = await evaluate(
    `({scrollY,period:document.querySelector('input[aria-label="Comparison period"]')?.value,url:location.href,collapsed:Boolean(document.querySelector('button[aria-label="Expand Liabilities"]'))})`,
  )
  delayPeriod = true
  await click('input[aria-label="Comparison period"]')
  await until(`Boolean(document.querySelector('[role="option"]'))`)
  await evaluate(
    `[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent==='Week').dataset.weekTarget='true'`,
  )
  await pause(350)
  await click('[data-week-target]')
  await until(`location.search.includes('period=week')`)
  await pause(100)
  out.homeDuring = await evaluate(
    `({scrollY,period:document.querySelector('input[aria-label="Comparison period"]')?.value,url:location.href,collapsed:Boolean(document.querySelector('button[aria-label="Expand Liabilities"]'))})`,
  )
  await until(`!document.querySelector('[aria-busy="true"]')`)
  out.homeAfter = await evaluate(
    `({scrollY,period:document.querySelector('input[aria-label="Comparison period"]')?.value,url:location.href,collapsed:Boolean(document.querySelector('button[aria-label="Expand Liabilities"]'))})`,
  )
  await writeFile(
    join(outputDir, 'home-disclosure-scroll-final.png'),
    Buffer.from(
      (await cdp('Page.captureScreenshot', { format: 'png' })).data,
      'base64',
    ),
  )
  console.log(JSON.stringify(out))
} finally {
  await writeFile(
    join(outputDir, 'home-disclosure-scroll-final.json'),
    JSON.stringify(out, null, 2),
  )
  await cdp('Fetch.disable').catch(() => {})
  await send('Target.detachFromTarget', { sessionId }).catch(() => {})
  socket.close()
}
