'use strict'

const globals = require('globals')
const js = require('@eslint/js')
const stylistic = require('@stylistic/eslint-plugin')

// Define common rules to be shared across configurations
const commonRules = {
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

  // Warning rules - style and best practices (migrated to @stylistic)
  'prefer-const': 'error',
  'no-empty': 'warn',

  // @stylistic rules (replaced deprecated core rules)
  '@stylistic/no-multiple-empty-lines': ['error', { max: 2 }],
  '@stylistic/no-trailing-spaces': 'error',
  '@stylistic/no-extra-semi': 'error',
  '@stylistic/semi': ['error', 'never'],
  '@stylistic/quotes': ['error', 'single'],
  '@stylistic/quote-props': ['error', 'as-needed'],
  '@stylistic/comma-dangle': ['error', 'never'],

  // Disabled rules for this project
  'no-console': 'off',
  'no-debugger': 'off'
}

module.exports = [
  // 0. Import @stylistic plugin
  {
    plugins: {
      '@stylistic': stylistic
    }
  },

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
    rules: commonRules
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
    rules: commonRules
  },

  // 4.1. Client-side code (Browser) - Web Client public files
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Standard globals
        globalThis: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        JSON: 'readonly',
        console: 'readonly',
        module: 'readonly',

        // Browser globals
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        history: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        CustomEvent: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        WebSocket: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        Blob: 'readonly',
        Path2D: 'readonly',

        // WebSocket and session management
        WebSocketClient: 'readonly',
        WS_MSG: 'readonly',
        getSessionIdFromUrl: 'readonly',
        resetSession: 'readonly',

        // UI and components
        sharedComponents: 'readonly',
        components: 'writable',

        // Physics and rendering
        PhysicsEngine: 'readonly',
        BallRenderer: 'readonly',

        // Utilities
        throttle: 'readonly',

        // Functions from new-features.js that might be used elsewhere
        togglePlayPause: 'readonly',
        setDirection: 'readonly',

        // Additional globals for the current project structure
        AudioManager: 'readonly',
        notificationSystem: 'readonly',
        showSuccessNotification: 'readonly',
        showErrorNotification: 'readonly',
        showWarningNotification: 'readonly',
        showInfoNotification: 'readonly',
        ThemeManager: 'readonly',
        debugLog: 'readonly',
        debugError: 'readonly',
        debugWarn: 'readonly',
        copy: 'readonly',
        goBack: 'readonly',
        toggleFullscreen: 'readonly'
      }
    },
    rules: {
      ...commonRules,
      // Allow redeclaration of globals that are defined in these files
      'no-redeclare': 'off'
    }
  }
]
