import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const js = require('@eslint/js');
const globals = require('globals');

// The executable CJS harness is intentionally outside the application's TS project.
export default [
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, caughtErrors: 'none' },
      ],
    },
  },
];
