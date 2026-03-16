import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // ── Ignore outputs and dependencies ────────────────────────────────────────
  { ignores: ['dist/**', 'release/**', 'node_modules/**'] },

  // ── TypeScript recommended rules for all source files ──────────────────────
  ...tseslint.configs.recommended,

  // ── Renderer-only: React rules ─────────────────────────────────────────────
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      // React 17+ new JSX transform — no need to import React in scope
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // TypeScript handles prop validation
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // ── Project-wide rule overrides ─────────────────────────────────────────────
  {
    rules: {
      // Intentionally-unused params are prefixed with _ throughout the stubs
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Stubs use explicit any sparingly; flag it as a warning not an error
      '@typescript-eslint/no-explicit-any': 'warn',
      // Empty catch blocks in storage are intentional (return default values)
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
);
