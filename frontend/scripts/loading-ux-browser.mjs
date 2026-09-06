// Explicit task-owned tab only. Normal fixture cookies remain untouched.
// node scripts/loading-ux-browser.mjs <browser-ws> <origin> <target-id> <output.json>
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
const [endpoint, suppliedOrigin, targetId, output] = process.argv.slice(2)
if (!endpoint || !suppliedOrigin || !targetId || !output)
  throw new Error('Supply browser websocket, origin, target id, and output')
const origin = new URL(suppliedOrigin).origin
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Synthetic loopback origin required')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ws = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let id = 0
const pending = new Map()
const handlers = new Map()
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const task = pending.get(message.id)
    pending.delete(message.id)
    message.error
      ? task?.reject(new Error(JSON.stringify(message.error)))
      : task?.resolve(message.result)
  } else handlers.get(message.method)?.(message.params, message.sessionId)
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const next = ++id
    const timer = setTimeout(() => {
      pending.delete(next)
      reject(new Error('CDP command timed out: ' + method))
    }, 30000)
    pending.set(next, {
      resolve: (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    })
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
  (item) => item.targetId === targetId && item.type === 'page',
)
if (!target || new URL(target.url).origin !== origin)
  throw new Error('Explicit tab does not match supplied origin')
const { sessionId } = await send('Target.attachToTarget', {
  targetId,
  flatten: true,
})
const cdp = (method, params) => send(method, params, sessionId)
async function evaluate(expression) {
  const { result, exceptionDetails } = await cdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (exceptionDetails)
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    )
  return result.value
}
async function until(expression, timeout = 25000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expression)) return
    } catch {}
    await pause(40)
  }
  throw new Error('Timeout: ' + expression)
}
const observer = `(() => {
const visible = (e) => !!e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
const describe = (e) => e ? {tag:e.tagName, class:e.className?.baseVal ?? e.className, label:(e.getAttribute?.('aria-label') ?? e.textContent ?? '').slice(0,100)} : null;
const rect = (r) => ({x:r.x,y:r.y,width:r.width,height:r.height});
const anchors = () => {
 const selectors = {heading:'h1',period:'input[aria-label="Comparison period"]',netWorth:'h2',firstAccount:'[aria-label^="Open account details for"]',checking:'[aria-label="Open account details for Fixture checking"]',brokerage:'[aria-label="Open account details for Fixture brokerage"]',ether:'[aria-label="Open account details for Exact ETH wallet"]',card:'.mantine-Paper-root',assets:'button[aria-label="Collapse Assets"]',table:'table',chart:'.recharts-wrapper',navigation:'button[aria-label="Open navigation"]'};
 for(let row=1;row<=8;row++)selectors['row'+row]='tbody tr:nth-child('+row+')';
 return Object.fromEntries(Object.entries(selectors).flatMap(([name,s])=>{const e=document.querySelector(s);return visible(e)?[[name,rect(e.getBoundingClientRect())]]:[]}));
};
const state = window.__loadingUX = {timeOrigin:performance.timeOrigin,start:0,route:location.pathname,target:location.pathname,firstUseful:null,chartReady:null,shifts:[],anchorChanges:[],scroll:[],errors:[],lcp:null,firstAnchors:null,lastAnchors:null,inputs:[],busy:[]};
let previous=null, lastScroll='', lastBusy='', active=true;
window.__resetLoadingUX=(kind,target)=>{Object.assign(state,{kind,target,start:performance.now(),route:location.pathname,firstUseful:null,chartReady:null,shifts:[],anchorChanges:[],scroll:[],errors:[],firstAnchors:null,lastAnchors:null,inputs:[],busy:[]});previous=null;lastScroll='';lastBusy='';active=true;};
window.__stopLoadingUX=()=>{active=false;return state};
window.__usefulLoadingUX=()=>{
 const body=document.body;
 if(!body||!visible(body))return false;
 const text=body.innerText;
 const heading=document.querySelector('h1')?.textContent;
 if(state.target && location.pathname!==state.target)return false;
 if(state.kind==='period-week'&&(!location.search.includes('period=week')||text.includes('Updating period')||document.querySelector('[aria-busy="true"]')||!document.querySelector('.recharts-area-curve')))return false;
 if(location.pathname==='/home')return heading==='Home'&&visible(document.querySelector('h2'))&&text.includes('Fixture checking');
 if(location.pathname==='/transactions')return heading==='Transactions'&&text.includes('Fixture merchant')&&text.includes('Fixture checking')&&document.querySelectorAll('tbody tr').length>1;
 if(location.pathname==='/accounts')return heading==='Accounts'&&text.includes('Fixture checking')&&text.includes('Fixture brokerage');
 if(location.pathname==='/analysis')return heading==='Analysis'&&text.includes('Inflows')&&text.includes('Outflows')&&!!text.match(/\\$[0-9]/);
 if(location.pathname==='/settings')return heading==='Settings'&&text.includes('Display currency')&&text.includes('Hide 0 balance accounts');
 return false;
};
addEventListener('error',e=>state.errors.push({at:performance.now(),message:e.message}));
addEventListener('unhandledrejection',e=>state.errors.push({at:performance.now(),message:String(e.reason)}));
addEventListener('pointerdown',e=>{if(active)state.inputs.push({at:performance.now(),type:e.type,target:describe(e.target)});},true);
new PerformanceObserver(list=>{for(const e of list.getEntries())if(active&&e.startTime>=state.start)state.shifts.push({at:e.startTime,value:e.value,hadRecentInput:e.hadRecentInput,route:location.pathname,sources:(e.sources??[]).map(s=>({node:describe(s.node),previous:rect(s.previousRect),current:rect(s.currentRect)}))});}).observe({type:'layout-shift',buffered:true});
new PerformanceObserver(list=>{state.lcp=list.getEntries().at(-1)?.startTime??null}).observe({type:'largest-contentful-paint',buffered:true});
function scan(){
 if(active){
  const now=performance.now();
  if(state.firstUseful===null&&window.__usefulLoadingUX())state.firstUseful=now;
  if(state.chartReady===null&&window.__usefulLoadingUX()&&((location.pathname==='/home'&&document.querySelector('.recharts-area-curve'))||(location.pathname==='/analysis'&&document.querySelector('.recharts-surface path'))))state.chartReady=now;
  const current=anchors();
  if(!state.firstAnchors&&Object.keys(current).length)state.firstAnchors={at:now,route:location.pathname,anchors:current};
  if(previous){const changes=Object.entries(current).flatMap(([name,r])=>{const before=previous[name];return before&&Object.keys(r).some(k=>Math.abs(r[k]-before[k])>0.25)?[{name,before,after:r}]:[]});if(changes.length)state.anchorChanges.push({at:now,route:location.pathname,changes});}
  previous=current;state.lastAnchors={at:now,route:location.pathname,anchors:current};
  const table=document.querySelector('table');const scrollParents=[];for(let e=table?.parentElement;e;e=e.parentElement){if(e.scrollHeight>e.clientHeight||['auto','scroll'].includes(getComputedStyle(e).overflowY))scrollParents.push({node:describe(e),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollTop:e.scrollTop});}const scroll=JSON.stringify({x:scrollX,y:scrollY,scrollHeight:document.documentElement.scrollHeight,clientHeight:document.documentElement.clientHeight,parents:scrollParents});if(scroll!==lastScroll){state.scroll.push({at:now,...JSON.parse(scroll),route:location.pathname});lastScroll=scroll;}
  const busy=JSON.stringify([...document.querySelectorAll('[aria-busy="true"],[aria-label^="Loading"],[role="progressbar"]')].filter(visible).map(describe));if(busy!==lastBusy){state.busy.push({at:now,items:JSON.parse(busy)});lastBusy=busy;}
 }
 requestAnimationFrame(scan);
}requestAnimationFrame(scan);
})();`
const profile = {
  cpu: 2,
  latencyMs: 80,
  downloadBytesPerSecond: 1000000,
  uploadBytesPerSecond: 500000,
  viewport: { width: 1440, height: 1000, mobile: false },
  samplesPerScenario: 3,
  warmPreparationMs: 5000,
  staleWaitMs: 31000,
}
let requests = new Map()
let runtimeErrors = []
let consoleWarnings = []
handlers.set('Network.requestWillBeSent', (e, sid) => {
  if (sid !== sessionId) return
  requests.set(e.requestId, {
    url: e.request.url,
    method: e.request.method,
    type: e.type,
    start: e.timestamp * 1000,
    wallTime: e.wallTime * 1000,
    initiator: e.initiator.type,
    initiatorUrl: e.initiator.stack?.callFrames?.[0]?.url ?? null,
  })
})
handlers.set('Network.responseReceived', (e, sid) => {
  if (sid !== sessionId) return
  Object.assign(requests.get(e.requestId) ?? {}, {
    status: e.response.status,
    response: e.timestamp * 1000,
    cache: !!(e.response.fromDiskCache || e.response.fromServiceWorker),
    mime: e.response.mimeType,
  })
})
handlers.set('Network.loadingFinished', (e, sid) => {
  if (sid !== sessionId) return
  Object.assign(requests.get(e.requestId) ?? {}, {
    end: e.timestamp * 1000,
    transferBytes: e.encodedDataLength,
  })
})
handlers.set('Network.loadingFailed', (e, sid) => {
  if (sid !== sessionId) return
  Object.assign(requests.get(e.requestId) ?? {}, {
    end: e.timestamp * 1000,
    error: e.errorText,
    canceled: e.canceled,
  })
})
handlers.set('Runtime.exceptionThrown', (e, sid) => {
  if (sid === sessionId)
    runtimeErrors.push(
      e.exceptionDetails.exception?.description ?? e.exceptionDetails.text,
    )
})
handlers.set('Runtime.consoleAPICalled', (e, sid) => {
  if (sid !== sessionId || !['error', 'warning', 'warn'].includes(e.type))
    return
  const message = e.args
    .map((a) => String(a.value ?? a.description ?? a.type).slice(0, 1000))
    .join(' ')
  if (e.type === 'error') runtimeErrors.push(message)
  else consoleWarnings.push(message)
})
const resumed = process.env.SPLICE_LOADING_RESUME
  ? JSON.parse(await readFile(process.env.SPLICE_LOADING_RESUME, 'utf8'))
  : null
