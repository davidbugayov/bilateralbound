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
      'docs/**'
    ]
  },

  // 2. Base recommended config
  js.configs.recommended,

  // 3. Server-side code (Node.js)
  {
    files: ['server/**/*.js', '*.js', '*.config.js', '.*.js', 'webhook-server.js'],
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

  // 4. Client-side code (Browser)
  {
    files: ['public/js/controllers/**/*.js', 'public/js/utils/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        WS_MSG: 'readonly',
        WebSocketClient: 'readonly',
        PhysicsEngine: 'readonly',
        BallRenderer: 'readonly',
        sharedComponents: 'readonly',
        debugLog: 'readonly',
        debugError: 'readonly',
        debugWarn: 'readonly',
        throttle: 'readonly',
        getSessionIdFromUrl: 'readonly',
        setDirection: 'readonly',
        setBallColor: 'readonly',
        setBackgroundColor: 'readonly',
        setBallSize: 'readonly',
        togglePlayPause: 'readonly',
        themeManager: 'readonly'
      }
    }
  },
  {
    files: ['public/js/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        WS_MSG: 'readonly',
        WebSocketClient: 'readonly',
        PhysicsEngine: 'readonly',
        BallRenderer: 'readonly',
        sharedComponents: 'readonly',
        debugLog: 'readonly',
        debugError: 'readonly',
        debugWarn: 'readonly',
        throttle: 'readonly',
        getSessionIdFromUrl: 'readonly',
        setDirection: 'readonly',
        setBallColor: 'readonly',
        setBackgroundColor: 'readonly',
        setBallSize: 'readonly',
        togglePlayPause: 'readonly',
        themeManager: 'readonly'
      }
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
