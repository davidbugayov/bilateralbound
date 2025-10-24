'use strict'

const globals = require('globals')
const js = require('@eslint/js')

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        // Custom globals
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
    },
    files: ['**/*.js'],
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.min.js',
      'public/emdr-therapy/**',
      'docs/**',
      'test/**',
      '*.config.js',
      'webpack.config.js',
      'jest.config.js',
      'babel.config.js',
      '.babelrc'
    ],
    rules: {
      // Strict error-level rules
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-const-assign': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',
      'require-atomic-updates': 'error',

      // Softer warning-level rules
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-multiple-empty-lines': ['warn', { max: 2 }],
      'no-trailing-spaces': 'warn',
      'no-extra-semi': 'warn',
      semi: ['warn', 'never'],
      quotes: ['warn', 'single'],
      'quote-props': ['warn', 'as-needed'],
      'comma-dangle': ['warn', 'never'],

      // Disabled rules for a more lenient approach
      'no-console': 'off',
      'no-debugger': 'off'
    }
  }
]
