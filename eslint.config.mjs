import { createRequire } from 'node:module';
const require = createRequire(new URL('./tooling/package.json', import.meta.url));
const tseslint = require('typescript-eslint');
const hooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**'] },
  {
    files: ['mobile-app/{App.tsx,src/**/*.{ts,tsx}}', 'admin-panel/src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly' } },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': hooks },
    rules: {
      'no-unreachable': 'error', 'no-constant-binary-expression': 'error',
      'no-unsafe-finally': 'error', 'no-async-promise-executor': 'error',
      'no-duplicate-imports': 'error', 'constructor-super': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
