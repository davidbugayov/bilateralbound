// Simple HTTP-only Server for BilateralBound
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const http = require('http')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

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

// Simple session manager inline
const sessionManager = {
  sessions: new Map(),

  createSession: function () {
    const session = {
      id: uuidv4().substring(0, 6),
      ballState: {
        // Начальные команды для клиента
        speed: 40,
        radius: 20,
        colorBall: '#60a5fa',
        colorBg: '#020617',
        paused: true,
        // dirX, dirY будут добавлены контроллером
      },
      controllerConnected: false,
      viewerConnected: false,
      viewerScreenSize: null, // Будет установлен при подключении вьювера
      createdAt: Date.now(),
      lastActivity: Date.now()
    }
    this.sessions.set(session.id, session)
    return session
  },

  getSession: function (sessionId) { return this.sessions.get(sessionId) },

  updateBallState: function (sessionId, updates) {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    // Сервер просто хранит командное состояние. Физика на клиенте.
    Object.assign(session.ballState, updates)
    return true
  },

  setControllerConnected: function (sessionId, connected) {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.controllerConnected = connected
    }
  },

  setViewerConnected: function (sessionId, connected) {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.viewerConnected = connected
    }
  },

  setViewerScreenSize: function (sessionId, screenSize) {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.viewerScreenSize = screenSize

    // Центрируем мяч при установке размера экрана вьювера
    if (session.ballState) {
      session.ballState.x = screenSize.width / 2
      session.ballState.y = screenSize.height / 2
      console.log(`🎯 Мяч центрирован при установке размера вьювера: ${screenSize.width}×${screenSize.height} -> (${session.ballState.x}, ${session.ballState.y})`)
    }

    return true
  },

  getSessionCount: function () { return this.sessions.size },

  cleanupExpiredSessions: function () {
    // Simple cleanup - remove sessions older than 1 hour
    const now = Date.now()
    const oneHour = 60 * 60 * 1000

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt > oneHour) {
        this.sessions.delete(sessionId)
      }
    }
  }
}

// Simple Express server without complex class structure
const app = express()
const server = http.createServer(app)

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

// Static routes for viewer
app.get('/s/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'))
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
  server.close(() => {
    logger.info('Server stopped')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  server.close(() => {
    logger.info('Server stopped')
    process.exit(0)
  })
})

logger.info('BilateralBound HTTP-only server started successfully')
