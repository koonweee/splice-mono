import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { createECDH, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Genuine Chromium workers and built app code; no registration/cache/router mocks.
// Faults are injected by loopback HTTP proxies and Chromium's quota/offline APIs.
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(frontend, '..')
const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const equals = argument.indexOf('=')
    assert(equals > 2, 'Use --name=value arguments')
    return [argument.slice(2, equals), argument.slice(equals + 1)]
  }),
)
const runtime = options.playwright ?? 'playwright'
let chromium
try {
  ;({ chromium } = await import(
    runtime.startsWith('/') ? pathToFileURL(runtime).href : runtime
  ))
} catch {
  throw new Error(
    'Playwright is required. Run yarn install --frozen-lockfile and yarn playwright install chromium. A local runtime may be provided with --playwright=/absolute/path/index.mjs.',
  )
}
assert(
  !options['backend-url'],
  'Full privacy coverage requires a harness-owned schema; set BACKEND_BENCHMARK_DATABASE_URL instead of --backend-url',
)
assert(
  process.env.BACKEND_BENCHMARK_DATABASE_URL,
  'Set BACKEND_BENCHMARK_DATABASE_URL to the dedicated loopback splice_backend_benchmark database. No checks are skipped.',
)

const artifacts = resolve(
  options.artifacts ?? join(tmpdir(), 'splice-pwa-lifecycle-results'),
)
await mkdir(artifacts, { recursive: true })
const temporary = await mkdtemp(join(artifacts, 'builds-'))
const children = []
const servers = []
const sockets = new Set()
const checks = []
const requests = []
const failures = []
const state = {
  release: 'a',
  apiDown: false,
  captive: false,
  hangNavigation: false,
  brokenWorker: false,
  holdRecoveryScript: false,
}
const apiPaths = new Set([
  'user',
  'notification',
  'health',
  'bank-link',
  'account',
  'category',
  'transaction',
  'investment',
  'recurring-manual-transaction',
  'balance-query',
  'balance-snapshot',
  'analysis-rules',
  'categorization-rules',
  'categorization-rule-recommendations',
  'transaction-analysis',
])
let browser
let backendUrl
let backendChild
let frontendServers = {}
let currentCheck = 'initialization'
let rendererCrashes = 0

async function listen(server) {
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  servers.push(server)
  return `http://localhost:${server.address().port}`
}
function childProcess(
  command,
  args,
  cwd,
  extraEnv = {},
  name = 'process',
  ipc = false,
) {
  const log = createWriteStream(join(artifacts, `${name}.log`), { flags: 'w' })
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  children.push(child)
  return child
}
async function run(command, args, cwd, env, name) {
  const child = childProcess(command, args, cwd, env, name)
  const code = await new Promise((done, reject) => {
    child.once('error', reject)
    child.once('exit', done)
  })
  assert.equal(
    code,
    0,
    `${name} failed; inspect ${join(artifacts, `${name}.log`)}`,
  )
}
async function availablePort() {
  const server = createServer()
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const port = server.address().port
  await new Promise((done) => server.close(done))
  return port
}
async function until(description, check, milliseconds = 30_000) {
  const deadline = Date.now() + milliseconds
  let last
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      last = error
    }
    await delay(100)
  }
  throw new Error(
    `Timed out: ${description}${last ? ` (${last.message})` : ''}`,
  )
}
function forward(req, res, origin, rewriteLogin = false) {
  const target = new URL(req.url, origin)
  target.hostname = '127.0.0.1'
  const upstream = httpRequest(
    target,
    {
      method: req.method,
      headers: { ...req.headers, host: new URL(origin).host },
    },
    (response) => {
      const headers = { ...response.headers }
      if (rewriteLogin && headers.location) {
        const destination = new URL(headers.location, origin)
        headers.location = `${destination.pathname}${destination.search}${destination.hash}`
      }
      res.writeHead(response.statusCode ?? 502, headers)
      response.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' })
    res.end('Unavailable')
  })
  res.on('close', () => upstream.destroy())
  req.pipe(upstream)
}
const apiGateway = createServer((req, res) => {
  if (state.apiDown) {
    res.writeHead(503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    res.end('{"message":"Synthetic transport outage"}')
    return
  }
  forward(req, res, backendUrl, req.url.startsWith('/user/dev/login'))
})
const frontendGateway = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  requests.push({
    path: url.pathname,
    search: url.search,
    release: state.release,
    navigation:
      req.headers['sec-fetch-mode'] === 'navigate' ||
      Boolean(req.headers['service-worker-navigation-preload']),
  })
  if (state.holdRecoveryScript && url.pathname.startsWith('/pwa-offline-'))
    return
  if (state.brokenWorker && url.pathname === '/sw.js') {
    res.writeHead(503, { 'Cache-Control': 'no-store' })
    res.end('Worker unavailable')
    return
  }
  if (state.captive && url.pathname === '/_pwa/recovery') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store',
    })
    res.end('<html>Sign in to the network</html>')
    return
  }
  if (
    state.hangNavigation &&
    (req.headers['sec-fetch-mode'] === 'navigate' ||
      req.headers['service-worker-navigation-preload'])
  )
    return
  if (apiPaths.has(url.pathname.split('/')[1]))
    forward(req, res, apiOrigin, url.pathname === '/user/dev/login')
  else forward(req, res, frontendServers[state.release])
})
const apiOrigin = await listen(apiGateway)
const origin = await listen(frontendGateway)

