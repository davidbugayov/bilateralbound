// Simple HTTP-only Server for BilateralBound
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const http = require('http')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const { WebSocketServer } = require('ws') // WebSocket-сервер
const PhysicsEngine = require('./public/js/physics-engine.js'); // Используем общий движок физики
const config = require('./server/config.js');
const { logger, DEBUG_MODE } = require('./server/logger.js');

console.log(`\n\n--- SERVER RESTARTED WITH LATEST CODE (v.CacheFix) ---\n\n`);

// Simple config inline
// MOVED TO server/config.js

// Simple logger inline
// MOVED TO server/logger.js

// ===== МОДУЛЬНАЯ АРХИТЕКТУРА СЕРВЕРА =====
const SessionManager = require('./server/session/SessionManager.js');

// Интерфейс для управления данными сессий
// MOVED to ./server/session/SessionRepository.js

// Интерфейс для управления WebSocket соединениями
// MOVED to ./server/session/WebSocketManager.js

// Интерфейс для рассылки состояния клиентам
// MOVED to ./server/session/StateBroadcaster.js

// Основной оркестратор сессий
// MOVED to ./server/session/SessionManager.js

// Создаем глобальный экземпляр для обратной совместимости
const sessionManager = new SessionManager(apiCache) // Передаем apiCache в конструктор


// Simple Express server without complex class structure
const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server }) // Создаем WebSocket-сервер

// Добавляем механизм Heartbeat для поддержания соединений
const heartbeatInterval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      // Разрешаем inline-стили/скрипты для локальных тестов
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      styleSrcAttr: ['\'self\'', '\'unsafe-inline\''],
      styleSrcElem: ['\'self\'', '\'unsafe-inline\''],
      scriptSrc: ['\'self\'', '\'unsafe-inline\''],
      scriptSrcAttr: ['\'self\'', '\'unsafe-inline\''],
      scriptSrcElem: ['\'self\'', '\'unsafe-inline\''],
      imgSrc: ['\'self\'', 'data:', 'https:']
    }
  }
}))

// Rate limiting (отключен для локальной разработки)
const isLocal = process.env.NODE_ENV !== 'production'
if (!isLocal) {
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  })
  app.use('/api/', limiter)
}

// CORS middleware
app.use(cors({
  origin: config.getCorsConfig().origins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
}))

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Origin, Accept')
  res.header('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

app.use(express.json())

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sessions: sessionManager.getSessionCount(),
    uptime: process.uptime()
  })
})

// Static files
app.use(express.static(path.join(__dirname, 'public')))
app.use('/test', express.static(path.join(__dirname)))

// Create session
app.post('/api/session', (req, res) => {
  try {
    const session = sessionManager.createSession()
    if (DEBUG_MODE) logger.info(`New session created: ${session.id}`)
    res.json({ sessionId: session.id })
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error creating session:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get session info
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessionManager.getSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({
      id: session.id,
      controllerConnected: session.controllerConnected,
      viewerConnected: session.viewerConnected,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    })
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error getting session:', error)
    res.status(500).json({ error: error.message })
  }
})

// Умный кэш для API ответов с разными TTL для разных типов данных
const apiCache = new Map()

// Адаптивный TTL на основе типа данных
const getAdaptiveTTL = (dataType) => {
  switch(dataType) {
    case 'session_info': return 1000; // информация о сессии - 1s
    case 'viewer_status': return 500;  // статус вьювера - 500ms
    case 'ball_state': return 50;      // состояние мяча - 50ms (для realtime)
    default: return 100;
  }
};

// Get ball state for viewer
app.get('/api/session/:sessionId/state', (req, res) => {
  try {
    const { sessionId } = req.params
    const cacheKey = `state_${sessionId}`

    // Проверяем кэш с адаптивным TTL
    const cached = apiCache.get(cacheKey)
    const adaptiveTTL = getAdaptiveTTL('ball_state')
    if (cached && Date.now() - cached.timestamp < adaptiveTTL) {
      // Добавляем заголовок кэша для отладки
      res.set('X-Cache-Status', 'HIT')
      return res.json(cached.data)
    }

    const session = sessionManager.getSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const responseData = {
      ...session.ballState,
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected,
      viewerScreenSize: session.viewerScreenSize
    }

    // Кэшируем ответ с timestamp
    apiCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
      type: 'ball_state'
    })

    res.set('X-Cache-Status', 'MISS')
    res.json(responseData)
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error getting ball state:', error)
    res.status(500).json({ error: error.message })
  }
})

// Controller connect
app.post('/api/session/:sessionId/controller/connect', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessionManager.getSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    sessionManager.updateBallState(sessionId, req.body)
    sessionManager.setControllerConnected(sessionId, true)

    // Инвалидируем кэш
    apiCache.delete(`state_${sessionId}`);

    res.json({ success: true, message: 'Controller connected' })
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error connecting controller:', error)
    res.status(500).json({ error: error.message })
  }
})

// Controller update
app.post('/api/session/:sessionId/controller/update', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessionManager.getSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (DEBUG_MODE) console.log(`🎮 Server: Controller update for session ${sessionId}:`, req.body)
    const result = sessionManager.updateBallState(sessionId, req.body)
    if (DEBUG_MODE) console.log(`🎮 Server: Update result:`, result, 'New state:', session.ballState)

    res.json({ success: true, message: 'Controller update processed' })
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error updating controller:', error)
    res.status(500).json({ error: error.message })
  }
})

