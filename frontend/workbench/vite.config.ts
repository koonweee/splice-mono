import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spliceCss } from '../vite-css'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  css: spliceCss,
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  plugins: [
    {
      name: 'workbench-api-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          !importer ||
          !importer.startsWith(
            fileURLToPath(new URL('../src/', import.meta.url)),
          )
        )
          return
        const target = (
          source.startsWith('@/')
            ? resolve(
                fileURLToPath(new URL('../src/', import.meta.url)),
                source.slice(2),
              )
            : source.startsWith('.')
              ? resolve(dirname(importer), source)
              : source
        ).replace(/\.tsx?$/, '')
        const replacements: Record<string, string> = {
          'api/axios': 'fixture-api.ts',
          'lib/auth': 'auth-boundary.ts',
          'lib/pwa/service-worker': 'pwa-boundary.ts',
          'lib/pwa/app-badge': 'pwa-boundary.ts',
          'lib/session': 'runtime-boundaries.tsx',
          'lib/presentation-preferences': 'runtime-boundaries.tsx',
          'lib/appearance-preferences': 'appearance-boundary.ts',
          'lib/notifications/browser-push': 'notification-boundary.ts',
        }
        for (const [production, fixture] of Object.entries(replacements)) {
          if (
            target ===
            fileURLToPath(new URL(`../src/${production}`, import.meta.url))
          )
            return fileURLToPath(new URL(`./${fixture}`, import.meta.url))
        }
      },
    },
    react(),
  ],
  server: { strictPort: true },
  build: { outDir: '../.workbench', emptyOutDir: true },
})
