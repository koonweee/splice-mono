import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

// Resolve the compiler's actual route preloads, then follow static ES imports.
// Dynamic imports remain deferred; moving code to a required vendor chunk counts.
const output = resolve(process.argv[2] ?? '.output')
const manifestDir = resolve(output, 'server/chunks/_')
const manifestName = (await readdir(manifestDir)).find((name) =>
  name.startsWith('_tanstack-start-manifest_v-'),
)
if (!manifestName) throw new Error('Build the production app first')
const { tsrStartManifest } = await import(
  pathToFileURL(resolve(manifestDir, manifestName)).href
)
const manifest = tsrStartManifest()
const cache = new Map()
async function fileInfo(url) {
  if (cache.has(url)) return cache.get(url)
  const bytes = await readFile(
    resolve(output, 'public', url.replace(/^\//, '')),
  )
  const source = bytes.toString()
  const imports = [
    ...source.matchAll(
      /(?:\bimport\s*(?:[^;"']*?\s*from\s*)?|\bexport\s*[^;"']*?\s*from\s*)["']([^"']+)["']/g,
    ),
  ]
    .map((match) => match[1])
    .filter((name) => name.startsWith('.'))
    .map((name) => resolve(dirname(url), name))
  const info = { url, raw: bytes.length, gzip: gzipSync(bytes).length, imports }
  cache.set(url, info)
  return info
}
async function closure(urls, seen = new Set()) {
  for (const url of urls) {
    if (seen.has(url) || !url.endsWith('.js')) continue
    seen.add(url)
    await closure((await fileInfo(url)).imports, seen)
  }
  return [...seen]
}
const routes = {}
for (const route of [
  '/',
  '/_authed/home',
  '/_authed/transactions',
  '/_authed/accounts',
  '/_authed/analysis',
  '/_authed/settings',
]) {
  const ancestors = route.startsWith('/_authed/')
    ? ['__root__', '/_authed', route]
    : ['__root__', route]
  const files = await closure(
    ancestors.flatMap((id) => manifest.routes[id]?.preloads ?? []),
  )
  const infos = await Promise.all(files.map(fileInfo))
  routes[route] = {
    files,
    raw: infos.reduce((sum, file) => sum + file.raw, 0),
    gzip: infos.reduce((sum, file) => sum + file.gzip, 0),
  }
}
console.log(
  JSON.stringify(
    { entry: await fileInfo(manifest.clientEntry), routes },
    null,
    2,
  ),
)
