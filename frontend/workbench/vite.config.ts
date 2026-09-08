import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spliceCss } from '../vite-css'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // The app and workbench optimize different entry points and run together.
  cacheDir: fileURLToPath(
    new URL('../node_modules/.vite-workbench', import.meta.url),
  ),
  css: spliceCss,
  resolve: {
    alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  },
  plugins: [
    {
      name: 'workbench-api-boundary',
      enforce: 'pre',
      transform(code, id) {
        if (
          id !==
          fileURLToPath(
            new URL('../src/lib/feature-loaders.ts', import.meta.url),
          )
        )
          return
        const gate = fileURLToPath(
          new URL('./loading-gates.ts', import.meta.url),
        )
        const gated = code
          .replace(
            'sharedImport<T>(load:',
            'sharedImport<T>(name: string, load:',
          )
          .replace(
            /(export const (\w+) = )sharedImport\(/g,
            '$1sharedImport("$2", ',
          )
          .replace(/(\n {2}(\w+): )sharedImport\(/g, '$1sharedImport("$2", ')
          .replace(
            'pending ??= load().catch',
            'pending ??= waitForModule(name).then(load).catch',
          )
        return `import { waitForModule } from ${JSON.stringify(gate)};\n${gated}`
      },
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
          'lib/pwa/use-save-home-snapshot': 'snapshot-boundary.ts',
          'lib/pwa/home-snapshot': 'snapshot-boundary.ts',
          'lib/pwa/service-worker': 'pwa-boundary.ts',
          'lib/pwa/app-badge': 'pwa-boundary.ts',
          'lib/pwa/logout': 'pwa-boundary.ts',
          'lib/pwa/logout-state': 'pwa-boundary.ts',
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
