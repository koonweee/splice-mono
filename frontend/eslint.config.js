//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

const config = tanstackConfig.map((config) => {
  if (!config.plugins?.['@typescript-eslint']) {
    return config
  }

  return {
    ...config,
    rules: {
      ...config.rules,
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  }
})

export default [
  { ignores: ['*.config.js', '.output/**'] },
  ...config,
]