// A generated launcher uses the real application modules/auth middleware. It
// owns one unique benchmark schema and cannot target the ordinary dev database.
const backendBootstrap = String.raw`
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.SPLICE_PWA_REPOSITORY;
const backend = path.join(root, 'backend');
process.chdir(backend);
process.env.TS_NODE_PROJECT = path.join(backend, 'tsconfig.json');
require(path.join(backend, 'node_modules/ts-node/register/transpile-only'));
require(path.join(backend, 'node_modules/tsconfig-paths/register'));
const url = new URL(process.env.BACKEND_BENCHMARK_DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/splice_backend_benchmark') throw new Error('A dedicated loopback benchmark database is required');
const schema = 'pwa_lifecycle_' + crypto.randomUUID().replaceAll('-', '');
const vapid = crypto.createECDH('prime256v1'); vapid.generateKeys();
Object.assign(process.env, {
  NODE_ENV: 'development', DISABLE_SCHEDULES: 'true', MCP_ENABLED: 'false',
  POSTGRES_HOST: url.hostname, POSTGRES_PORT: url.port || '5432',
  POSTGRES_USER: decodeURIComponent(url.username), POSTGRES_PASSWORD: decodeURIComponent(url.password), POSTGRES_DB: 'splice_backend_benchmark',
  JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  LOCAL_AUTH_BYPASS: 'true', LOCAL_AUTH_BYPASS_EMAIL: schema + '@fixture.test',
  FRONTEND_DOMAIN: process.env.SPLICE_PWA_ORIGIN, API_DOMAIN: process.env.SPLICE_PWA_ORIGIN,
  GOOGLE_OAUTH_CLIENT_ID: 'synthetic', GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic', GOOGLE_OAUTH_CALLBACK_URL: process.env.SPLICE_PWA_ORIGIN + '/user/oauth/google/callback',
  GOOGLE_ALLOWED_EMAILS: '', SEQ_SERVER_URL: '', SEQ_API_KEY: '', VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'), VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString('base64url'), VAPID_SUBJECT: 'mailto:pwa@fixture.test', PLAID_CLIENT_ID: '', PLAID_SECRET: '',
});
let database, app, created = false, closing = false;
async function close() {
  if (closing) return; closing = true;
  try { await app?.close(); if (created) await database.query('DROP SCHEMA "' + schema + '" CASCADE'); }
  finally { if (database?.isInitialized) await database.destroy(); }
}
(async () => {
  const { DataSource } = require(path.join(backend, 'node_modules/typeorm'));
  const { dataSourceOptions } = require(path.join(backend, 'src/data-source.ts'));
  dataSourceOptions.schema = schema;
  dataSourceOptions.extra = { options: '-c search_path=' + schema + ',public -c timezone=UTC' };
  database = new DataSource({ ...dataSourceOptions, migrations: [path.join(backend, 'src/migrations/*.ts')] });
  await database.initialize(); await database.query('CREATE SCHEMA "' + schema + '"'); created = true;
  await database.runMigrations({ transaction: 'all' });
  const { NestFactory } = require(path.join(backend, 'node_modules/@nestjs/core'));
  const { AppModule } = require(path.join(backend, 'src/app.module.ts'));
  const cookieParser = require(path.join(backend, 'node_modules/cookie-parser'));
  app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
  app.use(cookieParser()); app.enableCors({ origin: process.env.SPLICE_PWA_ORIGIN, credentials: true });
  await app.listen(0, '127.0.0.1');
  // This IPC-only fixture interface never becomes an HTTP production endpoint.
  process.on('message', async message => {
    try {
      if (message.kind === 'legacy') {
        const { PushSubscriptionEntity } = require(path.join(backend, 'src/notification/push-subscription.entity.ts'));
        const row = await database.getRepository(PushSubscriptionEntity).save({ userId: message.userId, endpoint: message.subscription.endpoint, p256dh: message.subscription.keys.p256dh, auth: message.subscription.keys.auth, userAgent: 'synthetic-lifecycle', revokedAt: new Date(), sessionId: null, enrollmentId: crypto.randomUUID(), rebindRequired: true });
        process.send({ fixtureId: message.fixtureId, result: { enrollmentId: row.enrollmentId } });
      } else if (message.kind === 'second-user') {
        process.env.LOCAL_AUTH_BYPASS_EMAIL = schema + '-b@fixture.test';
        process.send({ fixtureId: message.fixtureId, result: { ready: true } });
      }
    } catch { process.send({ fixtureId: message.fixtureId, error: 'Synthetic fixture operation failed' }); }
  });
  process.send({ ready: true, port: app.getHttpServer().address().port });
  process.once('SIGTERM', () => void close().then(() => process.exit(0)));
  process.once('SIGINT', () => void close().then(() => process.exit(0)));
})().catch(async () => { process.stderr.write('Isolated backend startup failed.\n'); await close(); process.exit(1); });
`

