// Contrôle du code (npm run lint) : règles recommandées d'ESLint, globales du navigateur et des API Chrome.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'tests/e2e/out/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // Prisme et l'export Excel cherchent exprès les espaces insécables dans le texte
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipTemplates: true }],
    },
  },
  // Scripts de contenu : scripts classiques injectés dans les pages
  { files: ['extension/content/**/*.js'], languageOptions: { sourceType: 'script' } },
  { files: ['extension/lib/prisme-worker.js'], languageOptions: { globals: globals.worker } },
  // Tests et scripts Node (les fonctions passées au navigateur par Playwright gardent les globales ci-dessus)
  {
    files: ['tests/**/*.{js,mjs}', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
