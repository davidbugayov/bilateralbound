'use strict';

const globals = require('globals');
const js = require('@eslint/js');
const stylistic = require('@stylistic/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

// Define common rules to be shared across configurations
const commonRules = {
  // Error rules - critical issues
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-const-assign': 'error',
  'no-var': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrorsIgnorePattern: '^_' }],
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
  'no-debugger': 'off',
};

module.exports = [
  // 0. Import @stylistic plugin
  {
    plugins: {
      '@stylistic': stylistic,
    },
  },

  // 1. Global ignores
  {
    ignores: [
      'node_modules/**',
      '**/dist/**',
      '**/build/**',
      'coverage/**',
      '*.min.js',
      '*.bundle.js',
      'lib/**',
      'public/emdr-therapy/**',
      'docs/**',
      '.git/**',
      '.idea/**',
      '.vscode/**',
      'test-results/**',
      'packages/web-client/dist/**',
      'packages/web-client/public/js/vendor/**',
      'eslint.config.js',
      'webpack.config.js',
      'packages/web-client/.eslintrc.js',
      'packages/web-client/sonar-scanner.js',
      'packages/web-client/webpack.config.js',
      'scripts/update-version.js',
      'jsconfig.json',
      '.scannerwork/**',
      'reports/**',
      '**/assets/**',
    ],
  },

  // 2. Base recommended config
  js.configs.recommended,

  // 3. Server-side code (Node.js)
  {
    files: ['packages/server-core/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...commonRules,
      // Allow JSHint directives and legacy comments
      'no-redeclare': 'off',
      'no-unused-vars': ['error', { args: 'none', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // 3.1. Config files (ESLint, webpack, etc.)
  {
    files: [
      'eslint.config.js',
      'webpack.config.js',
      'config/**/*.js',
      'packages/web-client/webpack.config.js',
      'packages/web-client/sonar-scanner.js',
      'ecosystem.config.js',
      'packages/shared/test/**/*.js',
      'packages/web-client/test/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // More lenient rules for config files
      'no-undef': 'off', // Allow global Node.js features
      'no-console': 'off',
      'no-debugger': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // 4.1. Client-side code (Browser) - Web Client public files with custom globals
  {
    files: ['packages/web-client/public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Standard globals
        globalThis: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
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
        Image: 'readonly',
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
        crypto: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',

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
        createLogger: 'readonly',
        logger: 'readonly',

        // Functions from controller.js
        togglePlayPause: 'readonly',
        setDirection: 'readonly',
        resetCenter: 'readonly',
        updateSpeed: 'readonly',
        setBallColor: 'readonly',
        setBallSize: 'readonly',
        setBackgroundColor: 'readonly',
        updateDirectionButtons: 'readonly',
        updateDirectionDisplay: 'readonly',
        updatePlayPauseButton: 'readonly',
        safeSend: 'readonly',

        // Functions from new-features.js
        updateSizeValue: 'readonly',
        updateSpeedValue: 'readonly',
        updateColorPicker: 'readonly',
        updateModeSelect: 'readonly',
        updatePresetSelect: 'readonly',

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
        toggleFullscreen: 'readonly',
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
        syncFsPlayPauseButton: 'readonly',
        updateViewerAudioStatusUI: 'readonly',
        showViewerSoundIndicator: 'readonly',
        resizePreviewFullscreen: 'readonly',
        setSoundEnabled: 'readonly',
        setSoundType: 'readonly',
      },
    },
    rules: {
      ...commonRules,
      // Browser files often redefine globals - this is OK for browserify/global scope
      'no-redeclare': 'off',
      'no-unused-vars': 'off', // Browser globals may be used in other scripts
    },
  },

  // 4.1.old. Client-side code (Browser) - Web Client public files (old config - removing)
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Image: 'readonly',
      },
    },
    rules: {
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
    },
  },

  // 5. E2E test scripts (hybrid - they use both Node.js and browser globals)
  {
    files: ['scripts/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // Browser-like globals that puppeteer tests might use
        document: 'readonly',
        window: 'readonly',
        PhysicsEngine: 'readonly',
        MouseEvent: 'readonly',
        setDirection: 'readonly',
      },
    },
    rules: {
      'no-await-in-loop': 'off', // Disable in test scripts where sequential awaiting is often necessary
      'no-unused-vars': ['warn', { args: 'none', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // 6. Web client src files (JavaScript)
  {
    files: ['packages/web-client/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Standard globals
        globalThis: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        JSON: 'readonly',
        console: 'readonly',
        module: 'readonly',
        exports: 'writable',
        require: 'readonly',

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
        Image: 'readonly',
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
        crypto: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',

        // Project-specific globals
        WebSocketClient: 'readonly',
        WS_MSG: 'readonly',
        getSessionIdFromUrl: 'readonly',
        resetSession: 'readonly',
        sharedComponents: 'readonly',
        components: 'writable',
        PhysicsEngine: 'readonly',
        BallRenderer: 'readonly',
        throttle: 'readonly',
        createLogger: 'readonly',
        logger: 'readonly',
        AudioManager: 'readonly',
        notificationSystem: 'readonly',
        ThemeManager: 'readonly',
        debugLog: 'readonly',
        debugError: 'readonly',
        debugWarn: 'readonly',
        copy: 'readonly',
        goBack: 'readonly',
        toggleFullscreen: 'readonly',
        bbCounters: 'readonly',
        ControllerState: 'readonly',
        ViewerState: 'readonly',
        CommunicationFactory: 'readonly',
        i18n: 'readonly',
        getCommunicationMode: 'readonly',
        togglePlayPause: 'readonly',
        setDirection: 'readonly',
        RealtimeClient: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        PreviewManager: 'readonly',
      },
    },
    rules: {
      ...commonRules,
      'no-redeclare': 'off',
      'no-unused-vars': [
        'error',
        { args: 'none', varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // 7. Shared package (browser-compatible Node.js module)
  {
    files: ['packages/shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Standard Node.js globals
        globalThis: 'readonly',
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        JSON: 'readonly',
        console: 'readonly',
        module: 'readonly',
        exports: 'writable',
        require: 'readonly',

        // Browser globals (shared code runs in both)
        window: 'readonly',
        performance: 'readonly',
        CustomEvent: 'readonly',
        Path2D: 'readonly',
      },
    },
    rules: {
      ...commonRules,
      'no-redeclare': 'off',
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
