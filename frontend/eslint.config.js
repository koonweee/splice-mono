//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  { ignores: ['*.config.js'] },
  ...tanstackConfig,
  {
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  },
]
