const js = require('@eslint/js')

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.min.js',
      'public/emdr-therapy/**',
      'docs/**',
      'test/**',
      '*.config.js'
    ]
  },
  {
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Custom globals
        WS_MSG: 'readonly',
        WebSocketClient: 'readonly',
        PhysicsEngine: 'readonly',
        BallRenderer: 'readonly',
        sharedComponents: 'readonly',
        debugLog: 'readonly',
        debugError: 'readonly',
        throttle: 'readonly',
        getSessionIdFromUrl: 'readonly',
        setDirection: 'readonly',
        setBallColor: 'readonly',
        setBackgroundColor: 'readonly',
        setBallSize: 'readonly',
        togglePlayPause: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        crypto: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-multiple-empty-lines': 'warn',
      'no-trailing-spaces': 'warn'
    }
  }
]
