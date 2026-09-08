import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { OFFLINE_COLORS } from './src/lib/design-system/offline'
import { spliceCss } from './vite-css'
import {
  OFFLINE_RECOVERY_SCRIPT,
  offlineAssetPath,
} from './src/lib/pwa/offline-page'

const isTest = process.env.VITEST === 'true'
const disableDevtools = process.env.VITE_DISABLE_DEVTOOLS === 'true'
const buildId = `${Date.now().toString(36)}-${randomUUID()}`
const essentialAssets = new Set<string>()

const config = defineConfig({
  define: { __SPLICE_BUILD_ID__: JSON.stringify(buildId) },
  // SSR route links are removed on navigation, but Vite remembers their CSS as
  // loaded. Keep shared component styles in the persistent root stylesheet.
  build: { cssCodeSplit: false },
  css: spliceCss,
  plugins: [
    {
      name: 'splice-pwa-build',
      enforce: 'post',
      generateBundle(_options, bundle) {
        if (this.environment.config.consumer !== 'client') return
        essentialAssets.clear()
        const visit = (filename: string) => {
          if (essentialAssets.has(filename)) return
          const chunk = Object.values(bundle).find(
            (output) => output.fileName === filename,
          )
          if (!chunk || chunk.type !== 'chunk') return
          essentialAssets.add(filename)
          for (const dependency of chunk.imports) visit(dependency)
          for (const css of chunk.viteMetadata?.importedCss ?? [])
            essentialAssets.add(css)
          for (const asset of chunk.viteMetadata?.importedAssets ?? [])
            essentialAssets.add(asset)
        }
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && output.isEntry) visit(output.fileName)
          // Saved Home must include its lazy chart on a cold offline launch,
          // including after an upgrade that changes chart dependency hashes.
          if (output.type === 'chunk' && output.name === 'Chart')
            visit(output.fileName)
          if (output.type === 'asset' && output.names.includes('style.css'))
            essentialAssets.add(output.fileName)
        }
        if (process.env.VITE_CACHED_HOME !== 'false') {
          const entry = Object.values(bundle).find(
            (output) => output.type === 'chunk' && output.isEntry,
          )
          if (!entry) throw new Error('Missing PWA client entry')
          const styles = Object.values(bundle).filter(
            (output) =>
              output.type === 'asset' && output.fileName.endsWith('.css'),
          )
          const shell = `pwa-shell-${buildId}.html`
          this.emitFile({
            type: 'asset',
            fileName: shell,
            source: `<!doctype html><html lang="en" data-splice-launch="local"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#000000"><title>Splice</title>${styles.map((output) => `<link rel="stylesheet" href="/${output.fileName}">`).join('')}</head><body><script type="module" src="/${entry.fileName}"></script></body></html>`,
          })
          essentialAssets.add(shell)
        }
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ buildId }),
        })
        const offlineFilename = offlineAssetPath(buildId).slice(1)
        this.emitFile({
          type: 'asset',
          fileName: offlineFilename,
          source: OFFLINE_RECOVERY_SCRIPT,
        })
        essentialAssets.add(offlineFilename)
      },
    },
    {
      name: 'splice-persistent-css',
      enforce: 'post',
      generateBundle(_options, bundle) {
        if (this.environment.config.consumer !== 'client') return
        // Start discovers SSR styles through entry-chunk metadata. Vite does
        // not attach its combined CSS asset there when cssCodeSplit is false.
        const stylesheet = Object.values(bundle).find(
          (output) =>
            output.type === 'asset' && output.names.includes('style.css'),
        )
        if (!stylesheet) return
        for (const output of Object.values(bundle)) {
          if (output.type === 'chunk' && output.isEntry) {
            output.viteMetadata?.importedCss.add(stylesheet.fileName)
          }
        }
      },
    },
    // Skip devtools, nitro, and tanstackStart in test mode to avoid hanging processes
    ...(!isTest && !disableDevtools ? [devtools()] : []),
    ...(!isTest
      ? [
          nitro({
            serverDir: 'server',
            routeRules: {
              '/sw.js': {
                headers: {
                  'cache-control': 'no-cache, no-store, must-revalidate',
                },
              },
              '/version.json': { headers: { 'cache-control': 'no-store' } },
            },
          }),
          tanstackStart(),
        ]
      : []),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    viteReact(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      outDir: '.output/public',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      manifestFilename: 'manifest.json',
      includeManifestIcons: false,
      manifest: {
        short_name: 'Splice',
        name: 'Splice',
        icons: [
          {
            src: 'favicon.ico',
            sizes: '256x256 128x128 64x64 48x48 32x32 24x24 16x16',
            type: 'image/x-icon',
          },
          {
            src: 'favicon192.png',
            type: 'image/png',
            sizes: '192x192',
            purpose: 'any',
          },
          {
            src: 'favicon512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any',
          },
        ],
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        description: 'Personal finance dashboard for synced transactions.',
        theme_color: OFFLINE_COLORS.canvas,
        background_color: OFFLINE_COLORS.canvas,
        shortcuts: [
          {
            name: 'Review uncategorized transactions',
            short_name: 'Uncategorized',
            url: '/transactions?categoryId=UNCATEGORIZED',
            icons: [
              { src: '/favicon192.png', sizes: '192x192', type: 'image/png' },
            ],
          },
          {
            name: 'Accounts',
            url: '/accounts',
            icons: [
              { src: '/favicon192.png', sizes: '192x192', type: 'image/png' },
            ],
          },
        ],
      },
      injectManifest: {
        globPatterns: [
          'favicon192.png',
          'apple-touch-icon.png',
          'assets/**/*.{js,css,woff,woff2,png,svg,webp,avif,jpg,jpeg}',
          'pwa-offline-*.js',
          'pwa-shell-*.html',
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        manifestTransforms: [
          (manifest) => {
            const entries = manifest.filter(
              (entry) =>
                essentialAssets.has(entry.url) ||
                ['favicon192.png', 'apple-touch-icon.png'].includes(entry.url),
            )
            const measured = entries.map((entry) => {
              const bytes = readFileSync(resolve('.output/public', entry.url))
              return {
                ...entry,
                size: bytes.length,
                gzipBytes: gzipSync(bytes).length,
              }
            })
            const rawBytes = measured.reduce(
              (total, entry) => total + entry.size,
              0,
            )
            const gzipBytes = measured.reduce(
              (total, entry) => total + entry.gzipBytes,
              0,
            )
            if (rawBytes > 2.5 * 1024 * 1024 || gzipBytes > 1024 * 1024)
              throw new Error(
                `PWA essential assets exceed startup budget (${rawBytes} raw / ${gzipBytes} gzip bytes)`,
              )
            writeFileSync(
              resolve('.output/pwa-assets.json'),
              JSON.stringify(
                { buildId, rawBytes, gzipBytes, entries: measured },
                null,
                2,
              ),
            )
            return Promise.resolve({ manifest: entries, warnings: [] })
          },
        ],
      },
    }),
  ],
  ssr: {
    // Bundle these packages for SSR instead of treating as external
    noExternal: ['@tabler/icons-react'],
  },
  test: {
    environment: 'jsdom',
  },
})

export default config
