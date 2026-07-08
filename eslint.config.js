import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import astro from 'eslint-plugin-astro';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      'dist/',
      '.astro/',
      'node_modules/',
      'public/forms/',
      'public/lib/',
      'public/Brandzo_Operational_Guide.html',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  ...astro.configs.recommended,
];
