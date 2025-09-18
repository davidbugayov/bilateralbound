/**
 * Tests for core modules
 */
import { LazyLoader } from '../public/js/utils/LazyLoader.js';

// Mock modules
jest.mock('../public/js/physics-engine.js', () => ({
  default: class MockPhysicsEngine {
    constructor() {
      this.width = 400;
      this.height = 300;
    }
  }
}));

jest.mock('../public/js/renderer.js', () => ({
  default: class MockRenderer {
    constructor() {
      this.canvas = null;
    }
  }
}));

describe('LazyLoader', () => {
  test('should load physics component', async () => {
    const component = await LazyLoader.loadComponent('physics');
    expect(component).toBeDefined();
  });

  test('should load renderer component', async () => {
    const component = await LazyLoader.loadComponent('renderer');
    expect(component).toBeDefined();
  });

  test('should throw error for unknown component', async () => {
    await expect(LazyLoader.loadComponent('unknown')).rejects.toThrow(
      'Component "unknown" not found for lazy loading.'
    );
  });
});

describe('SharedComponents', () => {
  // Mock DOM
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-container"></div>';
  });

  test('should create speed control component', () => {
    // Import here to avoid hoisting issues
    const { SharedComponents } = require('../public/js/shared-components.js');
    const sharedComponents = new SharedComponents();
    const container = document.getElementById('test-container');
    
    const speedControl = sharedComponents.createSpeedControl(container, {
      defaultValue: 50,
      onSpeedChange: jest.fn()
    });
    
    expect(speedControl).toBeDefined();
    expect(speedControl.currentSpeed).toBe(50);
  });

  test('should create direction control component', () => {
    const { SharedComponents } = require('../public/js/shared-components.js');
    const sharedComponents = new SharedComponents();
    const container = document.getElementById('test-container');
    
    const directionControl = sharedComponents.createDirectionControl(container, {
      onDirectionChange: jest.fn()
    });
    
    expect(directionControl).toBeDefined();
  });

  test('should create play/pause control component', () => {
    const { SharedComponents } = require('../public/js/shared-components.js');
    const sharedComponents = new SharedComponents();
    const container = document.getElementById('test-container');
    
    const playPauseControl = sharedComponents.createPlayPauseControl(container, {
      onToggle: jest.fn()
    });
    
    expect(playPauseControl).toBeDefined();
  });
});

describe('WebSocket Client', () => {
  // Mock WebSocket
  global.WebSocket = jest.fn(() => ({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }));

  test('should create WebSocket client', () => {
    const { WebSocketClient } = require('../public/js/websocket-client.js');
    const client = new WebSocketClient('test-session', 'controller');
    
    expect(client).toBeDefined();
    expect(client.sessionId).toBe('test-session');
    expect(client.role).toBe('controller');
  });

  test('should handle message coalescing', () => {
    const { WebSocketClient } = require('../public/js/websocket-client.js');
    const client = new WebSocketClient('test-session', 'controller');
    
    // Mock send method
    client.send = jest.fn();
    
    // Send multiple messages quickly
    client.send({ type: 'controller_update', data: { speed: 50 } });
    client.send({ type: 'controller_update', data: { speed: 60 } });
    client.send({ type: 'controller_update', data: { speed: 70 } });
    
    // Should coalesce messages
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});

describe('Physics Engine', () => {
  test('should create physics engine', () => {
    const { PhysicsEngine } = require('../public/js/physics-engine.js');
    const engine = new PhysicsEngine({
      width: 400,
      height: 300,
      ballRadius: 20
    });
    
    expect(engine).toBeDefined();
    expect(engine.width).toBe(400);
    expect(engine.height).toBe(300);
  });

  test('should update physics state', () => {
    const { PhysicsEngine } = require('../public/js/physics-engine.js');
    const engine = new PhysicsEngine({
      width: 400,
      height: 300,
      ballRadius: 20
    });
    
    const initialState = engine.getState();
    engine.update(16); // 60fps
    
    const updatedState = engine.getState();
    expect(updatedState).not.toEqual(initialState);
  });
});

describe('Ball Renderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="test-canvas" width="400" height="300"></canvas>';
  });

  test('should create renderer', () => {
    const { BallRenderer } = require('../public/js/renderer.js');
    const canvas = document.getElementById('test-canvas');
    const mockPhysics = { getState: () => ({ x: 200, y: 150, vx: 1, vy: 0 }) };
    
    const renderer = new BallRenderer(canvas, mockPhysics);
    expect(renderer).toBeDefined();
  });

  test('should render ball', () => {
    const { BallRenderer } = require('../public/js/renderer.js');
    const canvas = document.getElementById('test-canvas');
    const mockPhysics = { getState: () => ({ x: 200, y: 150, vx: 1, vy: 0 }) };
    
    const renderer = new BallRenderer(canvas, mockPhysics);
    renderer.render();
    
    // Should not throw error
    expect(() => renderer.render()).not.toThrow();
  });
});
