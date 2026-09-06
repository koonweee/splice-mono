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
const observer = `(() => {
  const visible = e => e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
  const rect = r => ({x:r.x,y:r.y,width:r.width,height:r.height});
  const label = e => ({tag:e?.tagName,class:String(e?.className?.baseVal ?? e?.className ?? ''),label:(e?.getAttribute?.('aria-label') ?? e?.textContent ?? '').slice(0,100)});
  const state = window.__surfaceAudit={start:performance.now(),shifts:[],anchors:[],errors:[],inputs:[],scroll:[],resources:[]};
  window.__resetSurfaceAudit=()=>{state.start=performance.now();state.shifts=[];state.anchors=[];state.errors=[];state.inputs=[];state.scroll=[];previous=null};
  new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.startTime>=state.start)state.shifts.push({at:e.startTime,value:e.value,hadRecentInput:e.hadRecentInput,sources:(e.sources??[]).map(s=>({node:label(s.node),before:rect(s.previousRect),after:rect(s.currentRect)}))})}).observe({type:'layout-shift',buffered:true});
  addEventListener('error',e=>state.errors.push({message:e.message,at:performance.now()}));
  addEventListener('unhandledrejection',e=>state.errors.push({message:String(e.reason),at:performance.now()}));
  for(const type of ['pointerdown','keydown','touchstart'])addEventListener(type,e=>state.inputs.push({type,at:performance.now(),target:label(e.target)}),true);
  let previous=null,lastScroll='';
  function scan(){
    const anchors=[...document.querySelectorAll('h1,h2,[role="tablist"],.mantine-Paper-root,table,[role="dialog"],input,button')].filter(visible).slice(0,45).map(e=>({node:label(e),rect:rect(e.getBoundingClientRect())}));
    const serialized=JSON.stringify(anchors);if(serialized!==previous){state.anchors.push({at:performance.now(),items:anchors});previous=serialized;}
    const scroll=JSON.stringify({x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight});if(scroll!==lastScroll){state.scroll.push({at:performance.now(),...JSON.parse(scroll)});lastScroll=scroll;}
    requestAnimationFrame(scan);
  }requestAnimationFrame(scan);
})();`
const runtimeErrors = []
events.set('Runtime.exceptionThrown', (event, sid) => {
  if (sid === sessionId)
    runtimeErrors.push(
      event.exceptionDetails.exception?.description ??
        event.exceptionDetails.text,
    )
})
const interceptions = []
events.set('Fetch.requestPaused', async (event, sid) => {
  if (sid !== sessionId) return
  const url = event.request.url
  const fixture = (scenario.responseFixtures ?? []).find((item) =>
    url.includes(item.urlIncludes),
  )
  if (fixture && !event.responseStatusCode) {
    if (event.request.method !== 'GET')
      throw new Error('Synthetic responses are read-only')
    interceptions.push({
      url,
      controlledResponseFixture: true,
      delay: fixture.delayMs ?? 0,
    })
    if (fixture.delayMs) await pause(fixture.delayMs)
    await cdp('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: origin },
        { name: 'Access-Control-Allow-Credentials', value: 'true' },
      ],
      body: Buffer.from(JSON.stringify(fixture.data)).toString('base64'),
    })
    return
  }
  if (event.responseStatusCode && scenario.providerActivityFixture) {
    if (event.responseStatusCode >= 200 && event.responseStatusCode < 300) {
      const body = await cdp('Fetch.getResponseBody', {
        requestId: event.requestId,
      })
      const decoded = body.base64Encoded
        ? Buffer.from(body.body, 'base64').toString('utf8')
        : body.body
      const transformed = decoded
        .replaceAll('valuationMode:"holdings"', 'valuationMode:"balance"')
        .replaceAll('"valuationMode":"holdings"', '"valuationMode":"balance"')
      interceptions.push({
        url,
        fixtureOverride: true,
        changed: decoded !== transformed,
      })
      const responseHeaders = (event.responseHeaders ?? []).filter(
        (h) =>
          !['content-length', 'content-encoding'].includes(
            h.name.toLowerCase(),
          ),
      )
      await cdp('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: event.responseStatusCode,
        responseHeaders,
        body: Buffer.from(transformed).toString('base64'),
      })
      return
    }
    await cdp('Fetch.continueRequest', { requestId: event.requestId })
    return
  }
  const fail = scenario.failPattern && url.includes(scenario.failPattern)
  const delay =
    scenario.delayPattern && url.includes(scenario.delayPattern)
      ? (scenario.delayMs ?? 4000)
      : 0
  interceptions.push({ url, delay, fail: Boolean(fail) })
  if (delay) await pause(delay)
  await cdp(fail ? 'Fetch.failRequest' : 'Fetch.continueRequest', {
    requestId: event.requestId,
    ...(fail ? { errorReason: 'Failed' } : {}),
  }).catch(() => {})
})
try {
  await mkdir(outputDir, { recursive: true })
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Network.enable')
  await cdp('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: scenario.width ?? 1440,
    height: scenario.height ?? 1000,
    deviceScaleFactor: 1,
    mobile: Boolean(scenario.mobile),
  })
  await cdp('Emulation.setTouchEmulationEnabled', {
    enabled: Boolean(scenario.mobile),
    maxTouchPoints: 1,
  })
  await cdp('Emulation.setEmulatedMedia', {
    features: [
      {
        name: 'prefers-reduced-motion',
        value: scenario.reducedMotion ? 'reduce' : 'no-preference',
      },
    ],
  })
  const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: observer,
  })
  if (
    scenario.delayPattern ||
    scenario.failPattern ||
    scenario.providerActivityFixture ||
    scenario.responseFixtures?.length
  )
    await cdp('Fetch.enable', {
      patterns: [
        { urlPattern: '*', requestStage: 'Request' },
        ...(scenario.providerActivityFixture
          ? [
              { urlPattern: '*localhost:4101/home*', requestStage: 'Response' },
              {
                urlPattern: '*balance-query/balances*',
                requestStage: 'Response',
              },
            ]
          : []),
      ],
    })
  const previousTimeOrigin = await evaluate('performance.timeOrigin')
  await cdp('Page.navigate', { url: origin + scenario.path })
  const started = Date.now()
  let ready = false
  while (Date.now() - started < 20000) {
    try {
      ready = await evaluate(
        `Boolean(performance.timeOrigin!==${previousTimeOrigin}&&location.href===${JSON.stringify(origin + scenario.path)}&&document.querySelector('h1')&&document.readyState==='complete'&&${scenario.readyText ? `document.body.innerText.includes(${JSON.stringify(scenario.readyText)})` : 'true'}&&!document.querySelector('[aria-busy="true"]'))`,
      )
    } catch {}
    if (ready) break
    await pause(100)
  }
  if (scenario.providerActivityFixture) {
    await evaluate(
      `(() => { const client=window.__TSR_ROUTER__.options.context.queryClient; const transform=value=>Array.isArray(value)?value.map(transform):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='valuationMode'&&item==='holdings'?'balance':transform(item)])):value; for(const query of client.getQueryCache().getAll()){if(JSON.stringify(query.state.data??null).includes('valuationMode'))client.setQueryData(query.queryKey,transform(query.state.data));} })()`,
    )
    await pause(100)
  }
  if (scenario.queryFixtures?.length) {
    while (!(await evaluate('Boolean(window.__TSR_ROUTER__)'))) await pause(100)
    await pause(500)
    await evaluate(
      `(() => {const client=window.__TSR_ROUTER__.options.context.queryClient;for(const fixture of ${JSON.stringify(scenario.queryFixtures)}){for(const query of client.getQueryCache().getAll())if(query.queryKey[0]===fixture.keyIncludes)client.setQueryData(query.queryKey,fixture.data)}})()`,
    )
    await pause(100)
  }
  let actionReady = null
  if (scenario.action) {
    // Direct SSR readiness precedes React listener attachment; these visual action
    // cases are intentionally separate from navigation timing measurements.
    await pause(500)
    await evaluate('window.__resetSurfaceAudit()')
    const point = await evaluate(
      `(() => { const e=${scenario.action.text ? `[...document.querySelectorAll(${JSON.stringify(scenario.action.selector ?? 'button')})].find(e=>e.textContent.trim()===${JSON.stringify(scenario.action.text)})` : `document.querySelector(${JSON.stringify(scenario.action.selector)})`}; if(!e)throw new Error('Missing action target');window.__surfaceActionTarget=e;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    )
    if (scenario.action.key) {
      await evaluate('window.__surfaceActionTarget.focus()')
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: scenario.action.key,
        code: scenario.action.key,
        windowsVirtualKeyCode: scenario.action.key === 'Enter' ? 13 : 32,
        ...(scenario.action.key === 'Enter'
          ? { text: '\r', unmodifiedText: '\r' }
          : {}),
      })
      await cdp('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: scenario.action.key,
        code: scenario.action.key,
        windowsVirtualKeyCode: scenario.action.key === 'Enter' ? 13 : 32,
      })
    } else if (scenario.action.touch) {
      await cdp('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [point],
      })
      await cdp('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
    } else {
      await cdp('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        button: 'left',
        clickCount: 1,
        ...point,
      })
      await cdp('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        clickCount: 1,
        ...point,
      })
    }
    await pause(180)
    const during = await cdp('Page.captureScreenshot', { format: 'png' })
    await writeFile(
      join(outputDir, scenario.name + '-during.png'),
      Buffer.from(during.data, 'base64'),
    )
    const actionStarted = Date.now()
    while (Date.now() - actionStarted < 15000) {
      if (
        await evaluate(
          `Boolean(${scenario.resultText ? `document.body.innerText.includes(${JSON.stringify(scenario.resultText)})` : 'true'}&&!document.querySelector('[aria-busy="true"]'))`,
        )
      ) {
        actionReady = true
        break
      }
      await pause(100)
    }
  }
  await pause(500)
  const audit = await evaluate('window.__surfaceAudit')
  const dom = await evaluate(
    `({title:document.querySelector('h1')?.textContent,text:document.body.innerText,dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>e.textContent),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches})`,
  )
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' })
  await writeFile(
    join(outputDir, scenario.name + '.png'),
    Buffer.from(screenshot.data, 'base64'),
  )
  await writeFile(
    join(outputDir, scenario.name + '.json'),
    JSON.stringify(
      {
        scenario,
        ready,
        actionReady,
        interceptions,
        runtimeErrors,
        audit,
        dom,
      },
      null,
      2,
    ) + '\n',
  )
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  console.log(
    JSON.stringify({
      name: scenario.name,
      ready,
      actionReady,
      shifts: audit?.shifts?.length,
      runtimeErrors: runtimeErrors.length,
      screenshot: join(outputDir, scenario.name + '.png'),
    }),
  )
} catch (error) {
  await writeFile(
    join(outputDir, scenario.name + '-failed-attempt.json'),
    JSON.stringify({ scenario, interceptions, error: String(error) }, null, 2),
  )
  throw error
} finally {
  await cdp('Fetch.disable').catch(() => {})
  await send('Target.detachFromTarget', { sessionId }).catch(() => {})
  socket.close()
}
