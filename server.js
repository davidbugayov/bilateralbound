// Simple HTTP-only Server for BilateralBound
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');

// Import our components
const config = require('./src/config');
const logger = require('./src/logger');
const sessionManager = require('./src/session-manager');

class BilateralBoundServer {
  constructor() {
    this.app = null;
    this.server = null;

    this.initialize();
  }

  // Initialize server components
  initialize() {
    this.setupExpress();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupCleanup();
  }

  // Setup Express application
  setupExpress() {
    this.app = express();
    this.server = http.createServer(this.app);
    logger.info('Express application initialized');
  }

  // Setup middleware
  setupMiddleware() {
    const serverConfig = config.getServerConfig();

    // CORS configuration
    const corsConfig = config.getCorsConfig();
    this.app.use(cors({
      origin: corsConfig.origins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept'],
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Additional CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Origin, Accept');
      res.header('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Basic middleware
    this.app.use(express.json());

    logger.info('Middleware configured');
  }



  // Setup routes
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        sessions: sessionManager.getSessionCount(),
        uptime: process.uptime()
      });
    });

    // Статические файлы должны идти ПЕРВЫМИ, перед API маршрутами
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use('/test', express.static(path.join(__dirname)));

    // API status
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'ok',
        api: 'running',
        timestamp: new Date().toISOString(),
        sessions: sessionManager.getSessionCount()
      });
    });

    // Create session endpoints
    this.app.post('/api/session', (req, res) => {
      try {
        const session = sessionManager.createSession();
        res.json({ sessionId: session.id });
      } catch (error) {
        logger.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/session/new', (req, res) => {
      try {
        const session = sessionManager.createSession();
        res.json({ sessionId: session.id });
      } catch (error) {
        logger.error('Error creating session:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get session info
    this.app.get('/api/session/:sessionId', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        res.json({
          id: session.id,
          controllerConnected: session.controllerConnected,
          viewerConnected: session.viewerConnected,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity
        });
      } catch (error) {
        logger.error('Error getting session:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get ball state for viewer
    this.app.get('/api/session/:sessionId/state', (req, res) => {
      try {
        const { sessionId } = req.params;
        const ballState = sessionManager.getBallState(sessionId);

        if (!ballState) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Получаем размеры экрана вьювера
        const viewerScreenSize = sessionManager.getViewerScreenSize(sessionId);
        const viewerConnected = sessionManager.getViewerConnected(sessionId);
        const controllerConnected = sessionManager.getSession(sessionId)?.controllerConnected || false;

        // Возвращаем состояние шара вместе с информацией о подключениях
        res.json({
          ...ballState,
          viewerConnected,
          controllerConnected,
          viewerScreenSize: viewerScreenSize || { width: 800, height: 600 } // fallback
        });
      } catch (error) {
        logger.error('Error getting ball state:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Controller connect/update
    this.app.post('/api/session/:sessionId/controller/connect', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Обновляем состояние шарика на основе данных от контроллера
        const updates = req.body;
        if (Object.keys(updates).length > 0) {
          sessionManager.updateBallState(sessionId, updates);
          logger.logSession(sessionId, `Ball state updated: ${JSON.stringify(updates)}`);
        }

        sessionManager.setControllerConnected(sessionId, true);
        res.json({ success: true, message: 'Controller connected' });
      } catch (error) {
        logger.error('Error connecting controller:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Controller disconnect
    this.app.post('/api/session/:sessionId/controller/disconnect', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        sessionManager.setControllerConnected(sessionId, false);
        res.json({ success: true, message: 'Controller disconnected' });
      } catch (error) {
        logger.error('Error disconnecting controller:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Controller update (for sending control commands)
    this.app.post('/api/session/:sessionId/controller/update', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Обновляем состояние мяча на основе команд от контроллера
        const updates = req.body;
        if (Object.keys(updates).length > 0) {
          sessionManager.updateBallState(sessionId, updates);
          logger.logSession(sessionId, `Controller update: ${JSON.stringify(updates)}`);
        }

        res.json({ success: true, message: 'Controller update processed' });
      } catch (error) {
        logger.error('Error updating controller:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Bounce sync from client
    this.app.post('/api/session/:sessionId/bounce', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        const bounceData = req.body;
        logger.logSession(sessionId, `Bounce sync received: ${JSON.stringify(bounceData)}`);

        // Обновляем состояние шарика после отскока
        if (bounceData.x !== undefined) session.ballState.x = bounceData.x;
        if (bounceData.y !== undefined) session.ballState.y = bounceData.y;
        if (bounceData.vx !== undefined) session.ballState.vx = bounceData.vx;
        if (bounceData.vy !== undefined) session.ballState.vy = bounceData.vy;

        logger.logSession(sessionId, `Ball state updated after bounce: x=${session.ballState.x.toFixed(1)}, y=${session.ballState.y.toFixed(1)}, vx=${session.ballState.vx}, vy=${session.ballState.vy}`);

        res.json({ success: true, message: 'Bounce synchronized' });
      } catch (error) {
        logger.error('Error syncing bounce:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Viewer connect
    this.app.post('/api/session/:sessionId/viewer/connect', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        // Сохраняем размеры экрана вьювера, если они переданы
        const { screenSize } = req.body;
        if (screenSize && screenSize.width && screenSize.height) {
          sessionManager.setViewerScreenSize(sessionId, screenSize.width, screenSize.height);
          // Устанавливаем начальную позицию шара в центре экрана вьювера
          sessionManager.updateBallState(sessionId, {
            reset: true,
            pause: true
          });
        }

        sessionManager.setViewerConnected(sessionId, true);
        res.json({ success: true, message: 'Viewer connected' });
      } catch (error) {
        logger.error('Error connecting viewer:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Viewer screen size update
    this.app.post('/api/session/:sessionId/viewer/screen-size', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        const { screenSize } = req.body;
        if (screenSize && screenSize.width && screenSize.height) {
          sessionManager.setViewerScreenSize(sessionId, screenSize.width, screenSize.height);
          // При изменении размера экрана сбрасываем позицию шара в центр
          sessionManager.updateBallState(sessionId, {
            reset: true,
            pause: true
          });
          res.json({ success: true, message: 'Screen size updated' });
        } else {
          res.status(400).json({ error: 'Invalid screen size data' });
        }
      } catch (error) {
        logger.error('Error updating viewer screen size:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Viewer disconnect
    this.app.post('/api/session/:sessionId/viewer/disconnect', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        sessionManager.setViewerConnected(sessionId, false);
        res.json({ success: true, message: 'Viewer disconnected' });
      } catch (error) {
        logger.error('Error disconnecting viewer:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Controller update ball state (for movement commands)
    this.app.post('/api/session/:sessionId/controller/update', (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        if (!session.controllerConnected) {
          return res.status(403).json({ error: 'Controller not connected' });
        }

        const updates = req.body;
        const success = sessionManager.updateBallState(sessionId, updates);

        if (success) {
          res.json({ success: true, message: 'Ball state updated' });
        } else {
          res.status(400).json({ error: 'Failed to update ball state' });
        }
      } catch (error) {
        logger.error('Error updating ball state:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Static routes
    this.app.get('/s/:sessionId', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
    });





    // Специальный роут для viewer сессий - более специфичный
    this.app.get('/s/:sessionId(*)', (req, res, next) => {
      const sessionId = req.params.sessionId;

      // Пропускаем если это файл (содержит точку)
      if (sessionId.includes('.')) {
        return next();
      }

      // Проверяем что это валидный sessionId
      if (sessionId && sessionId.length >= 6) {
        res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
      } else {
        res.status(404).send('Invalid session ID');
      }
    });

    logger.info('Routes configured');
  }



  // Setup cleanup intervals
  setupCleanup() {
    // Session cleanup every minute
    setInterval(() => {
      sessionManager.cleanupExpiredSessions();
    }, 60000);

    logger.info('Cleanup intervals configured');
  }

  // Start server
  start() {
    const serverConfig = config.getServerConfig();

    this.server.listen(serverConfig.PORT, () => {
      logger.info(`Server listening on http://localhost:${serverConfig.PORT}`);
      logger.info(`Sessions: 1 hour max, 10 min inactive, 5 min no viewer`);
    });
  }

  // Stop server
  stop() {
    if (this.server) {
      this.server.close(() => {
        logger.info('Server stopped');
      });
    }
  }

  // Get server status
  getStatus() {
    return {
      uptime: process.uptime(),
      sessions: sessionManager.getSessionCount(),
      config: config.getServerConfig()
    };
  }
}

// Export for testing and external use
module.exports = BilateralBoundServer;

// Start server if this is the main module
if (require.main === module) {
  const server = new BilateralBoundServer();
  server.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.stop();
    process.exit(0);
  });
}
