module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  extends: [
    'standard'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    'no-console': 'off', // Allow console in server-side code
    'no-unused-vars': 'warn',
    'no-var': 'error',
    'prefer-const': 'error',
    'semi': ['error', 'never'],
    'quotes': ['error', 'single'],
    'indent': ['error', 2],
    'comma-dangle': ['error', 'never']
  },
  globals: {
    window: 'readonly',
    document: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    fetch: 'readonly',
    URLSearchParams: 'readonly',
    PhysicsEngine: 'readonly',
    BallRenderer: 'readonly',
    SessionSync: 'readonly',
    createOptimizedCanvas: 'readonly',
    ObjectPool: 'readonly',
    isElementVisible: 'readonly',
    moduleFactory: 'readonly',
    ball: 'readonly',
    debugLog: 'readonly',
    debugError: 'readonly',
    debugWarn: 'readonly'
  }
}
