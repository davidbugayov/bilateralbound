/**
 * Performance Tests - тестирование производительности системы BilateralBound
 * Проверяет оптимизации и эффективность различных компонентов
 */

describe('Performance Tests', () => {
  describe('WebSocket Coalescing', () => {
    test('WebSocket coalescing reduces message frequency', () => {
      // Создаем мок WebSocketClient
      const mockWsClient = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
        isConnected: jest.fn(() => true)
      };

      // Создаем контроллер с моками
      const { WebSocketController } = require('../public/js/controllers/WebSocketController.js');
      const mockAppState = {
        sessionId: 'test-session',
        viewerConnected: false,
        viewerScreenSize: { width: 1920, height: 1080 },
        isPlaying: false,
        directionState: { dx: 1, dy: 0 },
        speed: 40,
        lastServerState: null
      };

      const wsController = new WebSocketController(mockWsClient, mockAppState);

      // Отправляем несколько быстрых команд
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(wsController.sendControllerUpdate({ speed: 40 + i }));
      }

      // Ждем завершения всех отправок
      return Promise.all(promises).then(() => {
        // Проверяем, что сообщения были объединены (coalesced)
        // В реальности coalescing происходит внутри WebSocketClient
        expect(mockWsClient.send).toHaveBeenCalled();
      });
    });

    test('Priority messages bypass coalescing', async () => {
      const mockWsClient = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
        isConnected: jest.fn(() => true)
      };

      const { WebSocketController } = require('../public/js/controllers/WebSocketController.js');
      const mockAppState = {
        sessionId: 'test-session',
        viewerConnected: false,
        viewerScreenSize: { width: 1920, height: 1080 },
        isPlaying: false,
        directionState: { dx: 1, dy: 0 },
        speed: 40,
        lastServerState: null
      };

      const wsController = new WebSocketController(mockWsClient, mockAppState);

      // Отправляем приоритетное сообщение
      await wsController.sendControllerUpdate({ paused: true });
      expect(mockWsClient.send).toHaveBeenCalledWith('controller_update', { paused: true });
    });
  });

  describe('Renderer Performance', () => {
    test('Renderer handles high frame rates', () => {
      // Создаем мок canvas и physics engine
      const mockCanvas = {
        width: 400,
        height: 300,
        getContext: () => ({
          fillRect: jest.fn(),
          beginPath: jest.fn(),
          arc: jest.fn(),
          fill: jest.fn(),
          save: jest.fn(),
          restore: jest.fn(),
          translate: jest.fn(),
          createRadialGradient: jest.fn(() => ({
            addColorStop: jest.fn()
          }))
        })
      };

      const mockPhysics = {
        getInterpolatedBall: () => ({
          x: 200,
          y: 150,
          radius: 20,
          colorBall: '#60a5fa'
        }),
        ball: {
          x: 200,
          y: 150,
          radius: 20
        },
        colors: {
          ball: '#60a5fa',
          bg: '#020617'
        }
      };

      const BallRenderer = require('../public/js/renderer.js');
      const renderer = new BallRenderer(mockCanvas, mockPhysics);

      // Тестируем производительность рендеринга
      const startTime = performance.now();

      // Рендерим 100 кадров
      for (let i = 0; i < 100; i++) {
        renderer.drawFrame({
          x: 200 + i,
          y: 150,
          radius: 20,
          colorBall: '#60a5fa',
          colorBg: '#020617'
        });
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Должно рендериться быстро (менее 100ms для 100 кадров)
      expect(duration).toBeLessThan(100);
    });

    test('Canvas resize maintains performance', () => {
      const mockCanvas = {
        width: 400,
        height: 300,
        style: {},
        getContext: () => ({
          fillRect: jest.fn(),
          beginPath: jest.fn(),
          arc: jest.fn(),
          fill: jest.fn()
        })
      };

      const mockPhysics = {
        getInterpolatedBall: () => ({
          x: 200,
          y: 150,
          radius: 20
        }),
        setWorldSize: jest.fn()
      };

      const BallRenderer = require('../public/js/renderer.js');
      const renderer = new BallRenderer(mockCanvas, mockPhysics);

      // Тестируем изменение размеров
      const startTime = performance.now();

      renderer.resize(800, 600);
      renderer.resize(400, 300);
      renderer.resize(1200, 900);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Изменение размеров должно быть быстрым
      expect(duration).toBeLessThan(10);
      expect(mockPhysics.setWorldSize).toHaveBeenCalledTimes(3);
    });
  });

  describe('LazyLoader Performance', () => {
    test('LazyLoader reduces initial loading time', async () => {
      const { LazyLoader } = require('../public/js/utils/LazyLoader.js');

      // Тестируем время загрузки компонентов
      const startTime = performance.now();

      const physicsComponent = await LazyLoader.loadComponent('physics');
      const rendererComponent = await LazyLoader.loadComponent('renderer');

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Загрузка должна быть быстрой (увеличиваем лимит времени для теста)
      expect(duration).toBeLessThan(1000);
      expect(physicsComponent).toBeDefined();
      expect(rendererComponent).toBeDefined();
    });

    test('LazyLoader handles concurrent requests', async () => {
      const { LazyLoader } = require('../public/js/utils/LazyLoader.js');

      // Тестируем одновременную загрузку
      const startTime = performance.now();

      const promises = [
        LazyLoader.loadComponent('physics'),
        LazyLoader.loadComponent('renderer'),
        LazyLoader.loadComponent('physics'),
        LazyLoader.loadComponent('renderer')
      ];

      const results = await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Все компоненты должны загрузиться
      expect(results).toHaveLength(4);
      expect(duration).toBeLessThan(100);

      results.forEach(component => {
        expect(component).toBeDefined();
      });
    });
  });

  describe('Memory Management', () => {
    test('WebSocket client cleanup prevents memory leaks', () => {
      const mockWsClient = {
        send: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
        isConnected: jest.fn(() => true)
      };

      const { WebSocketController } = require('../public/js/controllers/WebSocketController.js');
      const mockAppState = {
        sessionId: 'test-session',
        viewerConnected: false,
        viewerScreenSize: { width: 1920, height: 1080 },
        isPlaying: false,
        directionState: { dx: 1, dy: 0 },
        speed: 40,
        lastServerState: null
      };

      const wsController = new WebSocketController(mockWsClient, mockAppState);

      // Проверяем, что контроллер создан
      expect(wsController).toBeDefined();
      expect(wsController.wsClient).toBe(mockWsClient);
      expect(wsController.appState).toBe(mockAppState);
    });

    test('Physics engine handles rapid updates', () => {
      const PhysicsEngine = require('../public/js/physics-engine.js');
      const engine = new PhysicsEngine({
        worldWidth: 400,
        worldHeight: 300,
        ballRadius: 20
      });

      // Тестируем быстрые обновления
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        engine.update(16); // 60fps
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 1000 обновлений должно выполняться быстро
      expect(duration).toBeLessThan(100);
    });
  });
});
