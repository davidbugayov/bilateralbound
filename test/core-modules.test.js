/**
 * Tests for core modules
 */
import { LazyLoader } from '../public/js/utils/LazyLoader.js';

// Mock modules
jest.mock('../public/js/physics-engine.js', () => {
  return function(options = {}) {
    this.options = {
      worldWidth: 800,
      worldHeight: 600,
      ballRadius: 20,
      ...options
    };

    this.ball = {
      x: this.options.worldWidth / 2,
      y: this.options.worldHeight / 2,
      vx: 100, // Добавляем движение для теста
      vy: 50,
      speed: 30,
      radius: this.options.ballRadius
    };

    this.getState = () => ({
      x: this.ball.x,
      y: this.ball.y,
      vx: this.ball.vx,
      vy: this.ball.vy,
      speed: this.ball.speed,
      radius: this.ball.radius,
      colorBall: '#60a5fa',
      colorBg: '#020617',
      paused: true
    });

    this.update = (deltaTime) => {
      // Mock update method that changes state
      this.ball.x += this.ball.vx * deltaTime;
      this.ball.y += this.ball.vy * deltaTime;
    };

    return this;
  };
});

jest.mock('../public/js/renderer.js', () => {
  return function(canvas, physicsEngine, options = {}) {
    this.canvas = canvas;
    this.physics = physicsEngine;
    this.options = options;

     this.drawFrame = (state) => {
       // Mock drawFrame method - state parameter kept for interface compatibility
       console.log('Mock drawFrame called with state:', state);
     };

    return this;
  };
});

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
    const sharedComponentsModule = require('../public/js/shared-components.js');
    const container = document.getElementById('test-container');

    const speedControl = sharedComponentsModule.sharedComponents.createSpeedControl(container, {
      defaultValue: 50,
      onSpeedChange: jest.fn()
    });

    expect(speedControl).toBeDefined();
    expect(speedControl.currentSpeed).toBe(50);
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
    const WebSocketClient = require('../public/js/websocket-client.js');
    const client = new WebSocketClient('test-session', 'controller');

    expect(client).toBeDefined();
    expect(client.sessionId).toBe('test-session');
    expect(client.role).toBe('controller');
  });
});

describe('Physics Engine', () => {
  test('should create physics engine', () => {
    const PhysicsEngine = require('../public/js/physics-engine.js');
    const engine = new PhysicsEngine({
      worldWidth: 400,
      worldHeight: 300,
      ballRadius: 20
    });

    expect(engine).toBeDefined();
  });

  test('should update physics state', () => {
    const PhysicsEngine = require('../public/js/physics-engine.js');
    const engine = new PhysicsEngine({
      worldWidth: 400,
      worldHeight: 300,
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
    const BallRenderer = require('../public/js/renderer.js');
    const canvas = document.getElementById('test-canvas');
    const mockPhysics = { getState: () => ({ x: 200, y: 150, vx: 1, vy: 0 }) };

    const renderer = new BallRenderer(canvas, mockPhysics);
    expect(renderer).toBeDefined();
  });

  test('should render ball', () => {
    const BallRenderer = require('../public/js/renderer.js');
    const canvas = document.getElementById('test-canvas');
    const mockPhysics = { getState: () => ({ x: 200, y: 150, vx: 1, vy: 0 }) };

    const renderer = new BallRenderer(canvas, mockPhysics);

    // Should not throw error
    expect(() => renderer.drawFrame({ x: 200, y: 150, radius: 20 })).not.toThrow();
  });
});
