import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warn rather than error: the hook dependency rule cannot see that a
      // GSAP setup function is intentionally re-run on an explicit dependency
      // list, and the alternative is silencing it everywhere.
      'react-hooks/exhaustive-deps': 'warn',
      /*
       * Fetch-on-mount sets loading and error state synchronously inside the
       * effect, which this rule discourages. The rule is aimed at state that
       * should have been derived during render; here the state genuinely
       * describes an in-flight request that only an effect can start. The
       * recommended alternative is a data-fetching library, which is more
       * dependency than this app's handful of screens justify. Kept as a
       * warning so a genuinely avoidable case still gets noticed.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
);
