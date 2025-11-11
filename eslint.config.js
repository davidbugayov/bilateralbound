'use strict'

const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  // 1. Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.min.js',
      '*.bundle.js',
      'lib/**',
      'public/emdr-therapy/**',
      'docs/**',
      'packages/web-client/public/**',
      '.git/**',
      '.idea/**',
      '.vscode/**'
    ]
  },

  // 2. Base recommended config
  js.configs.recommended,

  // 3. Server-side code (Node.js)
  {
    files: ['packages/server-core/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-const-assign': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',
      'require-atomic-updates': 'error',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-multiple-empty-lines': ['warn', { max: 2 }],
      'no-trailing-spaces': 'warn',
      'no-extra-semi': 'warn',
      semi: ['warn', 'never'],
      quotes: ['warn', 'single'],
      'quote-props': ['warn', 'as-needed'],
      'comma-dangle': ['warn', 'never'],
      'no-console': 'off',
      'no-debugger': 'off'
    }
  },

  // 4. Webpack and build configs
  {
    files: ['webpack.config.js', 'config/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'error',
      'no-console': 'off',
      'no-debugger': 'off'
    }
  }
]
