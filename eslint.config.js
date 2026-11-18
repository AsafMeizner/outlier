// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores(['art-lab/**', 'dist/**', 'node_modules/**', 'vendor-dl/**', 'data/**', 'test-results/**', 'playwright-report/**', 'release/**', '.tmp/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'] ?? reactHooks.configs['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['server/**/*.ts', 'tools/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
