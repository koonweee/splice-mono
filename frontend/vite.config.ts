import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const isTest = process.env.VITEST === 'true'

const config = defineConfig({
  plugins: [
    // Skip devtools, nitro, and tanstackStart in test mode to avoid hanging processes
    ...(!isTest ? [devtools(), nitro(), tanstackStart()] : []),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    viteReact(),
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
