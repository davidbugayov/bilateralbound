/**
 * Tests for controller modules
 */
import { SessionController } from '../public/js/controllers/SessionController.js';
import { UIController } from '../public/js/controllers/UIController.js';
import { WebSocketController } from '../public/js/controllers/WebSocketController.js';
import PreviewController from '../public/js/controllers/PreviewController.js';
import CountersController from '../public/js/controllers/CountersController.js';

// Mock dependencies
const mockWsClient = {
  send: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  isConnected: jest.fn(() => true)
};

const mockAppState = {
  sessionId: 'test-session',
  viewerConnected: false,
  viewerScreenSize: { width: 1920, height: 1080 },
  isPlaying: false,
  directionState: { dx: 1, dy: 0 },
  speed: 40,
  lastServerState: null
};

describe('SessionController', () => {
  let sessionController;

  beforeEach(() => {
    sessionController = new SessionController(mockWsClient, mockAppState);
  });

  test('should initialize with correct dependencies', () => {
    expect(sessionController.wsClient).toBe(mockWsClient);
    expect(sessionController.appState).toBe(mockAppState);
  });
});

describe('UIController', () => {
  let uiController;

  beforeEach(() => {
    // Mock DOM elements
    document.body.innerHTML = `
      <button id="playPauseBtn"></button>
      <button id="resetBtn"></button>
      <button id="copyBtn"></button>
      <div id="viewerStatus"></div>
      <div class="direction-segment" data-direction="left"></div>
      <div class="direction-segment" data-direction="right"></div>
    `;

    uiController = new UIController(mockAppState);
  });

  test('should initialize with app state', () => {
    expect(uiController.appState).toBe(mockAppState);
  });
});

describe('WebSocketController', () => {
  let wsController;

  beforeEach(() => {
    wsController = new WebSocketController(mockWsClient, mockAppState);
  });

  test('should initialize with dependencies', () => {
    expect(wsController.wsClient).toBe(mockWsClient);
    expect(wsController.appState).toBe(mockAppState);
  });
});

describe('CountersController', () => {
  let countersController;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="timer"></div>
      <div id="passes"></div>
      <div id="sets"></div>
    `;

    countersController = new CountersController(mockAppState);
  });

  test('should initialize with zero values', () => {
    expect(countersController.timerMs).toBe(0);
    expect(countersController.passes).toBe(0);
    expect(countersController.sets).toBe(0);
    expect(countersController.running).toBe(false);
  });

  test('should start and stop correctly', () => {
    countersController.start();
    expect(countersController.running).toBe(true);

    countersController.stop();
    expect(countersController.running).toBe(false);
  });

  test('should count bounces correctly', () => {
    countersController.start();
    countersController.onBounce();

    expect(countersController.passes).toBe(1);
  });

  test('should format time correctly', () => {
    const formatted = countersController.formatTime(125000); // 2:05
    expect(formatted).toBe('02:05');
  });

  test('should get and set stats', () => {
    const stats = { timerMs: 1000, passes: 5, sets: 1, running: true };
    countersController.setStats(stats);

    expect(countersController.getStats()).toEqual(stats);
  });
});
