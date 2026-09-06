import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { expandMediaQuery } from './src/lib/media-queries'

const isTest = process.env.VITEST === 'true'
const disableDevtools = process.env.VITE_DISABLE_DEVTOOLS === 'true'

const config = defineConfig({
  // SSR route links are removed on navigation, but Vite remembers their CSS as
  // loaded. Keep shared component styles in the persistent root stylesheet.
  build: { cssCodeSplit: false },
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'splice-responsive-media',
          AtRule: {
            media(rule) {
              rule.params = expandMediaQuery(rule.params)
            },
          },
        },
      ],
    },
  },
  plugins: [
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
            purpose: 'any maskable',
          },
          {
            src: 'favicon512.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'any maskable',
          },
        ],
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        description: 'Personal finance dashboard for synced transactions.',
        theme_color: '#282a36',
        background_color: '#282a36',
      },
      injectManifest: {
        globPatterns: [
          'favicon.ico',
          'favicon192.png',
          'favicon512.png',
          'apple-touch-icon.png',
          'splash/*.png',
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
