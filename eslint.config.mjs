import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const sharedIgnores = [
  'node_modules/**',
  'dist/**',
  'release/**',
  'coverage/**',
  'code_review/reports/**',
  'email_smoke/**',
  'pdf_tests/generated/**',
  'pdf_tests/generated_quick/**',
  'mobile/.dart_tool/**',
  'mobile/build/**',
  'mobile/android/.gradle/**',
  'mobile/android/app/build/**',
  'mobile/ios/Flutter/ephemeral/**',
  'mobile/ios/Pods/**',
  'mcp/bin/**',
];

export default [
  {
    ignores: sharedIgnores,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['electron/**/*.{js,cjs,mjs}', 'scripts/**/*.{js,mjs,cjs}', 'code_review/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];