async function prepareBuilds() {
  const ignored = new Set([
    'node_modules',
    '.output',
    '.workbench',
    '.nitro',
    '.tanstack',
    '.pwa-lifecycle',
    '.git',
  ])
  const a = join(temporary, 'a')
  const b = join(temporary, 'b')
  const c = join(temporary, 'c')
  await cp(frontend, a, {
    recursive: true,
    filter: (path) => {
      const top = relative(frontend, path).split('/')[0]
      return !ignored.has(top) && !top.startsWith('.env')
    },
  })
  await cp(a, b, { recursive: true })
  await cp(a, c, { recursive: true })
  const source = join(b, 'src/routes/__root.tsx')
  const original = await readFile(source, 'utf8')
  assert.equal(
    original.split("title: 'Splice'").length,
    2,
    'UI title seam changed; update the A/B source mutation explicitly',
  )
  await writeFile(
    source,
    original.replace("title: 'Splice'", "title: 'Splice PWA B'"),
  )
  await writeFile(
    join(c, 'src/routes/__root.tsx'),
    original.replace("title: 'Splice'", "title: 'Splice PWA C'"),
  )
  const modules = await realpath(
    options.dependencies ?? join(frontend, 'node_modules'),
  )
  for (const [release, directory] of [
    ['a', a],
    ['b', b],
    ['c', c],
  ]) {
    // Real root directory keeps Nitro/Vite generated internals in this build.
    // Package symlinks reuse installed dependencies without mutating their root.
    const dependencies = join(directory, 'node_modules')
    await mkdir(dependencies)
    for (const entry of await readdir(modules)) {
      if (['.nitro', '.vite', '.vite-temp', '.cache'].includes(entry)) continue
      await symlink(join(modules, entry), join(dependencies, entry))
    }
    await run(
      'yarn',
      ['build'],
      directory,
      {
        VITE_API_BASE_URL: origin,
        VITE_DISABLE_DEVTOOLS: 'true',
        NODE_ENV: 'production',
      },
      `build-${release}`,
    )
    await run(
      process.execPath,
      [
        join(frontend, 'scripts/check-pwa-artifacts.mjs'),
        `--output=${join(directory, '.output')}`,
      ],
      frontend,
      {},
      `artifacts-${release}`,
    )
  }
  return { a, b, c }
}
async function launchFrontend(directory, release) {
  const port = await availablePort()
  const child = childProcess(
    process.execPath,
    [join(directory, '.output/server/index.mjs')],
    directory,
    {
      PORT: String(port),
      NITRO_PORT: String(port),
      HOST: '127.0.0.1',
      NITRO_HOST: '127.0.0.1',
      NODE_ENV: 'production',
      SPLICE_INTERNAL_API_BASE_URL: apiOrigin,
    },
    `server-${release}`,
  )
  const url = `http://localhost:${port}`
  await until(
    `release ${release} server startup`,
    async () =>
      child.exitCode === null && (await fetch(`${url}/version.json`)).ok,
  )
  return url
}
async function bounded(promise, description, milliseconds = 3000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${description}`)),
          milliseconds,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
async function test(name, callback) {
  const start = Date.now()
  const previous = currentCheck
  currentCheck = name
  process.stdout.write(`START ${name}\n`)
  try {
    await bounded(callback(), name, 90_000)
    checks.push({ name, passed: true, milliseconds: Date.now() - start })
    process.stdout.write(`PASS ${name}\n`)
  } finally {
    currentCheck = previous
  }
}
async function fixture(kind, values = {}) {
  assert(
    backendChild,
    'Privacy fixtures require the harness-owned benchmark backend; omit --backend-url and set BACKEND_BENCHMARK_DATABASE_URL',
  )
  const fixtureId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      backendChild.off('message', receive)
      reject(new Error('Fixture IPC timed out'))
    }, 10_000)
    function receive(message) {
      if (message.fixtureId !== fixtureId) return
      clearTimeout(timer)
      backendChild.off('message', receive)
      if (message.error) reject(new Error(message.error))
      else resolve(message.result)
    }
    backendChild.on('message', receive)
    backendChild.send({ kind, fixtureId, ...values })
  })
}
async function workerControl(page, message = { type: 'PWA_CONTROL_GET' }) {
  return page.evaluate(
    async (data) =>
      new Promise((resolve, reject) => {
        const channel = new MessageChannel()
        const timer = setTimeout(
          () => reject(new Error('Worker control timed out')),
          5000,
        )
        channel.port1.onmessage = (event) => {
          clearTimeout(timer)
          channel.port1.close()
          event.data.ok
            ? resolve(event.data.value)
            : reject(new Error('Worker rejected control'))
        }
        navigator.serviceWorker.controller.postMessage(data, [channel.port2])
      }),
    message,
  )
}
async function makeBrowserContext(options) {
  const context = await browser.newContext(options)
  context.on('page', (page) => {
    page.on('pageerror', (error) => failures.push(error.message))
    page.on('crash', () => {
      const details = {
        check: currentCheck,
        url: page.url(),
        release: state.release,
        browser: browser.version(),
      }
      failures.push(`Browser renderer crashed during ${currentCheck}`)
      process.stderr.write(
        `BROWSER_RENDERER_CRASH ${JSON.stringify(details)}\n`,
      )
      void writeFile(
        join(artifacts, `renderer-crash-${++rendererCrashes}.json`),
        JSON.stringify(details, null, 2),
      ).catch(() => undefined)
    })
  })
  return context
}
async function closeWithEvidence(context, name) {
  for (const [index, page] of context.pages().entries()) {
    await writeFile(
      join(artifacts, `${name}-${index}.html`),
      await bounded(page.content(), 'capture HTML').catch(() => ''),
    ).catch(() => undefined)
    await page
      .screenshot({
        path: join(artifacts, `${name}-${index}.png`),
        fullPage: true,
        timeout: 3000,
      })
      .catch(() => undefined)
    await writeFile(
      join(artifacts, `${name}-${index}.json`),
      JSON.stringify(
        {
          url: page.url(),
          state: await bounded(
            page.evaluate(() => ({
              ready: document.readyState,
              online: navigator.onLine,
              controlled: Boolean(navigator.serviceWorker.controller),
              recoveryStarted: window.__spliceOfflineRecoveryStarted,
            })),
            'capture page state',
          ).catch(() => null),
        },
        null,
        2,
      ),
    ).catch(() => undefined)
  }
  await bounded(context.close(), 'close evidence context', 10_000).catch(
    () => undefined,
  )
}
async function hydrated(page) {
  // SSR headings and an already-installed controller can both predate this
  // document's React handlers. The lifecycle layout effect publishes its space
  // only after mounting, so observe that real DOM effect before interacting.
  await page.waitForFunction(
    () =>
      document.documentElement.style.getPropertyValue(
        '--splice-lifecycle-space',
      ) !== '',
  )
}
async function controlled(page) {
  await hydrated(page)
  // Playwright's waitForFunction polls the returned object, so an async
  // predicate can stop at a truthy Promise whose value is actually false.
  await until('real activated worker controls the page', () =>
    page.evaluate(
      async () =>
        Boolean(navigator.serviceWorker.controller) &&
        (await navigator.serviceWorker.getRegistration())?.active?.state ===
          'activated',
    ),
  )
}
async function login(page) {
  await page.goto(`${origin}/user/dev/login?redirect=/settings`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
  await page
    .getByRole('switch', { name: 'Hide 0 balance accounts' })
    .waitFor({ state: 'attached' })
  await hydrated(page)
}
async function wake(page, minutes) {
  // Date must keep advancing so fallback probe/reload throttles can expire.
  await page.clock.setSystemTime(new Date(Date.now() + minutes * 60_000))
  const wakeTime = await page.evaluate(() => Date.now())
  await page.waitForFunction((start) => Date.now() > start, wakeTime)
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}
async function cacheInventory(page) {
  return page.evaluate(async () => {
    const result = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      result.push({
        name,
        urls: (await cache.keys()).map((request) => request.url),
      })
    }
    return result
  })
}

try {
  if (!backendUrl) {
    const launcher = join(temporary, 'backend.cjs')
    await writeFile(launcher, backendBootstrap)
    const child = childProcess(
      process.execPath,
      [launcher],
      repository,
      { SPLICE_PWA_REPOSITORY: repository, SPLICE_PWA_ORIGIN: origin },
      'backend',
      true,
    )
    backendChild = child
    backendUrl = await new Promise((done, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              'Isolated backend did not start; inspect backend.log and benchmark database prerequisite',
            ),
          ),
        60_000,
      )
      child.once('message', (message) => {
        clearTimeout(timeout)
        assert(message.ready)
        done(`http://localhost:${message.port}`)
      })
      child.once('exit', () => {
        clearTimeout(timeout)
        reject(
          new Error(
            'Isolated backend exited before readiness; inspect backend.log',
          ),
        )
      })
    })
  }
  await until(
    'isolated backend health',
    async () =>
      (
        await fetch(`${backendUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        })
      ).ok,
  )
  const builds = await prepareBuilds()
  const aVersion = JSON.parse(
    await readFile(join(builds.a, '.output/public/version.json'), 'utf8'),
  )
  const bVersion = JSON.parse(
    await readFile(join(builds.b, '.output/public/version.json'), 'utf8'),
  )
  const cVersion = JSON.parse(
    await readFile(join(builds.c, '.output/public/version.json'), 'utf8'),
  )
  assert.notEqual(aVersion.buildId, bVersion.buildId)
  assert.notEqual(
    await readFile(join(builds.a, '.output/public/sw.js'), 'utf8'),
    await readFile(join(builds.b, '.output/public/sw.js'), 'utf8'),
    'A UI-only build must change worker bytes',
  )
  frontendServers = {
    a: await launchFrontend(builds.a, 'a'),
    b: await launchFrontend(builds.b, 'b'),
    c: await launchFrontend(builds.c, 'c'),
  }
  try {
    browser = await chromium.launch({
      headless: true,
      ...(options.channel ? { channel: options.channel } : {}),
    })
  } catch {
    throw new Error(
      'Chromium is unavailable. Run yarn playwright install --with-deps chromium, or use --channel=chrome for an installed local Chrome.',
    )
  }
  const context = await makeBrowserContext({
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  })
  const clean = await context.newPage()
  let dirty
  let initialHideZero
  await test('real local-dev authentication, production worker activation and private-cache migration', async () => {
    await clean.goto(`${origin}/robots.txt`)
    await clean.evaluate(async () => {
      const cache = await caches.open('splice-app-shell-v1')
      await cache.put('/home', new Response('synthetic-private-marker'))
    })
    await login(clean)
    await controlled(clean)
    assert.equal(await clean.title(), 'Splice')
    const inventory = await cacheInventory(clean)
    assert(!inventory.some((cache) => cache.name === 'splice-app-shell-v1'))
    assert(inventory.some((cache) => cache.name.includes(aVersion.buildId)))
    for (const cache of inventory)
      for (const url of cache.urls) {
        assert(
          !/\/(user|notification|home|settings|transactions)(\/|\?|$)/.test(
            new URL(url).pathname,
          ),
          `Private URL persisted: ${url}`,
        )
        assert(!url.includes('/splash/'), 'Blanket splash caching returned')
      }
  })
  await test('cached core JS works offline without a network body request', async () => {
    const report = JSON.parse(
      await readFile(join(builds.a, '.output/pwa-assets.json'), 'utf8'),
    )
    const entry = report.entries.find((item) => /^assets\/main-/.test(item.url))
    assert(
      (await cacheInventory(clean)).some((cache) =>
        cache.urls.includes(`${origin}/${entry.url}`),
      ),
      'Activated worker did not precache core JS',
    )
    const before = requests.filter(
      (request) => request.path === `/${entry.url}`,
    ).length
    await context.setOffline(true)
    const length = await clean.evaluate(
      async (url) => (await (await fetch(url)).arrayBuffer()).byteLength,
      `/${entry.url}`,
    )
    assert.equal(length, entry.size)
    assert.equal(
      requests.filter((request) => request.path === `/${entry.url}`).length,
      before,
    )
    await context.setOffline(false)
  })
  await test('UI-only B release prompts A and protects another tab’s real Settings draft', async () => {
    dirty = await context.newPage()
    await dirty.goto(`${origin}/settings`)
    const toggle = dirty.getByRole('switch', {
      name: 'Hide 0 balance accounts',
    })
    const original = await toggle.isChecked()
    initialHideZero = original
    await dirty.getByText('Hide 0 balance accounts', { exact: true }).click()
    await dirty
      .getByRole('button', { name: 'Save changes', exact: true })
      .waitFor()
    const documentMarker = await dirty.evaluate(() => {
      window.__pwaDocumentMarker = crypto.randomUUID()
      return window.__pwaDocumentMarker
    })
    state.release = 'b'
    await wake(clean, 2)
    await clean.getByRole('button', { name: 'Update', exact: true }).waitFor()
    await until('clean tab observes waiting worker', () =>
      clean.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    await dirty
      .getByText('Finish your edits and saves before updating.')
      .waitFor()
    assert(
      await dirty
        .getByRole('button', { name: 'Update', exact: true })
        .isDisabled(),
    )
    await clean.getByRole('button', { name: 'Update', exact: true }).click()
    await clean.waitForFunction(() => document.title === 'Splice PWA B')
    assert.equal(await dirty.title(), 'Splice')
    assert.equal(
      await dirty.evaluate(() => window.__pwaDocumentMarker),
      documentMarker,
    )
    assert.equal(await toggle.isChecked(), !original)
    const inventory = await cacheInventory(clean)
    assert(
      inventory.some((cache) => cache.name.includes(aVersion.buildId)),
      'Editing tab lost its previous release cache',
    )
    assert(inventory.some((cache) => cache.name.includes(bVersion.buildId)))
    await dirty.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dirty.getByRole('button', { name: 'Update', exact: true }).click()
    await dirty.waitForFunction(() => document.title === 'Splice PWA B')
  })
  await test('cold offline launch preserves destination, rejects outage/captive probes and recovers once', async () => {
    await clean.close()
    await dirty.close()
    await context.setOffline(true)
    const offline = await context.newPage()
    await offline.addInitScript(() => {
      window.__spliceOfflineEvents = []
      for (const event of [
        'online',
        'offline',
        'DOMContentLoaded',
        'visibilitychange',
      ]) {
        addEventListener(event, () =>
          window.__spliceOfflineEvents.push({
            event,
            online: navigator.onLine,
            visibility: document.visibilityState,
            status: document.getElementById('splice-recovery-status')
              ?.textContent,
            started: window.__spliceOfflineRecoveryStarted === true,
          }),
        )
      }
    })
    const destination = `${origin}/settings?tab=general#offline-preserved`
    const response = await offline.goto(destination, {
      waitUntil: 'domcontentloaded',
    })
    assert.equal(response.status(), 503)
    assert(response.fromServiceWorker())
    await offline.getByRole('button', { name: 'Retry', exact: true }).waitFor()
    assert.equal(offline.url(), destination)
    state.apiDown = true
    // Chromium can reset navigator.onLine when a new offline document commits.
    // Reapply the transport state after commit, then exercise its native event.
    await context.setOffline(false)
    await context.setOffline(true)
    assert.equal(await offline.evaluate(() => navigator.onLine), false)
    await context.setOffline(false)
    await offline
      .getByText('Splice is still unavailable. Try again shortly.')
      .waitFor()
    const navigationCount = () =>
      requests.filter(
        (request) =>
          request.path === '/settings' &&
          request.search === '?tab=general' &&
          request.navigation,
      ).length
    const before = navigationCount()
    state.captive = true
    await offline.getByRole('button', { name: 'Retry', exact: true }).click()
    await offline
      .getByText('Splice is still unavailable. Try again shortly.')
      .waitFor()
    assert.equal(navigationCount(), before)
    state.apiDown = false
    state.captive = false
    await offline.getByRole('button', { name: 'Retry', exact: true }).click()
    await offline
      .getByRole('heading', { name: 'Settings', exact: true })
      .waitFor()
    assert.equal(offline.url(), destination)
    assert.equal(
      navigationCount() - before,
      1,
      'Navigation preload duplicated the recovery navigation',
    )
    assert.equal(await offline.title(), 'Splice PWA B')
    dirty = offline
  })
  await test('stalled navigation headers settle after eight seconds without a duplicate navigation', async () => {
    state.hangNavigation = true
    const response = await dirty.goto(`${origin}/accounts?timeout-check=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    assert.equal(response.status(), 503)
    assert.equal(response.headers()['x-splice-offline'], 'timeout')
    assert.equal(
      requests.filter(
        (request) =>
          request.path === '/accounts' &&
          request.search === '?timeout-check=1' &&
          request.navigation,
      ).length,
      1,
    )
    state.hangNavigation = false
    await dirty.goto(`${origin}/settings`)
    await dirty
      .getByRole('heading', { name: 'Settings', exact: true })
      .waitFor()
  })
  await test('rollback to A is another prompted real worker update', async () => {
    state.release = 'a'
    await wake(dirty, 4)
    await dirty.getByRole('button', { name: 'Update', exact: true }).waitFor()
    await until('editing tab observes waiting worker', () =>
      dirty.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    await dirty.getByRole('button', { name: 'Update', exact: true }).click()
    await dirty.waitForFunction(() => document.title === 'Splice')
    assert.equal(
      await dirty
        .getByRole('switch', { name: 'Hide 0 balance accounts' })
        .isChecked(),
      initialHideZero,
    )
  })
  await test('offline logout hides both tabs immediately and revokes the real session on reconnect', async () => {
    const observer = await context.newPage()
    await observer.goto(`${origin}/settings`)
    await observer
      .getByRole('heading', { name: 'Settings', exact: true })
      .waitFor()
    const oldRefresh = (await context.cookies()).find(
      (cookie) => cookie.name === 'splice_refresh_token',
    )?.value
    assert(oldRefresh, 'Expected a real refresh cookie before logout')
    await context.setOffline(true)
    await dirty.getByRole('button', { name: 'Log out', exact: true }).click()
    await dirty.getByText('Sign out pending', { exact: true }).waitFor()
    await observer.getByText('Sign out pending', { exact: true }).waitFor()
    assert.equal(
      await dirty
        .getByRole('heading', { name: 'Settings', exact: true })
        .count(),
      0,
    )
    assert.equal(
      await observer
        .getByRole('heading', { name: 'Settings', exact: true })
        .count(),
      0,
    )
    // Playwright's API client reaches the real server independently of browser
    // offline mode: local hiding precedes the still-pending server revocation.
    assert.equal((await dirty.request.get(`${origin}/user/me`)).status(), 200)
    await context.setOffline(false)
    await until(
      'server logout after reconnect',
      async () =>
        (await dirty.request.get(`${origin}/user/me`)).status() === 401,
    )
    await dirty
      .getByText('Sign out pending', { exact: true })
      .waitFor({ state: 'hidden' })
    await observer
      .getByText('Sign out pending', { exact: true })
      .waitFor({ state: 'hidden' })
    const refresh = await dirty.request.post(`${origin}/user/refresh`, {
      data: { refreshToken: oldRefresh },
    })
    assert.equal(
      refresh.status(),
      401,
      'Logout did not invalidate the refresh family',
    )
    await observer.close()
  })
  await test('failed worker registration is recoverable through the real Retry control', async () => {
    const failedContext = await makeBrowserContext({ serviceWorkers: 'allow' })
    try {
      state.brokenWorker = true
      const page = await failedContext.newPage()
      await login(page)
      await page
        .getByText('App features need attention', { exact: true })
        .waitFor()
      state.brokenWorker = false
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await controlled(page)
      await page
        .getByRole('heading', { name: 'Settings', exact: true })
        .waitFor()
    } finally {
      state.brokenWorker = false
      await closeWithEvidence(failedContext, 'registration')
    }
  })
  await test('A to B waiting to C waiting removes abandoned staging and activates C', async () => {
    const supersession = await makeBrowserContext({ serviceWorkers: 'allow' })
    try {
      state.release = 'a'
      const page = await supersession.newPage()
      await login(page)
      await controlled(page)
      const waitingId = () =>
        page.evaluate(async () => {
          const worker = (await navigator.serviceWorker.getRegistration())
            ?.waiting
          if (!worker) return null
          return new Promise((resolve) => {
            const channel = new MessageChannel()
            const timer = setTimeout(() => {
              channel.port1.close()
              resolve(null)
            }, 1000)
            channel.port1.onmessage = (event) => {
              clearTimeout(timer)
              channel.port1.close()
              resolve(event.data.buildId)
            }
            worker.postMessage({ type: 'PWA_BUILD_ID' }, [channel.port2])
          })
        })
      state.release = 'b'
      await wake(page, 2)
      await until(
        'B waiting',
        async () => (await waitingId()) === bVersion.buildId,
      )
      state.release = 'c'
      await wake(page, 4)
      await until(
        'C supersedes B waiting',
        async () => (await waitingId()) === cVersion.buildId,
      )
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await until(
        'abandoned B staging removed',
        async () =>
          !(await cacheInventory(page)).some((cache) =>
            cache.name.includes(bVersion.buildId),
          ),
      )
      assert(
        (await cacheInventory(page)).some((cache) =>
          cache.name.includes(cVersion.buildId),
        ),
      )
      await page.getByRole('button', { name: 'Update', exact: true }).click()
      await page.waitForFunction(() => document.title === 'Splice PWA C')
      assert.equal(
        (await cacheInventory(page)).filter((cache) =>
          cache.name.startsWith('splice-static-v2-'),
        ).length,
        2,
      )
    } finally {
      state.release = 'a'
      await closeWithEvidence(supersession, 'supersession')
    }
  })
  await test('missing held recovery script cannot block Retry and a throttled reconnect recovers', async () => {
    const recovery = await makeBrowserContext({ serviceWorkers: 'allow' })
    try {
      const page = await recovery.newPage()
      await login(page)
      await controlled(page)
      await bounded(
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
            const cache = await caches.open(name)
            for (const request of await cache.keys())
              if (new URL(request.url).pathname.startsWith('/pwa-offline-'))
                await cache.delete(request)
          }
        }),
        'remove cached recovery script',
        5000,
      )
      state.apiDown = true
      state.holdRecoveryScript = true
      state.hangNavigation = true
      const response = await page.goto(`${origin}/settings?held-script=1`, {
        waitUntil: 'commit',
        timeout: 15000,
      })
      assert.equal(response.headers()['x-splice-offline'], 'timeout')
      state.hangNavigation = false
      await page
        .getByRole('button', { name: 'Retry', exact: true })
        .click({ timeout: 2000 })
      await page
        .getByText('Splice is still unavailable. Try again shortly.')
        .waitFor({ timeout: 10000 })
      state.apiDown = false
      await bounded(recovery.setOffline(true), 'offline transition')
      await bounded(recovery.setOffline(false), 'online transition')
      await page
        .getByRole('heading', { name: 'Settings', exact: true })
        .waitFor({ timeout: 20000 })
      assert.equal(new URL(page.url()).search, '?held-script=1')
    } finally {
      state.apiDown = false
      state.holdRecoveryScript = false
      state.hangNavigation = false
      await closeWithEvidence(recovery, 'recovery')
    }
  })
  await test('real zero-quota storage leaves the online app and logout usable', async () => {
    const quotaContext = await makeBrowserContext({ serviceWorkers: 'allow' })
    const page = await quotaContext.newPage()
    const protocol = await quotaContext.newCDPSession(page)
    try {
      await protocol.send('Storage.overrideQuotaForOrigin', {
        origin,
        quotaSize: 0,
      })
      await login(page)
      await controlled(page)
      await page.getByRole('button', { name: 'Log out', exact: true }).click()
      await page.waitForURL((url) => !url.pathname.startsWith('/settings'))
      assert.equal((await page.request.get(`${origin}/user/me`)).status(), 401)
    } finally {
      await protocol
        .send('Storage.overrideQuotaForOrigin', { origin })
        .catch(() => undefined)
      await closeWithEvidence(quotaContext, 'quota')
    }
  })
  await test('legacy enrollment automatically rebinds and real worker push isolates logout and user B', async () => {
    const keys = createECDH('prime256v1')
    keys.generateKeys()
    const subscription = {
      endpoint: `https://fcm.googleapis.com/fcm/send/splice-fixture-${randomUUID()}`,
      keys: {
        p256dh: keys.getPublicKey().toString('base64url'),
        auth: randomBytes(16).toString('base64url'),
      },
    }
    const privacy = await makeBrowserContext({ serviceWorkers: 'allow' })
    try {
      await privacy.grantPermissions(['notifications'], { origin })
      // Only the browser subscription transport is synthetic. The production
      // enrollment/reconciliation code, HTTP auth, DB and push handler are real.
      await privacy.addInitScript((value) => {
        Object.defineProperty(PushManager.prototype, 'getSubscription', {
          value: async () => ({
            ...value,
            options: {},
            toJSON: () => value,
            unsubscribe: async () => true,
          }),
        })
      }, subscription)
      const page = await privacy.newPage()
      await login(page)
      await controlled(page)
      const userA = await (await page.request.get(`${origin}/user/me`)).json()
      const legacy = await fixture('legacy', { userId: userA.id, subscription })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await controlled(page)
      let enrollmentA
      await until(
        'automatic legacy rebind through production HTTP',
        async () => {
          const status = await (
            await page.request.get(
              `${origin}/notification/push/subscription/current`,
              { params: { endpoint: subscription.endpoint } },
            )
          ).json()
          enrollmentA = status.enrollmentId
          return (
            status.subscribed &&
            !status.rebindRequired &&
            enrollmentA !== legacy.enrollmentId
          )
        },
      )
      await until(
        'worker receives rebound enrollment',
        async () => (await workerControl(page)).enrollmentId === enrollmentA,
      )
      const pushWorker = privacy
        .serviceWorkers()
        .find((worker) => worker.url().endsWith('/sw.js'))
      assert(pushWorker)
      await pushWorker.evaluate(() => {
        self.__fixtureBadgeWrites = []
        self.__fixtureNotificationTrace = []
        const show = self.registration.showNotification.bind(self.registration)
        Object.defineProperty(self.registration, 'showNotification', {
          configurable: true,
          value: async (title, options) => {
            self.__fixtureNotificationTrace.push({
              action: 'show-start',
              title,
              tag: options?.tag,
            })
            await show(title, options)
            self.__fixtureNotificationTrace.push({
              action: 'show-finished',
              title,
              tag: options?.tag,
            })
          },
        })
        const close = Notification.prototype.close
        Object.defineProperty(Notification.prototype, 'close', {
          configurable: true,
          value: function () {
            self.__fixtureNotificationTrace.push({
              action: 'close',
              title: this.title,
              tag: this.tag,
            })
            return close.call(this)
          },
        })
        const set = navigator.setAppBadge?.bind(navigator)
        const clear = navigator.clearAppBadge?.bind(navigator)
        Object.defineProperty(navigator, 'setAppBadge', {
          configurable: true,
          value: async (count) => {
            self.__fixtureBadgeWrites.push(count)
            await set?.(count)
          },
        })
        Object.defineProperty(navigator, 'clearAppBadge', {
          configurable: true,
          value: async () => {
            self.__fixtureBadgeWrites.push(0)
            await clear?.()
          },
        })
      })
      const protocol = await privacy.newCDPSession(page)
      let registrationId
      const { targetInfo } = await protocol.send('Target.getTargetInfo')
      const versions = new Map()
      protocol.on(
        'ServiceWorker.workerVersionUpdated',
        ({ versions: updates }) => {
          for (const version of updates)
            versions.set(version.versionId, version)
          const current = [...versions.values()].find(
            (version) =>
              version.scriptURL === `${origin}/sw.js` &&
              version.status === 'activated' &&
              version.controlledClients?.includes(targetInfo.targetId),
          )
          if (current) registrationId = current.registrationId
        },
      )
      await protocol.send('ServiceWorker.enable')
      await until(
        'CDP identifies this page’s real worker registration',
        async () => Boolean(registrationId),
      )
      await writeFile(
        join(artifacts, 'push-registration.json'),
        JSON.stringify(
          {
            pageTarget: targetInfo.targetId,
            registrationId,
            versions: [...versions.values()],
          },
          null,
          2,
        ),
      )
      const notifications = () =>
        page.evaluate(async () =>
          (
            await (
              await navigator.serviceWorker.getRegistration()
            ).getNotifications()
          ).map((item) => ({
            title: item.title,
            body: item.body,
            data: item.data,
            tag: item.tag,
          })),
        )
      const push = async (enrollmentId, title, timestamp) => {
        await page.evaluate(async () =>
          (
            await (
              await navigator.serviceWorker.getRegistration()
            ).getNotifications()
          ).forEach((item) => item.close()),
        )
        // Notification.close is asynchronous at the browser/OS boundary. Do
        // not race an earlier same-tag close with the next synthetic delivery.
        await until(
          'previous native notifications finish closing',
          async () => (await notifications()).length === 0,
        )
        await protocol.send('ServiceWorker.deliverPushMessage', {
          origin,
          registrationId,
          data: JSON.stringify({
            version: 2,
            enrollmentId,
            title,
            body: 'Synthetic private account detail',
            url: '/transactions?categoryId=UNCATEGORIZED',
            tag: `fixture-${title}`,
            badgeCount: 73,
            badgeAsOf: timestamp,
          }),
        })
        await writeFile(
          join(artifacts, 'notification-trace.json'),
          JSON.stringify(
            await pushWorker.evaluate(() => ({
              notifications: self.__fixtureNotificationTrace,
              badges: self.__fixtureBadgeWrites,
            })),
            null,
            2,
          ),
        )
      }
      const firstBadge = new Date(Date.now() + 1000).toISOString()
      await push(enrollmentA, 'Fixture owner A', firstBadge)
      await until('authorized push reaches real notification API', async () =>
        (await notifications()).some(
          (item) => item.title === 'Fixture owner A',
        ),
      )
      await test('real worker notification click preserves a dirty Settings draft until explicit Open', async () => {
        const toggle = page.getByRole('switch', {
          name: 'Hide 0 balance accounts',
        })
        const original = await toggle.isChecked()
        await page.getByText('Hide 0 balance accounts', { exact: true }).click()
        const marker = await page.evaluate(() => {
          window.__pwaNotificationDraft = crypto.randomUUID()
          return window.__pwaNotificationDraft
        })
        await pushWorker.evaluate(async () => {
          const notification = (
            await self.registration.getNotifications()
          ).find((item) => item.title === 'Fixture owner A')
          if (!notification)
            throw new Error('Authorized fixture notification is missing')
          const original = self.clients.matchAll.bind(self.clients)
          // A constructed event lacks the OS gesture's focus/lifetime privilege.
          // Only those native privileges are seams; the built worker handler,
          // WindowClient postMessage, acknowledgement, and app guard stay real.
          const descriptor = Object.getOwnPropertyDescriptor(
            self.clients,
            'matchAll',
          )
          Object.defineProperty(self.clients, 'matchAll', {
            configurable: true,
            value: async (options) =>
              (await original(options)).map(
                (client) =>
                  new Proxy(client, {
                    get(target, key) {
                      if (key === 'focus') return async () => target
                      const value = Reflect.get(target, key, target)
                      return typeof value === 'function'
                        ? value.bind(target)
                        : value
                    },
                  }),
              ),
          })
          const pending = []
          const event = new NotificationEvent('notificationclick', {
            notification,
          })
          Object.defineProperty(event, 'waitUntil', {
            value: (promise) => pending.push(promise),
          })
          try {
            self.dispatchEvent(event)
            await Promise.all(pending)
          } finally {
            if (descriptor)
              Object.defineProperty(self.clients, 'matchAll', descriptor)
            else delete self.clients.matchAll
          }
        })
        await page
          .getByText('Notification ready to open', { exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).pathname, '/settings')
        assert.equal(
          await page.evaluate(() => window.__pwaNotificationDraft),
          marker,
        )
        assert.equal(await toggle.isChecked(), !original)
        assert(
          await page
            .getByRole('button', { name: 'Open', exact: true })
            .isDisabled(),
        )
        await page.getByRole('button', { name: 'Cancel', exact: true }).click()
        await page.getByRole('button', { name: 'Open', exact: true }).click()
        await page
          .getByRole('heading', { name: 'Transactions', exact: true })
          .waitFor()
        assert.equal(
          new URL(page.url()).searchParams.get('categoryId'),
          'UNCATEGORIZED',
        )
        await page.goto(`${origin}/settings`)
        await page
          .getByRole('heading', { name: 'Settings', exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('switch', { name: 'Hide 0 balance accounts' })
            .isChecked(),
          original,
        )
      })
      // Restore a displayed private notification so the logout clear assertion
      // below cannot pass vacuously after the click closed its notification.
      await push(enrollmentA, 'Fixture owner A', firstBadge)
      await until('private notification displayed before logout', async () =>
        (await notifications()).some(
          (item) => item.title === 'Fixture owner A',
        ),
      )
      await page.getByRole('button', { name: 'Log out', exact: true }).click()
      await until(
        'privacy session is revoked',
        async () =>
          (await page.request.get(`${origin}/user/me`)).status() === 401,
      )
      await controlled(page)
      await until(
        'logout clears displayed private notifications',
        async () =>
          !(await notifications()).some(
            (item) => item.title === 'Fixture owner A',
          ),
      )
      const logoutWrites = await pushWorker.evaluate(
        () => self.__fixtureBadgeWrites.length,
      )
      await push(
        enrollmentA,
        'Stale A after logout',
        new Date(Date.now() + 2000).toISOString(),
      )
      await until('logged-out push is generic', async () =>
        (await notifications()).some(
          (item) => item.tag === 'splice-device-state',
        ),
      )
      assert(
        !(await notifications()).some((item) => item.title.includes('Stale A')),
      )
      const disabled = await workerControl(page)
      assert.equal(disabled.disabled, true)
      assert.equal(disabled.lastBadgeAsOf, null)
      assert(
        (await pushWorker.evaluate(() => self.__fixtureBadgeWrites))
          .slice(logoutWrites)
          .every((value) => value === 0),
        'Stale logged-out push wrote a financial badge',
      )
      await fixture('second-user')
      await login(page)
      await controlled(page)
      const userB = await (await page.request.get(`${origin}/user/me`)).json()
      assert.notEqual(userB.id, userA.id)
      await page
        .getByRole('tab', { name: 'Notifications', exact: true })
        .click()
      await until('new owner can explicitly enable notifications', async () =>
        page
          .getByRole('switch', { name: 'Enable notifications on this device' })
          .isEnabled(),
      )
      await page
        .getByText('Enable notifications on this device', { exact: true })
        .click()
      let enrollmentB
      await until('new owner explicitly enrolls through Settings', async () => {
        const status = await (
          await page.request.get(
            `${origin}/notification/push/subscription/current`,
            { params: { endpoint: subscription.endpoint } },
          )
        ).json()
        enrollmentB = status.enrollmentId
        return status.subscribed && enrollmentB !== enrollmentA
      })
      await until(
        'new owner handshake reaches real worker',
        async () => (await workerControl(page)).enrollmentId === enrollmentB,
      )
      const priorWrites = await pushWorker.evaluate(
        () => self.__fixtureBadgeWrites.length,
      )
      await push(
        enrollmentA,
        'Stale A for B',
        new Date(Date.now() + 3000).toISOString(),
      )
      await until('cross-owner push resolves generically', async () =>
        (await notifications()).some(
          (item) => item.tag === 'splice-device-state',
        ),
      )
      assert(
        !(await notifications()).some((item) => item.title.includes('Stale A')),
      )
      assert.equal((await workerControl(page)).enrollmentId, enrollmentB)
      assert(
        (await pushWorker.evaluate(() => self.__fixtureBadgeWrites))
          .slice(priorWrites)
          .every((value) => value === 0),
        'Old owner push wrote a financial badge for B',
      )
      const oldEligibility = await page.request.post(
        `${origin}/_pwa/enrollment`,
        { data: { enrollmentId: enrollmentA } },
      )
      assert.equal((await oldEligibility.json()).eligible, false)
      await push(
        enrollmentB,
        'Fixture owner B',
        new Date(Date.now() + 4000).toISOString(),
      )
      await until('new owner push validates real server enrollment', async () =>
        (await notifications()).some(
          (item) => item.title === 'Fixture owner B',
        ),
      )
    } finally {
      const worker = privacy
        .serviceWorkers()
        .find((item) => item.url().endsWith('/sw.js'))
      if (worker)
        await writeFile(
          join(artifacts, 'notification-trace.json'),
          JSON.stringify(
            await bounded(
              worker.evaluate(() => ({
                notifications: self.__fixtureNotificationTrace,
                badges: self.__fixtureBadgeWrites,
              })),
              'capture native notification trace',
            ).catch(() => null),
            null,
            2,
          ),
        ).catch(() => undefined)
      await closeWithEvidence(privacy, 'privacy')
    }
  })
  await test('both installed shortcuts preserve authenticated destinations through login', async () => {
    const shortcuts = JSON.parse(
      await readFile(join(builds.a, '.output/public/manifest.json'), 'utf8'),
    ).shortcuts
    for (const shortcut of shortcuts) {
      const shortcutContext = await makeBrowserContext({
        serviceWorkers: 'allow',
      })
      try {
        const page = await shortcutContext.newPage()
        await page.goto(new URL(shortcut.url, origin).href)
        await page.waitForURL(
          (url) =>
            url.pathname === '/' && url.searchParams.get('login') === 'true',
        )
        assert.equal(
          new URL(page.url()).searchParams.get('redirect'),
          shortcut.url,
        )
        await page.goto(
          `${origin}/user/dev/login?redirect=${encodeURIComponent(shortcut.url)}`,
        )
        await page
          .getByRole('heading', {
            name: shortcut.url.startsWith('/accounts')
              ? 'Accounts'
              : 'Transactions',
            exact: true,
          })
          .waitFor()
        assert.equal(
          new URL(page.url()).pathname + new URL(page.url()).search,
          shortcut.url,
        )
      } finally {
        await closeWithEvidence(shortcutContext, 'shortcut')
      }
    }
  })
  await test('offline Update attempts preserve the document and rapid repeated clicks reload exactly once', async () => {
    const updates = await makeBrowserContext({ serviceWorkers: 'allow' })
    try {
      state.release = 'a'
      await updates.addInitScript((expectedOrigin) => {
        if (location.origin !== expectedOrigin) return
        const count =
          Number(sessionStorage.getItem('pwa-fixture-documents') ?? 0) + 1
        sessionStorage.setItem('pwa-fixture-documents', String(count))
        window.__pwaDocumentCount = count
      }, origin)
      const page = await updates.newPage()
      await login(page)
      await controlled(page)
      const count = await page.evaluate(() => window.__pwaDocumentCount)
      state.release = 'b'
      await wake(page, 2)
      const update = page.getByRole('button', { name: 'Update', exact: true })
      await update.waitFor()
      await until('B worker is waiting before offline Update', () =>
        page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
        ),
      )
      await updates.setOffline(true)
      await page.getByText('Offline', { exact: true }).waitFor()
      assert(await update.isDisabled())
      // Native disabled-button activation is a no-op, including repeated intent.
      await update.evaluate((button) => {
        button.click()
        button.click()
      })
      await delay(300)
      assert.equal(await page.evaluate(() => window.__pwaDocumentCount), count)
      assert.equal(await page.title(), 'Splice')
      assert(
        await page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
        ),
      )
      await updates.setOffline(false)
      await until('Update is enabled after reconnect', () => update.isEnabled())
      const destination = page.url()
      // A burst invokes the actual DOM/React action before a rerender disables
      // the button. The production update promise must serialize those clicks.
      await update.evaluate((button) => {
        button.click()
        button.click()
        button.click()
      })
      await page.waitForFunction(() => document.title === 'Splice PWA B')
      await controlled(page)
      await delay(700)
      assert.equal(page.url(), destination)
      assert.equal(
        await page.evaluate(() => window.__pwaDocumentCount),
        count + 1,
      )
      assert.equal(
        await page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
        ),
        false,
      )
    } finally {
      state.release = 'a'
      await closeWithEvidence(updates, 'update-repeated')
    }
  })
  await test('missing old lazy chunk returns404, preserves dirty Settings, and recovers only through explicit Update', async () => {
    const oldAssets = await readdir(join(builds.a, '.output/public/assets'))
    const nextAssets = await readdir(join(builds.b, '.output/public/assets'))
    const oldChunk = oldAssets.find((name) =>
      /^RecurringManualTransactionsSection-[^.]+\.js$/.test(name),
    )
    const nextChunk = nextAssets.find((name) =>
      /^RecurringManualTransactionsSection-[^.]+\.js$/.test(name),
    )
    assert(
      oldChunk && nextChunk && oldChunk !== nextChunk,
      'A/B lazy chunk seam changed',
    )
    assert(
      !nextAssets.includes(oldChunk),
      'Old lazy chunk must really be absent from B',
    )
    const missing = await makeBrowserContext({ serviceWorkers: 'allow' })
    try {
      state.release = 'a'
      await missing.addInitScript((expectedOrigin) => {
        if (location.origin !== expectedOrigin) return
        const count =
          Number(sessionStorage.getItem('pwa-fixture-documents') ?? 0) + 1
        sessionStorage.setItem('pwa-fixture-documents', String(count))
        window.__pwaDocumentCount = count
      }, origin)
      const page = await missing.newPage()
      await login(page)
      await controlled(page)
      const count = await page.evaluate(() => window.__pwaDocumentCount)
      const original = await page
        .getByRole('switch', { name: 'Hide 0 balance accounts' })
        .isChecked()
      assert(
        !(await cacheInventory(page)).some((cache) =>
          cache.urls.includes(`${origin}/assets/${oldChunk}`),
        ),
        'Lazy feature was unexpectedly precached',
      )
      await page.getByText('Hide 0 balance accounts', { exact: true }).click()
      state.release = 'b'
      const failedImport = page.waitForResponse(
        (response) => response.url() === `${origin}/assets/${oldChunk}`,
        { timeout: 15000 },
      )
      await page.getByRole('tab', { name: 'Recurring', exact: true }).click()
      const failure = await failedImport
      assert.equal(failure.status(), 404)
      assert.match(failure.headers()['content-type'], /^text\/plain/)
      // Chromium may discard the body of a failed module request. Verify the
      // actual missing-asset response independently while retaining the real
      // dynamic-import404 assertion above.
      const missingResponse = await page.request.get(failure.url())
      assert.equal(missingResponse.status(), 404)
      assert.match(missingResponse.headers()['content-type'], /^text\/plain/)
      assert.equal(await missingResponse.text(), 'Not Found')
      await page
        .getByText(
          'Part of Splice could not load. Update when your work is saved.',
          { exact: true },
        )
        .waitFor()
      await page
        .getByText('Settings section could not load', { exact: true })
        .waitFor()
      assert(
        await page
          .getByRole('button', { name: 'Update', exact: true })
          .isDisabled(),
      )
      assert.equal(await page.evaluate(() => window.__pwaDocumentCount), count)
      assert.equal(await page.title(), 'Splice')
      assert(
        !(await cacheInventory(page)).some((cache) =>
          cache.urls.includes(`${origin}/assets/${oldChunk}`),
        ),
        'Missing asset was substituted or cached',
      )
      await page.getByRole('tab', { name: 'General', exact: true }).click()
      assert.equal(
        await page
          .getByRole('switch', { name: 'Hide 0 balance accounts' })
          .isChecked(),
        !original,
      )
      assert.equal(await page.evaluate(() => window.__pwaDocumentCount), count)
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('button', { name: 'Update', exact: true }).click()
      await page.waitForFunction(() => document.title === 'Splice PWA B')
      await controlled(page)
      assert.equal(
        await page.evaluate(() => window.__pwaDocumentCount),
        count + 1,
      )
      assert.equal(
        await page
          .getByRole('switch', { name: 'Hide 0 balance accounts' })
          .isChecked(),
        original,
      )
      const loadedImport = page.waitForResponse(
        (response) => response.url() === `${origin}/assets/${nextChunk}`,
        { timeout: 15000 },
      )
      await page.getByRole('tab', { name: 'Recurring', exact: true }).click()
      assert.equal((await loadedImport).status(), 200)
      await page
        .getByText('No recurring transactions', { exact: true })
        .waitFor()
      await delay(500)
      assert.equal(
        await page.evaluate(() => window.__pwaDocumentCount),
        count + 1,
      )
    } finally {
      state.release = 'a'
      await closeWithEvidence(missing, 'missing-old-lazy')
    }
  })
  assert.deepEqual(failures, [], 'Unexpected browser page errors')
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      {
        browser: browser.version(),
        backend: options['backend-url']
          ? 'existing isolated local backend'
          : 'real Nest AppModule in a fresh benchmark schema',
        sourceChange: 'src/routes/__root.tsx: Splice → Splice PWA B',
        builds: {
          a: aVersion.buildId,
          b: bVersion.buildId,
          c: cVersion.buildId,
        },
        checks,
        limitations: [
          'Chromium browser emulation; no physical iOS/Android certification.',
          'PushManager transport and badge observation are browser API fixtures; CDP dispatches genuine built-worker push events with real HTTP ownership. Constructed notification clicks emulate OS focus/lifetime privileges, not an OS gesture. Cold openWindow/OS clicks and provider delivery remain outside this harness; auth destinations are verified with real navigations.',
        ],
      },
      null,
      2,
    ),
  )
  process.stdout.write(
    `PWA lifecycle passed ${checks.length} real-browser checks. Evidence: ${join(artifacts, 'results.json')}\n`,
  )
} catch (error) {
  if (browser) {
    for (const [index, page] of browser
      .contexts()
      .flatMap((context) => context.pages())
      .entries()) {
      await page
        .screenshot({
          path: join(artifacts, `failure-${index}.png`),
          fullPage: true,
          timeout: 3000,
        })
        .catch(() => undefined)
      await writeFile(
        join(artifacts, `failure-${index}.html`),
        await bounded(page.content(), 'capture HTML').catch(() => ''),
      ).catch(() => undefined)
    }
  }
  await writeFile(
    join(artifacts, 'failure-state.json'),
    JSON.stringify(
      {
        state,
        requests,
        pages: await Promise.all(
          (browser?.contexts().flatMap((context) => context.pages()) ?? []).map(
            async (page) => ({
              url: page.url(),
              recovery: await bounded(
                page.evaluate(() => ({
                  online: navigator.onLine,
                  visibility: document.visibilityState,
                  started: window.__spliceOfflineRecoveryStarted === true,
                  status: document.getElementById('splice-recovery-status')
                    ?.textContent,
                  events: window.__spliceOfflineEvents,
                })),
                'capture recovery state',
              ).catch(() => null),
              caches: await bounded(
                cacheInventory(page),
                'capture caches',
              ).catch(() => null),
              worker: await bounded(
                page.evaluate(async () => {
                  const r = await navigator.serviceWorker.getRegistration()
                  return {
                    controlled: Boolean(navigator.serviceWorker.controller),
                    active: r?.active?.state,
                    waiting: r?.waiting?.state,
                  }
                }),
                'capture worker state',
              ).catch(() => null),
            }),
          ),
        ),
      },
      null,
      2,
    ),
  ).catch(() => undefined)
  await writeFile(
    join(artifacts, 'failure.json'),
    JSON.stringify({ checks, error: error.message }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue
    const closed = new Promise((done) => child.once('exit', done))
    child.kill('SIGTERM')
    const force = setTimeout(() => child.kill('SIGKILL'), 10_000)
    await closed
    clearTimeout(force)
  }
  for (const socket of sockets) socket.destroy()
  for (const server of servers.reverse())
    await new Promise((done) => server.close(done))
  if (options['keep-builds'] !== 'true')
    await rm(temporary, { recursive: true, force: true })
}
