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

console.log(`\n\n--- SERVER RESTARTED WITH LATEST CODE (v.CacheFix) ---\n\n`);

// Simple config inline
const config = {
  getServerConfig: () => ({
    PORT: process.env.PORT || 3000
  }),
  getRuntimeTuning: () => ({
    DEAD_RECKON_EPS: Math.max(0, parseFloat(process.env.DEAD_RECKON_EPS || '0.5') || 0.5)
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
    this.sessionCache = new Map() // Кэш для часто запрашиваемых сессий
    this.cacheExpiration = 30000 // 30 секунд
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
      mainLoop: null, // Единый цикл для физики и рассылки
      lastStateUpdate: 0, // Добавляем для отслеживания последнего обновления состояния
      ...sessionData
    }

    this.sessions.set(session.id, session)
    return session
  }

  findById(sessionId) {
    // Проверяем кэш сначала
    const cached = this.sessionCache.get(sessionId);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
      return cached.session;
    }

    // Ищем в основном хранилище
    const session = this.sessions.get(sessionId) || null;

    // Кэшируем результат (даже если null)
    if (session) {
      this.sessionCache.set(sessionId, {
        session: session,
        timestamp: Date.now()
      });
    }

    return session;
  }

  update(sessionId, updates) {
    const session = this.findById(sessionId)
    if (!session) return false

    Object.assign(session, updates)
    session.lastActivity = Date.now()

    // Инвалидируем кэш
    this.sessionCache.delete(sessionId)

    return true
  }

  updateBallState(sessionId, ballUpdates) {
    const session = this.findById(sessionId)
    if (!session) return false

    Object.assign(session.ballState, ballUpdates)

    // Инвалидируем кэш
    this.sessionCache.delete(sessionId)

    return true
  }

  delete(sessionId) {
    this.sessionCache.delete(sessionId); // Очищаем кэш
    return this.sessions.delete(sessionId)
  }

  // Очистка устаревшего кэша для оптимизации памяти
  cleanupCache() {
    const now = Date.now();
    for (const [sessionId, cached] of this.sessionCache) {
      if (now - cached.timestamp > this.cacheExpiration) {
        this.sessionCache.delete(sessionId);
      }
    }
  }

  getAll() {
    return Array.from(this.sessions.values())
  }

  cleanupExpired(maxAge = 60 * 60 * 1000) { // 1 hour
    const now = Date.now()
    const expiredIds = []

    for (const [id, session] of this.sessions) {
      // Удаляем сессии старше maxAge ИЛИ неактивные более 30 минут
      const inactiveTime = now - (session.lastActivity || session.createdAt);
      if (now - session.createdAt > maxAge || inactiveTime > 30 * 60 * 1000) {
        expiredIds.push(id)
      }
    }

    expiredIds.forEach(id => this.delete(id))

    // Также очищаем устаревший кэш
    this.cleanupCache();

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
      payload: payload || { ...session.ballState, viewerScreenSize: session.viewerScreenSize }
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

  broadcastLog(sessionId, logMessage) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) return false;

    const message = JSON.stringify({
      type: 'server_log',
      payload: logMessage,
    });

    for (const { client } of this.webSocketManager.getClients(sessionId)) {
      if (this._isClientReady(client)) {
        try {
          client.send(message);
        } catch (error) {
          // Не логируем ошибку отправки лога, чтобы избежать бесконечного цикла
        }
      }
    }
  }

  broadcastInitialState(sessionId, client, currentState) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) return false;

    // Используем переданное состояние, если оно есть, иначе берем из сессии
    const ballState = currentState || session.ballState;

    const initialState = {
      type: 'initial_state',
      payload: {
        ...ballState,
        viewerConnected: session.viewerConnected,
        controllerConnected: session.controllerConnected,
        viewerScreenSize: session.viewerScreenSize
      }
    };

    if (this._isClientReady(client)) {
      try {
        client.send(JSON.stringify(initialState));
        this.logger.logSession(sessionId, 'Sent initial_state to client');
        return true;
      } catch (error) {
        this.logger.error(`Error sending initial state: ${error.message}`);
        return false;
      }
    }
    return false;
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
    this.logger = {
      ...logger,
      logSession: (sessionId, msg, level = 'info') => {
        // Оптимизированное логирование - только для отладки
        if (DEBUG_MODE && level === 'debug') console.log(`[SESSION:${sessionId}] ${msg}`);
        // Убираем автоматическую рассылку логов клиентам для снижения нагрузки
        // this.stateBroadcaster.broadcastLog(sessionId, msg);
      }
    };
  }

  // Делегирование методов к соответствующим классам
  createSession(ballState = {}) {
    const session = this.sessionRepository.create({ ballState })
    
    // Создаем и привязываем движок физики к сессии
    session.physicsEngine = new PhysicsEngine({
        ballRadius: session.ballState.radius || 20, // Используем радиус из состояния или 20 по умолчанию
        maxSpeed: 1000 // Соответствует оригинальной логике сервера (100% speed = 1000px/sec)
    });
    // Синхронизируем начальное состояние из движка, но сохраняем paused: true
    const engineState = session.physicsEngine.getState();
    Object.assign(session.ballState, engineState);
    session.ballState.paused = true; // Принудительно устанавливаем паузу для новой сессии
    session.physicsEngine.setPaused(true); // Также устанавливаем паузу в движке физики

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

    // === ВАЛИДАЦИЯ И САНИТИЗАЦИЯ ВХОДНЫХ ДАННЫХ ===
    this.logger.logSession(sessionId, `[VALIDATION] Processing updates: ${JSON.stringify(updates)}`);
    const validatedUpdates = {};
    if (updates) {
        // speed: number, 0-100
        if (typeof updates.speed === 'number' && updates.speed >= 0 && updates.speed <= 100 && !isNaN(updates.speed)) {
            validatedUpdates.speed = updates.speed;
        }
        // radius: number, 1-1000
        if (typeof updates.radius === 'number' && updates.radius > 0 && updates.radius <= 1000 && !isNaN(updates.radius)) {
            validatedUpdates.radius = updates.radius;
        }
        // paused: boolean
        if (typeof updates.paused === 'boolean') {
            validatedUpdates.paused = updates.paused;
        }
        // dirX, dirY: number, -1 to 1
        if (typeof updates.dirX === 'number' && Math.abs(updates.dirX) <= 1 && !isNaN(updates.dirX)) {
            validatedUpdates.dirX = updates.dirX;
        }
        if (typeof updates.dirY === 'number' && Math.abs(updates.dirY) <= 1 && !isNaN(updates.dirY)) {
            validatedUpdates.dirY = updates.dirY;
        }
        // colorBall, colorBg: string, hex format
        if (typeof updates.colorBall === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.colorBall)) {
            validatedUpdates.colorBall = updates.colorBall;
        }
        if (typeof updates.colorBg === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.colorBg)) {
            validatedUpdates.colorBg = updates.colorBg;
        }
        // reset: boolean
        if (updates.reset === true) {
            validatedUpdates.reset = true;
        }
        // resume: boolean (для обратной совместимости)
        if (updates.resume === true) {
            validatedUpdates.paused = false;
        }
        // pause: boolean (для обратной совместимости)
        if (updates.pause === true) {
            validatedUpdates.paused = true;
        }
    }

    this.logger.logSession(sessionId, `[VALIDATION] Validated updates: ${JSON.stringify(validatedUpdates)}`);

    // Если нет валидных полей для обновления, выходим
    if (Object.keys(validatedUpdates).length === 0) {
        this.logger.logSession(sessionId, `[VALIDATION] No valid fields in update, ignoring`);
        return false;
    }
    // ============================================

    session.lastStateUpdate = now;
    session.lastActivity = now; // Обновляем время активности

    // Применяем ТОЛЬКО валидированные обновления через движок физики
    if (session.physicsEngine) {
        session.physicsEngine.applyCommand(validatedUpdates);

        // Синхронизируем состояние сессии с состоянием движка
        Object.assign(session.ballState, session.physicsEngine.getState());

        // Оптимизированное логирование - только для отладки
        this.logger.logSession(sessionId, `[STATE SYNC] Applied ${Object.keys(validatedUpdates).length} updates`, 'debug');

    } else {
        // Fallback, которого не должно быть
        this.sessionRepository.updateBallState(sessionId, validatedUpdates);
    }

    // Пересчитываем режим производительности после изменения состояния
    this._schedulePhysicsUpdate(sessionId);

    // Инвалидируем кэш API
    apiCache.delete(`state_${sessionId}`);

    this.stateBroadcaster.broadcastState(sessionId);
    return true;
  }

  // WebSocket management
  handleWebSocketConnection(ws, sessionId, role) {
    if (!this.webSocketManager.addClient(sessionId, ws, role)) {
      ws.close(1011, 'Session not found')
      return
    }

    const session = this.sessionRepository.findById(sessionId)
    if (session) {
      session.lastActivity = Date.now()
      this._schedulePhysicsUpdate(sessionId)
      
      // Отправляем initial_state только ВЬЮВЕРУ.
      // Контроллер получит initial_state после установки размеров экрана вьювера.
      if (role === 'viewer') {
        this.stateBroadcaster.broadcastInitialState(sessionId, ws, session.ballState)
      } else {
        // пометим сокет как ожидающий начального состояния
        try { ws.initialStateSent = false } catch (e) {}
        this.logger.logSession(sessionId, `Controller connected, deferring initial_state until viewer screen size is set.`);
      }
    }

    this.stateBroadcaster.broadcastViewerStatus(sessionId)
  }

  handleWebSocketDisconnection(ws) {
    const sessionId = this.webSocketManager.removeClient(ws)
    if (sessionId) {
      // Пересчитываем режим производительности после отключения клиента
      this._schedulePhysicsUpdate(sessionId)
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
        this.logger.logSession(sessionId, `[SET_SIZE] Received screenSize: ${screenSize.width}x${screenSize.height}`);
        this.logger.logSession(sessionId, `[SET_SIZE] Before: engine.options.worldWidth=${session.physicsEngine.options.worldWidth}, _worldSizeSet=${session.physicsEngine._worldSizeSet}`);
        
        session.physicsEngine.setWorldSize(screenSize.width, screenSize.height);
        
        this.logger.logSession(sessionId, `[SET_SIZE] After: engine.options.worldWidth=${session.physicsEngine.options.worldWidth}, _worldSizeSet=${session.physicsEngine._worldSizeSet}`);

        session.physicsEngine.reset(); // Центрирует мяч и останавливает его
        // НЕ устанавливаем принудительно paused: true - оставляем текущее состояние игры
        // session.physicsEngine.setPaused(true);
        // session.physicsEngine.setVelocity(0, 0);
        
        Object.assign(session.ballState, session.physicsEngine.getState()); // Синхронизируем состояние
        this.logger.logSession(sessionId, `Centered ball via PhysicsEngine for screen size ${screenSize.width}×${screenSize.height}`);
    } else {
       // Старая логика на случай, если что-то пошло не так
       session.ballState.x = screenSize.width / 2;
       session.ballState.y = screenSize.height / 2;
       session.ballState.vx = 0;
       session.ballState.vy = 0;
       // НЕ устанавливаем принудительно paused: true
       // session.ballState.paused = true;
    }

    // Отправляем обновленное, центрированное состояние всем клиентам
    this.stateBroadcaster.broadcastState(sessionId)
    this.logger.logSession(sessionId, `Broadcasted state update after centering`)

    // Проверяем, есть ли "ожидающие" контроллеры, и отправляем им initial_state
    const clients = this.webSocketManager.getClients(sessionId);
    const finalState = session.physicsEngine ? session.physicsEngine.getState() : session.ballState; // Получаем самое свежее состояние
    for (const { client, info } of clients) {
        if (info.role === 'controller' && !client.initialStateSent) {
            this.stateBroadcaster.broadcastInitialState(sessionId, client, finalState);
            client.initialStateSent = true;
        }
    }

    return true
  }

  startPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    this._schedulePhysicsUpdate(sessionId)
    this.logger.logSession(sessionId, 'Physics manager initialized', 'debug')
  }

  _schedulePhysicsUpdate(sessionId) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) return;

    // Централизованное управление: всегда останавливаем цикл перед принятием нового решения.
    if (session.mainLoop) {
      clearInterval(session.mainLoop);
      session.mainLoop = null;
    }

    const hasActiveClients = session.controllerConnected || session.viewerConnected;
    const isBallMoving = session.ballState && !session.ballState.paused;

    // Цикл нужен, только если мяч движется И есть клиенты.
    if (hasActiveClients && isBallMoving) {
      session.mainLoop = setInterval(() => {
        const currentSession = this.sessionRepository.findById(sessionId);
        // Внутренняя проверка безопасности: если условия изменились, останавливаем цикл изнутри.
        if (!currentSession || !currentSession.physicsEngine || currentSession.ballState.paused || !(currentSession.controllerConnected || currentSession.viewerConnected)) {
          if (session.mainLoop) {
             clearInterval(session.mainLoop);
             session.mainLoop = null;
             this.logger.logSession(sessionId, 'Main loop self-terminated due to state change.');
          }
          return;
        }

        // 1. Обсчет физики
        const deltaTime = this.physicsInterval / 1000;
        currentSession.physicsEngine.update(deltaTime);
        Object.assign(currentSession.ballState, currentSession.physicsEngine.getState());

        // 2. Dead-reckoning suppression: шлём только если сдвиг заметен
        const prevSent = currentSession._lastBroadcast || { x: NaN, y: NaN };
        const dx = Math.abs((currentSession.ballState.x || 0) - (prevSent.x || 0));
        const dy = Math.abs((currentSession.ballState.y || 0) - (prevSent.y || 0));
        const moved = dx > config.getRuntimeTuning().DEAD_RECKON_EPS || dy > config.getRuntimeTuning().DEAD_RECKON_EPS; // порог чувствительности в px
        if (moved) {
          this.stateBroadcaster.broadcastState(sessionId);
          currentSession._lastBroadcast = { x: currentSession.ballState.x, y: currentSession.ballState.y };
        }
      }, this.physicsInterval);

      this.logger.logSession(sessionId, `Main loop started at ${Math.round(1000/this.physicsInterval)} FPS.`);
    } else {
      this.logger.logSession(sessionId, `Main loop not started (isBallMoving: ${isBallMoving}, hasActiveClients: ${hasActiveClients}).`);
    }
  }

  stopPhysics(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (session && session.mainLoop) {
        clearInterval(session.mainLoop)
        session.mainLoop = null
    }
  }

  cleanupExpiredSessions() {
    // При очистке сессии, также останавливаем ее циклы
    const expiredIds = this.sessionRepository.cleanupExpired()
    if (expiredIds.length > 0) {
      this.logger.info(`Cleaned up ${expiredIds.length} expired sessions.`);
      expiredIds.forEach(id => this.stopPhysics(id));
    }
    return expiredIds.length;
  }

  // Legacy compatibility methods
  getSessionCount() {
    return this.sessionRepository.getAll().length
  }

  getClientInfo(ws) {
    for (const session of this.sessionRepository.getAll()) {
      if (session.clients.has(ws)) {
        const clientInfo = session.clients.get(ws);
        return { sessionId: clientInfo.sessionId, role: clientInfo.role };
      }
    }
    return null;
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

// Простой кэш для API ответов
const apiCache = new Map()
const API_CACHE_TTL = 100 // 100ms - очень короткий TTL для realtime данных

// Get ball state for viewer
app.get('/api/session/:sessionId/state', (req, res) => {
  try {
    const { sessionId } = req.params
    const cacheKey = `state_${sessionId}`

    // Проверяем кэш
    const cached = apiCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
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

    // Кэшируем ответ
    apiCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    })

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

// Очистка кэша каждые 5 минут
setInterval(() => {
  sessionManager.sessionRepository.cleanupCache()

  // Очищаем API кэш от устаревших записей
  const now = Date.now()
  for (const [key, cached] of apiCache) {
    if (now - cached.timestamp > API_CACHE_TTL * 2) {
      apiCache.delete(key)
    }
  }
}, 5 * 60 * 1000)

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
