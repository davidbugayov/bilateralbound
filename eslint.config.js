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
        history: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        crypto: 'readonly',
        // Browser APIs
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        CustomEvent: 'readonly',
        Path2D: 'readonly',
        prompt: 'readonly'
      }
    },
    rules: {
      // Строгие правила для ошибок
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-const-assign': 'error',
      'no-var': 'error',

      // Мягкие правила для предупреждений
      'no-unused-vars': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
      'no-multiple-empty-lines': 'warn',
      'no-trailing-spaces': 'warn',
      'no-extra-semi': 'warn',

      // Отключенные правила для более мягкого подхода
      'no-console': 'off',
      'no-debugger': 'off'
    }
  }
]
