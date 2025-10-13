module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: ['standard'],
  parserOptions: {
    sourceType: 'module'
  },
  globals: {
    WS_MSG: 'readonly',
    WebSocketClient: 'readonly',
    PhysicsEngine: 'readonly',
    BallRenderer: 'readonly',
    sharedComponents: 'readonly',
    debugLog: 'readonly',
    debugError: 'readonly',
    throttle: 'readonly',
    getSessionIdFromUrl: 'readonly'
  },
  rules: {
    'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    'no-undef': 'error'
  }
}
