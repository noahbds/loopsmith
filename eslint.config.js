import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'test/e2e/out/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, browser: 'readonly', chrome: 'readonly' } },
    rules: {
      'no-unused-vars': ['warn', { args: 'after-used', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
    },
  },
  { files: ['scripts/**', 'test/**', 'eslint.config.js'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
