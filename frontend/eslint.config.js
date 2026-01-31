//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  { ignores: ['*.config.js', 'src/api/clients/**', 'src/api/models/**'] },
  ...tanstackConfig,
]
