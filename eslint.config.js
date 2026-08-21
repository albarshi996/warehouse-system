import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import astro from 'eslint-plugin-astro';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '**/dist/',
      '**/.astro/',
      '**/node_modules/',
      '.claude/',
      '.codex/',
      '.obsidian/',
      'tmp/',
      'output/',
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
  {
    /**
     * مكتباتٌ عالميّةٌ وقت التشغيل، تُحمَّل بوسم `<script src>` من `public/lib/`
     * عملًا بقاعدة «لا CDN إطلاقًا». المحلّل الساكن لا يرى هذا الوسم فيحسبها
     * غير معرّفة — وتسعة عشر `no-undef` كاذبًا تُغرق أيّ خطأ صادقٍ بينها.
     *
     * تُعلَن للقراءة فقط: من كتب `XLSX = …` يبقى خطأً كما يجب.
     * وبعد `astro.configs.recommended` عمدًا — وإلّا لم تبلغ ملفّات `.astro`.
     */
    files: ['**/*.{js,mjs,cjs,jsx,astro}'],
    languageOptions: { globals: { XLSX: 'readonly' } },
  },
];
