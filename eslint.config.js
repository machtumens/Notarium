import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'backend/dist/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // jsx-a11y at warn — M14 will fix and re-enable as errors
      ...Object.fromEntries(
        Object.keys(jsxA11y.configs.recommended.rules).map((k) => [k, 'warn']),
      ),
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'preserve-caught-error': 'warn', // M03
      'no-empty': 'warn', // M03
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['backend/src/**/*.ts'],
    languageOptions: {
      globals: globals.serviceworker,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'preserve-caught-error': 'warn', // M03
      'no-empty': 'warn', // M03
    },
  },
);
