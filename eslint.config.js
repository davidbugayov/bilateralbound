'use strict'

const globals = require('globals')
const js = require('@eslint/js')

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
    files: [
      'packages/server-core/**/*.js', 
      'scripts/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules: {
      // Error rules - critical issues
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-const-assign': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',
      'require-atomic-updates': 'error',
      'no-constant-condition': 'error',
      
      // Warning rules - style and best practices
      'prefer-const': 'error',
      'no-empty': 'warn',
      'no-multiple-empty-lines': ['error', { max: 2 }],
      'no-trailing-spaces': 'error',
      'no-extra-semi': 'error',
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      'quote-props': ['error', 'as-needed'],
      'comma-dangle': ['error', 'never'],
      
      // Disabled rules for this project
      'no-console': 'off',
      'no-debugger': 'off'
    }
  },

  // 3.1. Config files (ESLint, webpack, etc.)
  {
    files: [
      'eslint.config.js',
      'webpack.config.js', 
      'config/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node
      }
    },
    rules: {
      // More lenient rules for config files
      'no-undef': 'off', // Allow global Node.js features
      'no-console': 'off',
      'no-debugger': 'off',
      'no-unused-vars': 'warn'
    }
  },

  // 4. Client-side code (Browser) - Web Client source files
  {
    files: ['packages/web-client/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // Error rules - critical issues
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-const-assign': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',
      'require-atomic-updates': 'error',
      'no-constant-condition': 'error',
      
      // Warning rules - style and best practices
      'prefer-const': 'error',
      'no-empty': 'warn',
      'no-multiple-empty-lines': ['error', { max: 2 }],
      'no-trailing-spaces': 'error',
      'no-extra-semi': 'error',
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      'quote-props': ['error', 'as-needed'],
      'comma-dangle': ['error', 'never'],
      
      // Disabled rules for this project
      'no-console': 'off',
      'no-debugger': 'off'
    }
  },

  // 5. Test files
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn' // More lenient for tests
    }
  }
]
