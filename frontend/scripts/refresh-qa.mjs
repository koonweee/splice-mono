// node scripts/refresh-qa.mjs <agent-browser-cdp-websocket>
// Uses two already-authenticated /accounts tabs in an isolated agent-browser session.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { setTimeout as pause } from 'node:timers/promises'

const ws = new WebSocket(process.argv[2])
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let nextId = 0
const pending = new Map()
const handlers = new Map()
let asyncFailure
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const task = pending.get(message.id)
    pending.delete(message.id)
    message.error
      ? task?.reject(new Error(JSON.stringify(message.error)))
      : task?.resolve(message.result)
  } else {
    for (const handler of handlers.get(message.method) ?? [])
      Promise.resolve(handler(message.params, message.sessionId)).catch(
        (error) => {
          asyncFailure = error
        },
      )
  }
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
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
const evaluate = async (sessionId, expression) => {
  const result = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
const until = async (condition, label) => {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (asyncFailure) throw asyncFailure
    if (await condition()) return
    await pause(100)
  }
  throw new Error(`Timed out: ${label}`)
}
const sessions = []
let evidence
try {
  const targets = (await send('Target.getTargets')).targetInfos.filter(
    (target) =>
      target.type === 'page' &&
      target.url.startsWith('http://localhost:4302/accounts'),
  )
  assert.equal(
    targets.length,
    2,
    'Run this harness only in its dedicated two-tab browser',
  )
  for (const target of targets) {
    const { sessionId } = await send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    })
    sessions.push(sessionId)
    await send('Runtime.enable', {}, sessionId)
    await until(
      () =>
        evaluate(
          sessionId,
          `Boolean(window.__TSR_ROUTER__?.options.context.queryClient.getQueryData(['/user/me']))`,
        ),
      'hydrated canonical user',
    )
  }
  const startState = await Promise.all(
    sessions.map((sessionId) =>
      evaluate(
        sessionId,
        `({identity:window.__TSR_ROUTER__.options.context.queryClient.getQueryData(['/user/me']).id,locks:!!navigator.locks,privateContent:document.body.innerText.includes('Fixture account')})`,
      ),
    ),
  )
  assert.ok(startState.every((state) => state.locks && state.privateContent))
  assert.equal(startState[0].identity, startState[1].identity)
  const firstRejected = new Set()
  let refreshCount = 0
  let successfulMeResponses = 0
  let heldRefresh
  const pageErrors = []
  handlers.set('Runtime.exceptionThrown', [
    (params) => pageErrors.push(params.exceptionDetails.text),
  ])
  const fulfillRefresh = async () => {
    if (!heldRefresh || firstRejected.size !== 2) return
    const { requestId, sessionId } = heldRefresh
    heldRefresh = undefined
    await send(
      'Fetch.fulfillRequest',
      {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          {
            name: 'Access-Control-Allow-Origin',
            value: 'http://localhost:4302',
          },
          { name: 'Access-Control-Allow-Credentials', value: 'true' },
          { name: 'Cache-Control', value: 'private, no-store' },
          {
            name: 'Set-Cookie',
            value:
              'splice_access_token=fixture_large; Path=/; HttpOnly; SameSite=Lax',
          },
          {
            name: 'Set-Cookie',
            value:
              'splice_refresh_token=fixture_rotated; Path=/; HttpOnly; SameSite=Lax',
          },
        ],
        body: Buffer.from(
          JSON.stringify({
            accessToken: 'synthetic-access',
            refreshToken: 'synthetic-refresh',
          }),
        ).toString('base64'),
      },
      sessionId,
    )
  }
  handlers.set('Fetch.requestPaused', [
    async (params, sessionId) => {
      const path = new URL(params.request.url).pathname
      if (path === '/user/me' && !firstRejected.has(sessionId)) {
        firstRejected.add(sessionId)
        await send(
          'Fetch.fulfillRequest',
          {
            requestId: params.requestId,
            responseCode: 401,
            responseHeaders: [
              { name: 'Content-Type', value: 'application/json' },
              {
                name: 'Access-Control-Allow-Origin',
                value: 'http://localhost:4302',
              },
              { name: 'Access-Control-Allow-Credentials', value: 'true' },
            ],
            body: Buffer.from('{}').toString('base64'),
          },
          sessionId,
        )
        await fulfillRefresh()
      } else if (path === '/user/refresh' && params.request.method === 'POST') {
        refreshCount += 1
        assert.equal(
          refreshCount,
          1,
          'Web Locks must coordinate one refresh across both tabs',
        )
        heldRefresh = { requestId: params.requestId, sessionId }
        await fulfillRefresh()
      } else {
        if (path === '/user/me') successfulMeResponses += 1
        await send(
          'Fetch.continueRequest',
          { requestId: params.requestId },
          sessionId,
        )
      }
    },
  ])
  for (const sessionId of sessions)
    await send(
      'Fetch.enable',
      {
        patterns: [
          {
            urlPattern: 'http://localhost:4310/user/me',
            requestStage: 'Request',
          },
          {
            urlPattern: 'http://localhost:4310/user/refresh',
            requestStage: 'Request',
          },
        ],
      },
      sessionId,
    )
  const startedAt = Date.now()
  await Promise.all(
    sessions.map((sessionId) =>
      evaluate(
        sessionId,
        `void window.__TSR_ROUTER__.options.context.queryClient.invalidateQueries({queryKey:['/user/me']})`,
      ),
    ),
  )
  await until(async () => {
    if (successfulMeResponses !== 2) return false
    const complete = await Promise.all(
      sessions.map((sessionId) =>
        evaluate(
          sessionId,
          `(()=>{const q=window.__TSR_ROUTER__.options.context.queryClient.getQueryState(['/user/me']);return q.status==='success'&&q.fetchStatus==='idle'&&q.dataUpdatedAt>=${startedAt}})()`,
        ),
      ),
    )
    return complete.every(Boolean)
  }, 'both actual session queries recovered')
  const endState = await Promise.all(
    sessions.map((sessionId) =>
      evaluate(
        sessionId,
        `({url:location.href,identity:window.__TSR_ROUTER__.options.context.queryClient.getQueryData(['/user/me']).id,privateContent:document.body.innerText.includes('Fixture account'),blocked:document.body.innerText.includes('Updating session'),queryError:window.__TSR_ROUTER__.options.context.queryClient.getQueryState(['/user/me']).error?.message??null})`,
      ),
    ),
  )
  assert.equal(refreshCount, 1)
  assert.ok(
    endState.every(
      (state) =>
        state.identity === startState[0].identity &&
        state.privateContent &&
        !state.blocked &&
        state.queryError === null &&
        state.url.startsWith('http://localhost:4302/accounts'),
    ),
  )
  assert.deepEqual(pageErrors, [])
  const { cookies } = await send(
    'Network.getCookies',
    { urls: ['http://localhost:4310', 'http://localhost:4302'] },
    sessions[0],
  )
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name === 'splice_refresh_token' &&
        cookie.value === 'fixture_rotated' &&
        cookie.httpOnly,
    ),
    'Rotated refresh cookie must be installed as HTTP-only',
  )
  assert.ok(
    cookies.some(
      (cookie) =>
        cookie.name === 'splice_access_token' &&
        cookie.value === 'fixture_large' &&
        cookie.httpOnly,
    ),
    'Refreshed access cookie must be installed as HTTP-only',
  )
  evidence = {
    result: 'pass',
    environment: 'Final production Nitro4302 / synthetic fixture API4310',
    mechanism:
      'CDP401 injection into both real canonical /user/me invalidations; one successful refresh interception; subsequent /user/me calls forwarded to actual fixture',
    webLocksAvailable: true,
    rotatedHttpOnlyCookiesVerified: true,
    initial401s: firstRejected.size,
    coordinatedRefreshes: refreshCount,
    successfulMeRetries: successfulMeResponses,
    tabs: endState.map(({ identity, ...state }) => state),
    sameIdentityPreserved: true,
    pageErrors,
  }
  await writeFile(
    new URL('../docs/performance/refresh-qa.json', import.meta.url),
    JSON.stringify(evidence, null, 2) + '\n',
  )
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  for (const sessionId of sessions) {
    await send('Fetch.disable', {}, sessionId).catch(() => {})
    await send('Target.detachFromTarget', { sessionId }).catch(() => {})
  }
  ws.close()
}