// Viewer connect
app.post('/api/session/:sessionId/viewer/connect', (req, res) => {
  try {
    const { sessionId } = req.params
    const { screenSize } = req.body
    const session = sessionManager.getSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    sessionManager.setViewerConnected(sessionId, true)
    if (screenSize) {
      sessionManager.setViewerScreenSize(sessionId, screenSize)
      // Инвалидируем кэш при изменении размера экрана
      apiCache.delete(`state_${sessionId}`);
    }
    res.json({ success: true, message: 'Viewer connected' })
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error connecting viewer:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update viewer screen size
app.post('/api/session/:sessionId/viewer/screen-size', (req, res) => {
  try {
    const { sessionId } = req.params
    const { width, height } = req.body || {}

    const session = sessionManager.getSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (typeof width === 'number' && typeof height === 'number') {
      if (DEBUG_MODE) console.log(`📏 Вьювер обновил размер экрана: ${width}×${height} (сессия: ${sessionId})`);
      sessionManager.setViewerScreenSize(sessionId, { width, height })
      // Инвалидируем кэш
      apiCache.delete(`state_${sessionId}`);
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid screen size' })
  } catch (error) {
    if (DEBUG_MODE) logger.error('Error updating viewer screen size:', error)
    res.status(500).json({ error: error.message })
  }
})


// WebSocket-соединение
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const sessionId = url.searchParams.get('sessionId')
  const role = url.searchParams.get('role') // 'controller' or 'viewer'

  if (!sessionId || !role) {
    ws.close(1008, 'Session ID and role are required')
    return
  }

  // Устанавливаем флаг для Heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Используем новый API sessionManager для обработки подключения
  sessionManager.handleWebSocketConnection(ws, sessionId, role)

  ws.on('message', message => {
    try {
      const clientInfo = sessionManager.getClientInfo(ws);
      if (!clientInfo) {
        return;
      }
      const { sessionId, role } = clientInfo;
      const data = JSON.parse(message);

      // Оптимизированное логирование - только для heartbeat и ошибок
      if (data.type !== 'heartbeat' && DEBUG_MODE) {
        sessionManager.logger.logSession(sessionId, `[MSG IN] ${role}:${data.type}`, 'debug');
      }

      // Игнорируем сообщения-пульс от клиента (они приходят часто)
      if (data.type === 'heartbeat') {
        return;
      }

      if (role === 'controller' && data.type === 'controller_update') {
        sessionManager.updateBallState(sessionId, data.payload);
        // Логируем только значимые команды
        if (data.payload && (data.payload.reset || data.payload.dirX !== undefined || data.payload.dirY !== undefined)) {
          sessionManager.logger.logSession(sessionId, `[WS] Controller command: ${Object.keys(data.payload).join(',')}`, 'debug');
        }
      }
    } catch (error) {
      const clientInfoForError = sessionManager.getClientInfo(ws);
      const sid = clientInfoForError ? clientInfoForError.sessionId : 'unknown';
      if (DEBUG_MODE) logger.error(`WebSocket error from session ${sid}: ${error.message}`);
    }
  })

  ws.on('close', () => {
    sessionManager.handleWebSocketDisconnection(ws)
  })

  ws.on('error', (error) => {
    logger.error(`WebSocket error for session ${sessionId}: ${error.message}`)
  })
})

// Static routes for viewer
app.get('/s/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'))
})

// Static routes for controller
app.get('/c/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'session-controller.html'))
})

// Serve test files under /test/* from project /test directory (not in production build path)
app.get('/test/:file', (req, res) => {
  const file = req.params.file
  res.sendFile(path.join(__dirname, 'test', file))
})

// Start server
const PORT = config.getServerConfig().PORT
server.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`)
  logger.info('Sessions: HTTP-only architecture ready')
})

// Cleanup intervals
setInterval(() => {
  sessionManager.cleanupExpiredSessions()
}, 60000)

// Умная очистка кэша каждые 2 минуты
setInterval(() => {
  sessionManager.sessionRepository.cleanupCache()

  // Очищаем API кэш от устаревших записей с учетом типа данных
  const now = Date.now()
  const cacheStats = { total: 0, removed: 0, kept: 0 }

  for (const [key, cached] of apiCache) {
    cacheStats.total++
    const adaptiveTTL = getAdaptiveTTL(cached.type || 'default')
    const maxAge = adaptiveTTL * 3 // Удаляем записи старше 3x TTL

    if (now - cached.timestamp > maxAge) {
      apiCache.delete(key)
      cacheStats.removed++
    } else {
      cacheStats.kept++
    }
  }

  if (DEBUG_MODE && (cacheStats.removed > 0 || cacheStats.total > 10)) {
    logger.info(`Cache cleanup: ${cacheStats.removed} removed, ${cacheStats.kept} kept, total: ${cacheStats.total}`)
  }
}, 2 * 60 * 1000) // Каждые 2 минуты

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  clearInterval(heartbeatInterval); // <-- Останавливаем интервал
  server.close(() => {
    logger.info('Server stopped')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  clearInterval(heartbeatInterval); // <-- Останавливаем интервал
  server.close(() => {
    logger.info('Server stopped')
    process.exit(0)
  })
})

logger.info('BilateralBound HTTP-only server started successfully')

