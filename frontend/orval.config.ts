import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: 'http://localhost:3000/api-json',
    output: {
      target: './src/api/clients',
      schemas: './src/api/models',
      client: 'react-query',
      mode: 'split',
    },
  },
})