if (resumed && JSON.stringify(resumed.profile) !== JSON.stringify(profile))
  throw new Error('Cannot resume samples from a different benchmark profile')
const samples = resumed?.samples ?? []
if (
  resumed &&
  [1, 2, 3].some(
    (run) =>
      ![0, 2, 10].includes(
        samples.filter((sample) => sample.run === run).length,
      ),
  )
)
  throw new Error(
    'Resume is supported only after complete runs or cold/immediate pairs',
  )
const completed = (kind) =>
  samples.some(
    (sample) => sample.run === currentRun + 1 && sample.kind === kind,
  )
let currentRun = 0
let preparation = null
const artifact = () => ({
  schemaVersion: 1,
  origin,
  profile,
  buildLabel: process.env.SPLICE_LOADING_LABEL ?? 'unspecified',
  matrix: process.env.SPLICE_LOADING_MATRIX ?? 'core',
  resumedFrom: process.env.SPLICE_LOADING_RESUME ?? null,
  freshNavigation:
    'stop prior loading, clear browser cache, navigate directly to a new document',
  observerScriptId: scriptId ?? null,
  recordedAt: new Date().toISOString(),
  criteria: {
    coldUsefulRegression:
      'Investigate median increase exceeding both 10% and 50ms',
    layout:
      'All nonzero shifts require source classification; ordinary CLS excludes recent input but trace retains it',
    timings:
      'Rendered financial/account/transaction content, not heading or spinner; chart is a separate boundary',
    scope:
      'Browser requests only; SSR backend requests are folded into document response and not individually visible',
  },
  samples,
})
async function save() {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(artifact(), null, 2) + '\n')
}
function resetNetwork() {
  requests = new Map()
  runtimeErrors = []
  consoleWarnings = []
}
function networkSnapshot(epoch) {
  const all = [...requests.values()]
  const originTime = epoch ?? Math.min(...all.map((r) => r.wallTime))
  return all.map((r) => ({
    ...r,
    start: r.wallTime - originTime,
    response:
      r.response === undefined
        ? null
        : r.wallTime - originTime + r.response - r.start,
    end: r.end === undefined ? null : r.wallTime - originTime + r.end - r.start,
  }))
}
async function capture(kind, { homeChart = false, settle = 500 } = {}) {
  await until(
    'window.__loadingUX?.firstUseful !== null && window.__usefulLoadingUX()',
  )
  if (homeChart) await until('window.__loadingUX?.chartReady !== null')
  await pause(settle)
  const timing = await evaluate('window.__stopLoadingUX()')
  const current = await evaluate(
    '({route:location.pathname,search:location.search,text:document.body.innerText.slice(0,1800)})',
  )
  const network = networkSnapshot(timing.timeOrigin + timing.start)
  const sample = {
    kind,
    run: currentRun + 1,
    preparation,
    firstUsefulMs: timing.firstUseful - timing.start,
    chartReadyMs:
      timing.chartReady === null ? null : timing.chartReady - timing.start,
    observationMs: timing.lastAnchors.at - timing.start,
    ordinaryCls: timing.shifts
      .filter((s) => !s.hadRecentInput)
      .reduce((n, s) => n + s.value, 0),
    interactionShiftSum: timing.shifts.reduce((n, s) => n + s.value, 0),
    timing,
    current,
    requests: network,
    runtimeErrors,
    consoleWarnings,
  }
  samples.push(sample)
  await save()
  console.log(
    `${kind} ${currentRun + 1}/3 useful=${sample.firstUsefulMs.toFixed(1)}ms chart=${sample.chartReadyMs?.toFixed(1) ?? 'n/a'}ms shifts=${timing.shifts.length}`,
  )
}
async function navigateFresh(route = '/home') {
  await cdp('Page.stopLoading')
  await cdp('Network.clearBrowserCache')
  resetNetwork()
  preparation = null
  await cdp('Page.navigate', { url: origin + route })
  await until(
    'window.__usefulLoadingUX?.() && Object.keys(document.querySelector(\'a[href="/transactions"]\')??{}).some(k=>k.startsWith("__reactProps$"))',
  )
}
async function click(selector) {
  const point = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing click target');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  )
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
async function navigation(route, kind) {
  const closed = await evaluate(
    "document.querySelector('button[aria-label=\"Open navigation\"]')?.getAttribute('aria-expanded')==='false'",
  )
  if (closed) {
    await click('button[aria-label=\"Open navigation\"]')
    await until(
      'document.querySelector(\'a[href="/transactions"]\')?.getBoundingClientRect().x>=0',
    )
  }
  resetNetwork()
  await evaluate(
    `window.__resetLoadingUX(${JSON.stringify(kind)},${JSON.stringify(route)})`,
  )
  await click(`a[href="${route}"]`)
  await until(`location.pathname===${JSON.stringify(route)}`)
  // Do not count the old route's still-visible content between pointerdown and commit.
  await evaluate(
    `if(window.__loadingUX.firstUseful!==null&&window.__loadingUX.firstUseful<performance.now()&&!window.__usefulLoadingUX())window.__loadingUX.firstUseful=null`,
  )
  await capture(kind, { homeChart: route === '/home' })
}
let scriptId
try {
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Network.enable')
  await cdp('Emulation.setDeviceMetricsOverride', {
    ...profile.viewport,
    deviceScaleFactor: 1,
  })
  await cdp('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latencyMs,
    downloadThroughput: profile.downloadBytesPerSecond,
    uploadThroughput: profile.uploadBytesPerSecond,
    connectionType: 'wifi',
  })
  await cdp('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  ;({ identifier: scriptId } = await cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: observer },
  ))
  await save()
  for (currentRun = 0; currentRun < 3; currentRun++) {
    if (samples.filter((sample) => sample.run === currentRun + 1).length === 10)
      continue
    if (process.env.SPLICE_LOADING_MATRIX === 'cold-transactions') {
      await navigateFresh('/transactions')
      await capture('cold-transactions', { settle: 1500 })
      continue
    }
    if (process.env.SPLICE_LOADING_MATRIX === 'resource') {
      await navigateFresh()
      await until('window.__loadingUX?.chartReady!==null')
      await pause(profile.warmPreparationMs)
      await click('button[aria-label="Open navigation"]')
      await until(
        'document.querySelector(\'a[href="/analysis"]\')?.getBoundingClientRect().x>=0',
      )
      await evaluate(
        'window.__resetLoadingUX("document-preparation-analysis","/analysis")',
      )
      await click('a[href="/analysis"]')
      await until('location.pathname==="/analysis"')
      await capture('document-preparation-analysis', {
        homeChart: true,
        settle: 700,
      })
      continue
    }
    if (process.env.SPLICE_LOADING_MATRIX === 'warmed-transactions') {
      await navigateFresh()
      await until('window.__loadingUX?.chartReady!==null')
      await pause(profile.warmPreparationMs)
      preparation = {
        durationMs: profile.warmPreparationMs,
        requests: networkSnapshot(),
      }
      await navigation('/transactions', 'warmed-transactions')
      continue
    }
    if (!completed('cold-home')) {
      await navigateFresh()
      await capture('cold-home', { homeChart: true, settle: 1800 })
    }
    if (!completed('immediate-transactions')) {
      await navigateFresh()
      await navigation('/transactions', 'immediate-transactions')
    }
    await navigateFresh()
    await until('window.__loadingUX?.chartReady!==null')
    await pause(profile.warmPreparationMs)
    preparation = {
      durationMs: profile.warmPreparationMs,
      requests: networkSnapshot(),
    }
    await navigation('/transactions', 'warmed-transactions')
    await navigation('/accounts', 'warmed-accounts')
    await navigation('/analysis', 'warmed-analysis')
    await navigation('/settings', 'warmed-settings')
    await navigation('/home', 'cached-home')
    await navigation('/transactions', 'cached-transactions')
    resetNetwork()
    await pause(profile.staleWaitMs)
    preparation = {
      durationMs: profile.staleWaitMs,
      requests: networkSnapshot(),
    }
    await navigation('/home', 'stale-home')
    // Native combobox interaction. No synthetic query/cache state changes.
    await click('input[aria-label="Comparison period"]')
    await until('!!document.querySelector(\'[role="option"]\')')
    const week = await evaluate(
      `(()=>{const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent==='Week');if(!e)throw new Error('No Week option');e.dataset.loadingUxWeek='true';return true})()`,
    )
    if (!week) throw new Error('Missing Week')
    resetNetwork()
    await evaluate('window.__resetLoadingUX("period-week","/home")')
    await click('[data-loading-ux-week="true"]')
    await until('location.search.includes("period=week")')
    await until(
      '!document.body.innerText.includes("Updating period") && !document.querySelector(\'[aria-busy="true"]\')',
    )
    await capture('period-week', { homeChart: true, settle: 700 })
  }
} catch (error) {
  const failure = {
    message: String(error),
    requests: networkSnapshot(),
    runtimeErrors,
    consoleWarnings,
    browser: await evaluate(
      '({url:location.href,text:document.body?.innerText,timing:window.__loadingUX})',
    ).catch(() => null),
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(
    output,
    JSON.stringify({ ...artifact(), failure }, null, 2) + '\n',
  )
  throw error
} finally {
  await cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
  await cdp('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  await cdp('Network.setCacheDisabled', { cacheDisabled: false })
  if (scriptId)
    await cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: scriptId,
    })
  await send('Target.detachFromTarget', { sessionId })
  ws.close()
}
