const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const config = require('../config.js')
const { DEBUG_MODE, logger } = require('../logger.js')

function setupExpressApp (sessionManager, apiCache) {
  const app = express()

  // Request ID middleware for traceability
  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuidv4()
    res.setHeader('X-Request-Id', req.id)
    next()
  })

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        styleSrcAttr: ['\'self\'', '\'unsafe-inline\''],
        styleSrcElem: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrcAttr: ['\'self\'', '\'unsafe-inline\''],
        scriptSrcElem: ['\'self\'', '\'unsafe-inline\'', 'https://mc.yandex.ru'],
        imgSrc: ['\'self\'', 'data:', 'https:', 'https://*.mc.yandex.ru'],
        connectSrc: ['\'self\'', 'https://mc.yandex.ru', 'https://mc.yandex.com'],
        frameSrc: ['\'self\'', 'https://mc.yandex.md']
      }
    }
  }))

  // Rate limiting
  const isLocal = process.env.NODE_ENV !== 'production'
  if (!isLocal) {
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      trustProxy: true,
      keyGenerator: (req) => req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'
    })
    app.use('/api/', limiter)
  }

  // CORS middleware
  app.use(cors({
    origin: config.getCorsConfig().origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept', 'X-Request-Id'],
    credentials: true,
    optionsSuccessStatus: 200
  }))

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Origin, Accept, X-Request-Id')
    res.header('Access-Control-Allow-Credentials', 'true')
    if (req.method === 'OPTIONS') res.sendStatus(200)
    else next()
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
  const publicPath = path.join(__dirname, '..', '..', 'public')
  app.use(express.static(publicPath, {
    etag: false,
    lastModified: false,
    setHeaders: (res, path, stat) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }))
  app.use('/test', express.static(path.join(__dirname, '..', '..')))

  // Root route - serve index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'))
  })

  app.post('/api/session', (req, res) => {
    try {
      const session = sessionManager.createSession()
      if (DEBUG_MODE) logger.info(`[${req.id}] New session created: ${session.id}`)
      res.json({ sessionId: session.id })
    } catch (error) {
      if (DEBUG_MODE) logger.error(`[${req.id}] Error creating session: ${error.message}`)
      res.status(500).json({ error: error.message, requestId: req.id })
    }
  })

  // Резервирование/создание постоянной ссылки (идемпотентно)
  app.post('/api/session/:sessionId/reserve', (req, res) => {
    const { sessionId } = req.params
    try {
      const session = sessionManager.findOrCreateSession(sessionId)
      if (!session) {
        return res.status(400).json({ error: 'Invalid session id', requestId: req.id })
      }
      const baseUrl = `${req.protocol}://${req.get('host')}`
      res.json({
        sessionId: session.id,
        viewerUrl: `${baseUrl}/s/${session.id}`,
        controllerUrl: `${baseUrl}/c/${session.id}`
      })
    } catch (error) {
      if (DEBUG_MODE) logger.error(`[${req.id}] Error reserving session: ${error.message}`)
      res.status(500).json({ error: error.message, requestId: req.id })
    }
  })

  app.get('/api/session/:sessionId', (req, res) => {
    const { sessionId } = req.params
    const session = sessionManager.getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found', requestId: req.id })
    res.json({
      id: session.id,
      controllerConnected: session.controllerConnected,
      viewerConnected: session.viewerConnected,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    })
  })

  app.get('/api/session/:sessionId/state', (req, res) => {
    const { sessionId } = req.params
    const cacheKey = `state_${sessionId}`
    const cached = apiCache.get(cacheKey)
    const adaptiveTTL = 50
    if (cached && Date.now() - cached.timestamp < adaptiveTTL) {
      res.set('X-Cache-Status', 'HIT')
      return res.json(cached.data)
    }

    const session = sessionManager.getSession(sessionId)
    if (!session) return res.status(404).json({ error: 'Session not found', requestId: req.id })

    const responseData = { ...session.ballState, viewerConnected: session.viewerConnected, controllerConnected: session.controllerConnected, viewerScreenSize: session.viewerScreenSize }
    // Нормализуем направление vx/vy кратковременно после смены размера/первого коннекта для стабильности API
    if (session.normalizeDirectionUntilTs && Date.now() < session.normalizeDirectionUntilTs) {
      const clamp01 = (v) => Math.max(-1, Math.min(1, typeof v === 'number' ? v : 0))
      responseData.vx = clamp01(responseData.vx)
      responseData.vy = clamp01(responseData.vy)
    }
    apiCache.set(cacheKey, { data: responseData, timestamp: Date.now(), type: 'ball_state' })
    res.set('X-Cache-Status', 'MISS')
    res.json(responseData)
  })

  app.post('/api/session/:sessionId/controller/connect', (req, res) => {
    const { sessionId } = req.params
    if (!sessionManager.getSession(sessionId)) return res.status(404).json({ error: 'Session not found', requestId: req.id })
    sessionManager.updateBallState(sessionId, req.body)
    sessionManager.sessionRepository.update(sessionId, { controllerConnected: true })
    apiCache.delete(`state_${sessionId}`)
    res.json({ success: true, message: 'Controller connected' })
  })

  app.post('/api/session/:sessionId/controller/update', (req, res) => {
    const { sessionId } = req.params
    if (!sessionManager.getSession(sessionId)) return res.status(404).json({ error: 'Session not found', requestId: req.id })
    sessionManager.updateBallState(sessionId, req.body)
    res.json({ success: true, message: 'Controller update processed' })
  })

  app.post('/api/session/:sessionId/viewer/connect', (req, res) => {
    const { sessionId } = req.params
    const { screenSize } = req.body
    if (!sessionManager.getSession(sessionId)) return res.status(404).json({ error: 'Session not found', requestId: req.id })
    sessionManager.sessionRepository.update(sessionId, { viewerConnected: true })
    if (screenSize) {
      sessionManager.setViewerScreenSize(sessionId, screenSize)
      apiCache.delete(`state_${sessionId}`)
    }
    res.json({ success: true, message: 'Viewer connected' })
  })

  app.post('/api/session/:sessionId/viewer/screen-size', (req, res) => {
    const { sessionId } = req.params
    const { width, height } = req.body || {}
    if (!sessionManager.getSession(sessionId)) return res.status(404).json({ error: 'Session not found', requestId: req.id })
    if (typeof width === 'number' && typeof height === 'number') {
      sessionManager.setViewerScreenSize(sessionId, { width, height })
      apiCache.delete(`state_${sessionId}`)
      return res.json({ success: true })
    }
    return res.status(400).json({ error: 'Invalid screen size', requestId: req.id })
  })

  // Static routes
  app.get('/s/:sessionId', (req, res) => {
    res.sendFile(path.join(publicPath, 'viewer.html'))
  })

  app.get('/c/:sessionId', (req, res) => {
    res.sendFile(path.join(publicPath, 'session-controller.html'))
  })

  app.get('/test/:file', (req, res) => {
    const file = req.params.file
    // Валидация имени файла для предотвращения path traversal атак
    if (!file || typeof file !== 'string') {
      return res.status(400).json({ error: 'Invalid file parameter', requestId: req.id })
    }

    // Проверяем на опасные символы и паттерны
    if (file.includes('..') || file.includes('/') || file.includes('\\') || file.includes('\0')) {
      return res.status(400).json({ error: 'Invalid file name', requestId: req.id })
    }

    // Разрешаем только безопасные расширения файлов
    const allowedExtensions = ['.html', '.css', '.js', '.json', '.txt', '.md']
    const fileExt = path.extname(file).toLowerCase()
    if (!allowedExtensions.includes(fileExt)) {
      return res.status(400).json({ error: 'File type not allowed', requestId: req.id })
    }

    // Строим безопасный путь
    const safePath = path.resolve(__dirname, '..', '..', 'test', file)

    // Проверяем, что файл действительно находится в директории test
    const testDir = path.resolve(__dirname, '..', '..', 'test')
    if (!safePath.startsWith(testDir)) {
      return res.status(403).json({ error: 'Access denied', requestId: req.id })
    }

    res.sendFile(safePath)
  })

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.path, requestId: req.id })
  })

  // Centralized error handler
  app.use((err, req, res) => {
    const status = err.status || 500
    const message = err.message || 'Internal Server Error'
    if (DEBUG_MODE) logger.error(`[${req.id}] ${status} ${message}`)
    res.status(status).json({ error: message, requestId: req.id })
  })

  return app
}

module.exports = setupExpressApp
