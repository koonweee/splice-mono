import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const isTest = process.env.VITEST === 'true'
const disableDevtools = process.env.VITE_DISABLE_DEVTOOLS === 'true'

const config = defineConfig({
  plugins: [
    // Skip devtools, nitro, and tanstackStart in test mode to avoid hanging processes
    ...(!isTest && !disableDevtools ? [devtools()] : []),
    ...(!isTest ? [nitro(), tanstackStart()] : []),
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
          'assets/**/*.{js,css,woff2}',
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
