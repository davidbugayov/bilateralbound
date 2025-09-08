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

// Simple config inline
const config = {
  getServerConfig: () => ({
    PORT: process.env.PORT || 3000
  }),
  getCorsConfig: () => ({
    origins: [
      'https://davidbugayov.github.io',
      'https://bilateralbound.onrender.com',
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:8080'
    ]
  })
}

// Simple logger inline
const DEBUG_MODE = process.env.LOG_LEVEL === 'DEBUG'
const logger = {
  info: (msg) => { if (DEBUG_MODE) console.log(`[INFO] ${new Date().toISOString()} - ${msg}`) },
  error: (msg) => { if (DEBUG_MODE) console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`) },
  logSession: (sessionId, msg) => { if (DEBUG_MODE) console.log(`[SESSION:${sessionId}] ${msg}`) }
}

// ===== МОДУЛЬНАЯ АРХИТЕКТУРА СЕРВЕРА =====

// Интерфейс для управления данными сессий
class SessionRepository {
  constructor() {
    this.sessions = new Map()
  }

  create(sessionData = {}) {
    const session = {
      id: uuidv4().substring(0, 6),
      ballState: {
        speed: 40,
        radius: 20,
        colorBall: '#60a5fa',
        colorBg: '#020617',
        paused: true,
        ...sessionData.ballState
      },
      controllerConnected: false,
      viewerConnected: false,
      viewerScreenSize: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      clients: new Map(),
      physicsLoop: null,
      lastStateUpdate: 0, // Добавляем для отслеживания последнего обновления состояния
      ...sessionData
    }

    this.sessions.set(session.id, session)
    return session
  }

  findById(sessionId) {
    return this.sessions.get(sessionId) || null
  }

  update(sessionId, updates) {
    const session = this.findById(sessionId)
    if (!session) return false

    Object.assign(session, updates)
    session.lastActivity = Date.now()
    return true
  }

  updateBallState(sessionId, ballUpdates) {
    const session = this.findById(sessionId)
    if (!session) return false

    Object.assign(session.ballState, ballUpdates)
    return true
  }

  delete(sessionId) {
    return this.sessions.delete(sessionId)
  }

  getAll() {
    return Array.from(this.sessions.values())
  }

  cleanupExpired(maxAge = 60 * 60 * 1000) { // 1 hour
    const now = Date.now()
    const expiredIds = []

    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > maxAge) {
        expiredIds.push(id)
      }
    }

    expiredIds.forEach(id => this.delete(id))
    return expiredIds.length
  }
}

// Интерфейс для управления WebSocket соединениями
class WebSocketManager {
  constructor(sessionRepository) {
    this.sessionRepository = sessionRepository
    this.logger = logger
  }

  addClient(sessionId, ws, role) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    session.clients.set(ws, {
      role,
      connectedAt: Date.now(),
      sessionId
    })

    // Обновляем статус подключения
    if (role === 'controller') {
      session.controllerConnected = true
    } else if (role === 'viewer') {
      session.viewerConnected = true
    }

    this.logger.logSession(sessionId, `${role} connected via WebSocket`)
    return true
  }

  removeClient(ws) {
    for (const session of this.sessionRepository.getAll()) {
      if (session.clients.has(ws)) {
        const clientInfo = session.clients.get(ws)
        session.clients.delete(ws)

        // Проверяем, остались ли клиенты этой роли
        this._updateConnectionStatus(session, clientInfo.role)
        this.logger.logSession(session.id, `${clientInfo.role} disconnected via WebSocket`)
        return true
      }
    }
    return false
  }

  _updateConnectionStatus(session, disconnectedRole) {
    let hasController = false
    let hasViewer = false

    for (const [client, info] of session.clients) {
      if (info.role === 'controller') hasController = true
      if (info.role === 'viewer') hasViewer = true
    }

    if (disconnectedRole === 'controller') {
      session.controllerConnected = hasController
    } else if (disconnectedRole === 'viewer') {
      session.viewerConnected = hasViewer
    }
  }

  getClients(sessionId, role = null) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return []

    if (role) {
      return Array.from(session.clients.entries())
        .filter(([client, info]) => info.role === role)
        .map(([client, info]) => ({ client, info }))
    }

    return Array.from(session.clients.entries())
      .map(([client, info]) => ({ client, info }))
  }
}

// Интерфейс для рассылки состояния клиентам
class StateBroadcaster {
  constructor(sessionRepository, webSocketManager) {
    this.sessionRepository = sessionRepository
    this.webSocketManager = webSocketManager
    this.logger = logger
  }

  broadcastState(sessionId, stateType = 'state_update', payload = null) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    const message = JSON.stringify({
      type: stateType,
      payload: payload || session.ballState
    })

    let sentCount = 0
    for (const { client } of this.webSocketManager.getClients(sessionId)) {
      if (this._isClientReady(client)) {
        try {
          client.send(message)
          sentCount++
        } catch (error) {
          this.logger.error(`Error broadcasting to client: ${error.message}`)
        }
      }
    }

    if (sentCount > 0) {
      this.logger.logSession(sessionId, `Broadcasted ${stateType} to ${sentCount} clients`)
    }

    return sentCount > 0
  }

  broadcastViewerStatus(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    return this.broadcastState(sessionId, 'viewer_status', {
      connected: session.viewerConnected,
      screenSize: session.viewerScreenSize
    })
  }

  broadcastInitialState(sessionId, client) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    const initialState = {
      type: 'initial_state',
      payload: {
        ...session.ballState,
        viewerConnected: session.viewerConnected,
        controllerConnected: session.controllerConnected,
        viewerScreenSize: session.viewerScreenSize
      }
    }

    if (this._isClientReady(client)) {
      try {
        client.send(JSON.stringify(initialState))
        this.logger.logSession(sessionId, 'Sent initial_state to client')
        return true
      } catch (error) {
        this.logger.error(`Error sending initial state: ${error.message}`)
        return false
      }
    }

    return false
  }

  _isClientReady(client) {
    return client && client.readyState === 1 // WebSocket.OPEN
  }
}

// Основной оркестратор сессий
class SessionManager {
  constructor() {
    this.sessionRepository = new SessionRepository()
    this.webSocketManager = new WebSocketManager(this.sessionRepository)
    this.stateBroadcaster = new StateBroadcaster(this.sessionRepository, this.webSocketManager)
    this.physicsInterval = 1000 / 60 // ~60 FPS
    this.logger = logger
  }

  // Делегирование методов к соответствующим классам
  createSession(ballState = {}) {
    const session = this.sessionRepository.create({ ballState })
    
    // Создаем и привязываем движок физики к сессии
    session.physicsEngine = new PhysicsEngine({
        ballRadius: session.ballState.radius,
        maxSpeed: 1000 // Соответствует оригинальной логике сервера (100% speed = 1000px/sec)
    });
    // Синхронизируем начальное состояние из движка
    Object.assign(session.ballState, session.physicsEngine.getState());

    this.startPhysics(session.id)
    return session
  }

  getSession(sessionId) {
    return this.sessionRepository.findById(sessionId)
  }

  updateBallState(sessionId, updates) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
        return false;
    }

    // Throttling: Ограничиваем частоту обновлений
    const now = Date.now();
    const lastUpdate = session.lastStateUpdate || 0;
    const throttleDelay = 50; // мс

    const isDirectionChange = updates && (updates.dirX !== undefined || updates.dirY !== undefined)
    const isPauseToggle = updates && (updates.paused !== undefined || updates.resume === true)
    if (now - lastUpdate < throttleDelay && !updates.reset && !isDirectionChange && !isPauseToggle) { // Сброс/направление/пауза не ограничиваем
        return false;
    }

    session.lastStateUpdate = now;

    // Нормализуем команды: поддерживаем resume=true как paused=false
    if (updates && updates.resume === true && updates.paused === undefined) {
        updates = { ...updates, paused: false };
    }

    // Применяем обновления через движок физики
    if (session.physicsEngine) {
        session.physicsEngine.applyCommand(updates);
        // Если игра не на паузе — сразу пересчитаем скорость из направления/скорости
        if (session.physicsEngine.state && session.physicsEngine.state.paused === false) {
            session.physicsEngine.calculateTargetVelocity();
            // Синхронизируем мгновенно ball.vx/vy с targetVx/targetVy
            session.physicsEngine.ball.vx = session.physicsEngine.state.targetVx;
            session.physicsEngine.ball.vy = session.physicsEngine.state.targetVy;
            // Немедленно продвинем физику на один шаг ~0.2s, чтобы было заметно движение
            const dt = 0.2; // 200ms
            session.physicsEngine.update(dt);
        }
        // Синхронизируем ballState с состоянием движка
        Object.assign(session.ballState, session.physicsEngine.getState());
    } else {
        // Fallback, которого не должно быть
        this.sessionRepository.updateBallState(sessionId, updates);
    }
    
    this.stateBroadcaster.broadcastState(sessionId);
    return true;
  }

  // WebSocket management
  handleWebSocketConnection(ws, sessionId, role) {
    if (!this.webSocketManager.addClient(sessionId, ws, role)) {
      ws.close(1011, 'Session not found')
      return
    }

    // Отправляем начальное состояние
    this.stateBroadcaster.broadcastInitialState(sessionId, ws)

    // Отправляем статус viewer всем клиентам
    this.stateBroadcaster.broadcastViewerStatus(sessionId)
  }

  handleWebSocketDisconnection(ws) {
    const sessionId = this.webSocketManager.removeClient(ws)
    if (sessionId) {
      this.stateBroadcaster.broadcastViewerStatus(sessionId)
    }
  }

  // Legacy methods for backward compatibility
  broadcastState(sessionId) {
    return this.stateBroadcaster.broadcastState(sessionId)
  }

  setControllerConnected(sessionId, connected) {
    return this.sessionRepository.update(sessionId, { controllerConnected: connected })
  }

  setViewerConnected(sessionId, connected) {
    return this.sessionRepository.update(sessionId, { viewerConnected: connected })
  }

  setViewerScreenSize(sessionId, screenSize) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false

    session.viewerScreenSize = screenSize

    // Используем движок физики для центрирования
    if (session.physicsEngine) {
        session.physicsEngine.setWorldSize(screenSize.width, screenSize.height);
        session.physicsEngine.reset(); // Центрирует мяч и останавливает его
        Object.assign(session.ballState, session.physicsEngine.getState()); // Синхронизируем состояние
        this.logger.logSession(sessionId, `Centered ball via PhysicsEngine for screen size ${screenSize.width}×${screenSize.height}`);
    } else {
       // Старая логика на случай, если что-то пошло не так
       session.ballState.x = screenSize.width / 2;
       session.ballState.y = screenSize.height / 2;
       session.ballState.vx = 0;
       session.ballState.vy = 0;
       session.ballState.paused = true;
    }

    // Отправляем обновленное, центрированное состояние всем клиентам
    this.stateBroadcaster.broadcastState(sessionId)
    this.logger.logSession(sessionId, `Broadcasted state update after centering`)

    return true
  }

  startPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session || session.physicsLoop) return

    session.physicsLoop = setInterval(() => {
      this.updatePhysics(sessionId)
      this.stateBroadcaster.broadcastState(sessionId)
    }, this.physicsInterval)
  }

  stopPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (session && session.physicsLoop) {
      clearInterval(session.physicsLoop)
      session.physicsLoop = null
    }
  }

  updatePhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session || !session.physicsEngine || session.ballState.paused || !session.viewerScreenSize) {
      return
    }

    const engine = session.physicsEngine;
    const deltaTime = this.physicsInterval / 1000;

    // Движок уже настроен через controller_update. Просто обновляем его.
    // Он сам обработает движение и отскоки.
    engine.update(deltaTime);

    // Защитное ограничение: гарантируем, что шар внутри мира и отражаем направление при выходе
    const state = engine.getState();
    const radius = state.radius || engine.options.ballRadius;
    const worldWidth = engine.options.worldWidth;
    const worldHeight = engine.options.worldHeight;
    const maxX = worldWidth - radius;
    const maxY = worldHeight - radius;
    let dirChanged = false;

    this.logger.logSession(sessionId, `[PHYSICS] Before clamp: x=${state.x.toFixed(2)}, y=${state.y.toFixed(2)}, dirX=${engine.state.lastDirection.x?.toFixed(2)}, dirY=${engine.state.lastDirection.y?.toFixed(2)}`);

    if (state.x < radius) {
      engine.ball.x = radius;
      engine.state.lastDirection.x = Math.abs(engine.state.lastDirection.x || 1);
      dirChanged = true;
    } else if (state.x > maxX) {
      engine.ball.x = maxX;
      engine.state.lastDirection.x = -Math.abs(engine.state.lastDirection.x || 1);
      dirChanged = true;
    }
    if (state.y < radius) {
      engine.ball.y = radius;
      engine.state.lastDirection.y = Math.abs(engine.state.lastDirection.y || 1);
      dirChanged = true;
    } else if (state.y > maxY) {
      engine.ball.y = maxY;
      engine.state.lastDirection.y = -Math.abs(engine.state.lastDirection.y || 1);
      dirChanged = true;
    }

    if (dirChanged) {
      // Пересчитать скорость после смены направления, чтобы отражение было мгновенным
      const speedPercent = engine.ball.speed / 100;
      const pixelsPerSecond = speedPercent * (engine.options.maxSpeed || 1000);
      engine.ball.vx = engine.state.lastDirection.x * pixelsPerSecond;
      engine.ball.vy = engine.state.lastDirection.y * pixelsPerSecond;
      this.logger.logSession(sessionId, `[PHYSICS] Bounce detected! New direction: dirX=${engine.state.lastDirection.x.toFixed(2)}, dirY=${engine.state.lastDirection.y.toFixed(2)}`);
    }

    // Синхронизируем авторитетное состояние сессии с состоянием движка
    Object.assign(session.ballState, engine.getState());
    this.logger.logSession(sessionId, `[PHYSICS] After clamp: x=${session.ballState.x.toFixed(2)}, y=${session.ballState.y.toFixed(2)}`);
  }

  cleanupExpiredSessions() {
    return this.sessionRepository.cleanupExpired()
  }

  // Legacy compatibility methods
  getSessionCount() {
    return this.sessionRepository.getAll().length
  }
}

// Создаем глобальный экземпляр для обратной совместимости
const sessionManager = new SessionManager()


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
    res.json({ sessionId: session.id })
  } catch (error) {
    logger.error('Error creating session:', error)
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
    logger.error('Error getting session:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get ball state for viewer
app.get('/api/session/:sessionId/state', (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessionManager.getSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({
      ...session.ballState,
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected,
      viewerScreenSize: session.viewerScreenSize
    })
  } catch (error) {
    logger.error('Error getting ball state:', error)
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
    res.json({ success: true, message: 'Controller connected' })
  } catch (error) {
    logger.error('Error connecting controller:', error)
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

    console.log(`🎮 Server: Controller update for session ${sessionId}:`, req.body)
    const result = sessionManager.updateBallState(sessionId, req.body)
    console.log(`🎮 Server: Update result:`, result, 'New state:', session.ballState)
    res.json({ success: true, message: 'Controller update processed' })
  } catch (error) {
    logger.error('Error updating controller:', error)
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
    }
    res.json({ success: true, message: 'Viewer connected' })
  } catch (error) {
    logger.error('Error connecting viewer:', error)
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
      console.log(`📏 Вьювер обновил размер экрана: ${width}×${height} (сессия: ${sessionId})`);
      sessionManager.setViewerScreenSize(sessionId, { width, height })
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid screen size' })
  } catch (error) {
    logger.error('Error updating viewer screen size:', error)
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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message)

      // Игнорируем сообщения-пульс от клиента
      if (data.type === 'heartbeat') {
        return;
      }

      if (role === 'controller' && data.type === 'controller_update') {
        // Команда сброса теперь полностью обрабатывается движком через applyCommand
        sessionManager.updateBallState(sessionId, data.payload)
        logger.logSession(sessionId, `Controller updated state: ${JSON.stringify(data.payload)}`)
      }
    } catch (error) {
      logger.error(`Error parsing message from session ${sessionId}: ${error.message}`)
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
