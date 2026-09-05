// Connect to the dedicated agent-browser session's CDP endpoint. No real data.
// node scripts/performance-browser.mjs <browser-websocket> <origin> <output.json>
import { writeFile } from 'node:fs/promises'
const [endpoint, origin, output] = process.argv.slice(2)
const ws = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let nextId = 0
const pending = new Map()
const events = new Map()
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const task = pending.get(message.id)
    pending.delete(message.id)
    message.error
      ? task?.reject(new Error(JSON.stringify(message.error)))
      : task?.resolve(message.result)
  } else events.get(message.method)?.forEach((fn) => fn(message.params))
}
function send(method, params = {}, sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {}),
      }),
    )
  })
}
const { targetInfos } = await send('Target.getTargets')
const target = targetInfos.find(
  (t) => t.type === 'page' && t.url.includes('localhost:430'),
)
if (!target)
  throw new Error(
    'Open the fixture app in the named agent-browser session first',
  )
const { sessionId } = await send('Target.attachToTarget', {
  targetId: target.targetId,
  flatten: true,
})
const cdp = (method, params) => send(method, params, sessionId)
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
await cdp('Network.setCacheDisabled', { cacheDisabled: true })
await cdp('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: 200000,
  uploadThroughput: 100000,
  connectionType: 'cellular3g',
})
await cdp('Emulation.setCPUThrottlingRate', { rate: 4 })
const observer = `
window.__splicePerf = { firstUseful: null, chartReady: null, lcp: null, errors: [] };
window.addEventListener('error',e=>window.__splicePerf.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.__splicePerf.errors.push(String(e.reason)));
new PerformanceObserver(list=>{window.__splicePerf.lcp=list.getEntries().at(-1).startTime}).observe({type:'largest-contentful-paint',buffered:true});
function useful(){
 const body=document.body; if(!body||getComputedStyle(body).visibility==='hidden')return false;
 const text=body.innerText; const route=location.pathname;
 if(route==='/home')return !!document.querySelector('h2')&&text.includes('Fixture account');
 if(route==='/accounts')return text.includes('Fixture account');
 if(route==='/transactions')return text.includes('Fixture purchase');
 if(route==='/analysis')return text.includes('Inflows')&&text.includes('Outflows');
 return false;
}
function scan(){
 if(window.__splicePerf.firstUseful===null&&useful())requestAnimationFrame(()=>requestAnimationFrame(()=>{if(window.__splicePerf.firstUseful===null&&useful())window.__splicePerf.firstUseful=performance.now()}));
 if(location.pathname==='/home'&&window.__splicePerf.chartReady===null&&document.querySelector('.recharts-area-curve'))requestAnimationFrame(()=>requestAnimationFrame(()=>{if(window.__splicePerf.chartReady===null&&document.querySelector('.recharts-area-curve'))window.__splicePerf.chartReady=performance.now()}));
}
new MutationObserver(scan).observe(document,{subtree:true,childList:true,attributes:true});
document.addEventListener('DOMContentLoaded',scan);
`
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: observer })
const results = []
let responses = []
events.set('Network.responseReceived', [
  (event) =>
    responses.push({
      url: event.response.url,
      status: event.response.status,
      encoded: event.response.encodedDataLength,
      type: event.type,
    }),
])
async function evaluate(expression) {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.text)
  return result.value
}
for (const [viewport, width, height, mobile] of [
  ['desktop', 1440, 1000, false],
  ['phone', 390, 844, true],
]) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  })
  for (const route of (
    process.env.SPLICE_PERF_ROUTES ?? '/home,/transactions,/accounts,/analysis'
  ).split(',')) {
    for (let run = 0; run < 7; run++) {
      await cdp('Page.navigate', { url: 'about:blank' })
      await cdp('Network.clearBrowserCache')
      responses = []
      await cdp('Page.navigate', { url: origin + route })
      const start = Date.now()
      let timing
      while (Date.now() - start < 90000) {
        try {
          timing = await evaluate('window.__splicePerf')
          if (timing?.firstUseful && (route !== '/home' || timing.chartReady))
            break
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (!timing?.firstUseful)
        throw new Error(
          'No useful content: ' + route + ' ' + JSON.stringify(timing),
        )
      if (route === '/home' && !timing.chartReady)
        throw new Error('No rendered Home chart: ' + JSON.stringify(timing))
      const resources = await evaluate(
        'performance.getEntriesByType("resource").map(r=>({name:r.name,transfer:r.transferSize,encoded:r.encodedBodySize,duration:r.duration}))',
      )
      results.push({ viewport, route, run, ...timing, responses, resources })
      await writeFile(
        output,
        JSON.stringify(
          {
            origin,
            profile: { cpu: 4, latency: 150, download: 1600000 },
            results,
          },
          null,
          2,
        ),
      )
      console.log(
        `${viewport} ${route} ${run + 1}/7: ${Math.round(timing.firstUseful)}ms`,
      )
    }
  }
}
await cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
await cdp('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
await cdp('Network.setCacheDisabled', { cacheDisabled: false })
await send('Target.detachFromTarget', { sessionId })
ws.close()
