/* eslint-disable no-undef */
module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:sonarjs/recommended'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  plugins: [
    'sonarjs'
  ],
  rules: {
    // SonarQube specific rules
    'sonarjs/cognitive-complexity': ['error', 15],
    'sonarjs/max-switch-cases': ['error', 30],
    'sonarjs/no-duplicate-string': ['error', 3],
    'sonarjs/no-identical-functions': 'error',
    'sonarjs/no-unused-collection': 'error',
    'sonarjs/no-useless-catch': 'error',
    'sonarjs/prefer-immediate-return': 'error',
    'sonarjs/prefer-object-literal': 'error',
    'sonarjs/prefer-single-boolean-return': 'error'
  },
  overrides: [
    {
      files: ['public/js/**/*.js'],
      env: {
        browser: true
      },
      globals: {
        PhysicsEngine: 'readonly',
        BallRenderer: 'readonly',
        WebSocketClient: 'readonly',
        WS_MSG: 'readonly',
        AudioManager: 'readonly',
        sharedComponents: 'readonly',
        throttle: 'readonly',
        getSessionIdFromUrl: 'readonly',
        logger: 'readonly',
        bbCounters: 'readonly',
        ControllerState: 'readonly',
        ViewerState: 'readonly',
        CommunicationFactory: 'readonly',
        i18n: 'readonly',
        getCommunicationMode: 'readonly',
        updateConnectionStatus: 'readonly',
        updateViewerStatusUI: 'readonly',
        showNotification: 'readonly',
        switchPreviewSource: 'readonly',
        hideP2PFallbackBanner: 'readonly',
        updatePreviewSize: 'readonly',
        updateViewerInfo: 'readonly',
        applyServerStateToPreview: 'readonly',
        completeInitialization: 'readonly',
        startP2PConnection: 'readonly',
        showP2PFallbackBanner: 'readonly',
        scheduleP2PFallbackNotice: 'readonly',
        clearP2PFallbackTimer: 'readonly',
        centerBallInViewer: 'readonly',
        _handlePause: 'readonly',
        updatePlayPauseButton: 'readonly',
        syncFsPlayPauseButton: 'readonly',
        updateViewerAudioStatusUI: 'readonly',
        showViewerSoundIndicator: 'readonly',
        createLogger: 'readonly',
        updateSpeedValue: 'readonly',
        updateSizeValue: 'readonly',
        updateColorPicker: 'readonly',
        updateModeSelect: 'readonly',
        updatePresetSelect: 'readonly',
        safeSend: 'readonly',
        setDirection: 'readonly',
        updateDirectionButtons: 'readonly',
        updateDirectionDisplay: 'readonly',
        resizePreviewFullscreen: 'readonly',
        setBallColor: 'readonly',
        setBallSize: 'readonly',
        setSoundEnabled: 'readonly',
        setSoundType: 'readonly',
        setBackgroundColor: 'readonly'
      }
    }
  ]
};
