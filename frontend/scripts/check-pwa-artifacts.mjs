import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const equals = arg.indexOf('=')
    return [arg.slice(0, equals), arg.slice(equals + 1)]
  }),
)
const output = resolve(args['--output'] ?? '.output')
const publicRoot = join(output, 'public')
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const version = await readJson(join(publicRoot, 'version.json'))
const report = await readJson(join(output, 'pwa-assets.json'))
const manifest = await readJson(join(publicRoot, 'manifest.json'))
const worker = await readFile(join(publicRoot, 'sw.js'), 'utf8')

assert.deepEqual(Object.keys(version), ['buildId'])
assert.match(version.buildId, /^[a-zA-Z0-9-]{1,100}$/)
assert.equal(report.buildId, version.buildId)
assert(
  worker.includes(version.buildId),
  'Worker and public version must share a build ID',
)
assert.equal(manifest.id, '/')
assert.equal(manifest.scope, '/')
assert.equal(manifest.start_url, '/')
assert.deepEqual(
  manifest.shortcuts.map((shortcut) => shortcut.url),
  ['/transactions?categoryId=UNCATEGORIZED', '/accounts'],
)
assert(
  report.entries.some((entry) => /^assets\/main-[\w-]+\.js$/.test(entry.url)),
  'Precache must include the application entry',
)
assert(
  report.entries.some((entry) => entry.url.endsWith('.css')),
  'Precache must include core CSS',
)
assert(
  report.entries.some(
    (entry) => entry.url === `pwa-offline-${version.buildId}.js`,
  ),
  'Precache must include recovery script',
)
assert.equal(
  new Set(report.entries.map((entry) => entry.url)).size,
  report.entries.length,
)
let rawBytes = 0
let gzipBytes = 0
for (const entry of report.entries) {
  assert(
    entry.url === `pwa-shell-${version.buildId}.html` || !/splash\/|\.map$|\.html$|version\.json|manifest\.json|(^|\/)(api|user|notification)(\/|$)/i.test(
      entry.url,
    ),
    `Private or nonessential URL in precache: ${entry.url}`,
  )
  assert(
    !/AnalysisSankeyChart-|CategorizationRulesSection-|TransactionsMobileList-/.test(
      entry.url,
    ),
    `Deferred feature in startup precache: ${entry.url}`,
  )
  assert(
    !entry.url.includes('..') && !entry.url.startsWith('/'),
    'Precache paths must be build-relative',
  )
  const content = await readFile(join(publicRoot, entry.url))
  assert.equal(content.length, entry.size)
  assert.equal(gzipSync(content).length, entry.gzipBytes)
  assert(
    worker.includes(entry.url),
    `Worker is missing declared precache asset: ${entry.url}`,
  )
  rawBytes += content.length
  gzipBytes += entry.gzipBytes
}
assert.equal(rawBytes, report.rawBytes)
assert.equal(gzipBytes, report.gzipBytes)
assert(rawBytes <= 2.5 * 1024 * 1024, 'Precache raw budget exceeded')
assert(gzipBytes <= 1024 * 1024, 'Precache compressed budget exceeded')
const clientFiles = await readdir(join(publicRoot, 'assets'))
const clientBuildMatches = await Promise.all(
  clientFiles
    .filter((file) => file.endsWith('.js'))
    .map(async (file) =>
      (await readFile(join(publicRoot, 'assets', file), 'utf8')).includes(
        version.buildId,
      ),
    ),
)
assert(
  clientBuildMatches.some(Boolean),
  'Client and worker must share a build ID',
)

let child
let origin = args['--url']
try {
  if (!origin) {
    const reservation = createServer()
    await new Promise((done, reject) => {
      reservation.once('error', reject)
      reservation.listen(0, '127.0.0.1', done)
    })
    const { port } = reservation.address()
    await new Promise((done) => reservation.close(done))
    origin = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, [join(output, 'server/index.mjs')], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        NITRO_HOST: '127.0.0.1',
        PORT: String(port),
        NITRO_PORT: String(port),
      },
      stdio: 'ignore',
    })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error('Production server failed to start')
      try {
        ready = (
          await fetch(`${origin}/version.json`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      } catch {}
      if (ready) break
      await delay(100)
    }
    assert(ready, 'Production server did not become ready')
  }
  for (const path of ['/version.json', '/sw.js']) {
    const response = await fetch(new URL(path, origin), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    assert.equal(response.status, 200, `${path} must be available over HTTP`)
    assert.match(
      response.headers.get('cache-control') ?? '',
      /no-store/i,
      `${path} must be no-store over HTTP`,
    )
    assert(
      (await response.text()).includes(version.buildId),
      `${path} served a different build`,
    )
  }
  const missing = await fetch(
    new URL('/assets/missing-pwa-abcdefgh.js', origin),
    { signal: AbortSignal.timeout(8000) },
  )
  assert.equal(missing.status, 404)
  assert.match(missing.headers.get('cache-control') ?? '', /no-store/i)
  assert.match(missing.headers.get('content-type') ?? '', /^text\/plain/i)
  process.stdout.write(
    `PWA artifacts passed: ${report.entries.length} essential assets, ${rawBytes} raw bytes, ${gzipBytes} gzip bytes; version/worker HTTP no-store verified.\n`,
  )
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000)
    await new Promise((done) => child.once('exit', done))
    clearTimeout(timeout)
  }
}
