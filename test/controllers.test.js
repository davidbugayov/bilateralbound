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

  test('should update play/pause button correctly', () => {
    uiController.updatePlayPauseButton(true);

    const button = document.getElementById('playPauseBtn');
    expect(button.textContent).toBe('⏸ Стоп');
    expect(button.classList.contains('playing')).toBe(true);
  });

  test('should update direction segments', () => {
    const currentDirection = { dx: 1, dy: 0 };
    uiController.updateDirectionSegments(currentDirection);

    const rightSegment = document.querySelector('[data-direction="right"]');
    const leftSegment = document.querySelector('[data-direction="left"]');

    expect(rightSegment.classList.contains('active')).toBe(true);
    expect(leftSegment.classList.contains('active')).toBe(false);
  });

  test('should update viewer status', () => {
    const screenSize = { width: 1920, height: 1080 };
    uiController.updateViewerStatus(true, screenSize);

    const statusEl = document.getElementById('viewerStatus');
    expect(statusEl.textContent).toBe('Подключен (1920×1080)');
    expect(statusEl.classList.contains('connected')).toBe(true);
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

  test('should send controller update', async () => {
    const data = { paused: true };
    await wsController.sendControllerUpdate(data);

    expect(mockWsClient.send).toHaveBeenCalledWith('controller_update', data);
  });

  test('should send direction change', async () => {
    await wsController.sendDirectionChange(1, 0);

    expect(mockWsClient.send).toHaveBeenCalledWith('controller_update', { dirX: 1, dirY: 0 });
  });

  test('should send play/pause toggle', async () => {
    await wsController.sendPlayPauseToggle(true);

    expect(mockWsClient.send).toHaveBeenCalledWith('controller_update', { paused: false });
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
