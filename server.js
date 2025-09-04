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
        // Центрирование будет выполнено динамически при подключении вьювера
        x: 400,  // Временное значение, будет обновлено
        y: 300,  // Временное значение, будет обновлено
        vx: 0,
        vy: 0,
        speed: 40,
        radius: 40,
        colorBall: '#60a5fa',
        colorBg: '#020617',
        paused: true
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

    // Handle pause
    if (updates.pause !== undefined) {
      session.ballState.paused = true
      session.ballState.vx = 0
      session.ballState.vy = 0
      return true
    }

    // Handle reset (center the ball based on viewer screen size)
    if (updates.reset !== undefined) {
      // Use viewer screen size if available, otherwise use default world size
      const viewerSize = session.viewerScreenSize
      const worldWidth = viewerSize ? viewerSize.width : 800
      const worldHeight = viewerSize ? viewerSize.height : 600

      // Calculate center coordinates dynamically
      const centerX = worldWidth / 2
      const centerY = worldHeight / 2

      session.ballState.x = centerX
      session.ballState.y = centerY
      session.ballState.vx = 0
      session.ballState.vy = 0
      session.ballState.paused = true
      return true
    }

    // Handle resume with direction (explicit or pending)
    if (updates.resume !== undefined && (updates.dirX !== undefined || updates.dirY !== undefined || session.ballState.pendingDirection)) {
      // Use consistent speed calculation: speedPercent * maxSpeed / 100
      const speedPercent = updates.speedScalar || session.ballState.speed || 40
      const maxSpeed = 1280 // Match PhysicsEngine default maxSpeed
      const pixelsPerSecond = (speedPercent / 100) * maxSpeed

      // Use explicit direction if provided, otherwise use pending direction
      const dirX = updates.dirX !== undefined ? updates.dirX : (session.ballState.pendingDirection ? session.ballState.pendingDirection.dx : 1)
      const dirY = updates.dirY !== undefined ? updates.dirY : (session.ballState.pendingDirection ? session.ballState.pendingDirection.dy : 0)

      session.ballState.vx = dirX * pixelsPerSecond
      session.ballState.vy = dirY * pixelsPerSecond
      session.ballState.paused = false
      session.ballState.speed = speedPercent
      return true
    }

    // Handle resume without explicit direction (use default horizontal)
    if (updates.resume === true && !('dirX' in updates) && !('dirY' in updates)) {
      const speedPercent = updates.speedScalar || session.ballState.speed || 40
      const maxSpeed = 1280 // Match PhysicsEngine default maxSpeed
      const pixelsPerSecond = (speedPercent / 100) * maxSpeed

      // Определяем направление в зависимости от размера экрана вьювера
      const viewerSize = session.viewerScreenSize
      const worldWidth = viewerSize ? viewerSize.width : 800
      const centerX = worldWidth / 2

      // Если мяч слева от центра - двигаемся вправо, если справа - влево
      const dirX = session.ballState.x < centerX ? 1 : -1

      session.ballState.vx = dirX * pixelsPerSecond
      session.ballState.vy = 0
      session.ballState.paused = false
      session.ballState.speed = speedPercent
      return true
    }

    // Handle direction update without resume (just set direction for future use)
    if (updates.dirX !== undefined && updates.dirY !== undefined && updates.resume === undefined) {
      // Store direction for future resume command, but don't start movement
      // This will be used when user clicks "Start" later
      session.ballState.pendingDirection = { dx: updates.dirX, dy: updates.dirY }
      return true
    }

    // Handle other updates (only if not handled above)
    const handledUpdates = { ...updates }
    delete handledUpdates.pause
    delete handledUpdates.reset
    delete handledUpdates.resume
    delete handledUpdates.dirX
    delete handledUpdates.dirY
    delete handledUpdates.speedScalar

    // Apply remaining updates
    Object.assign(session.ballState, handledUpdates)
    return true
  },

  // Физический движок для сервера
  physicsEngine: {
    worldWidth: 800,
    worldHeight: 600,
    minSpeed: 128,
    maxSpeed: 1280,

    updateBallPosition: function(ballState, deltaTime) {
      if (ballState.paused) return

      // Обновляем позицию
      ballState.x += ballState.vx * deltaTime
      ballState.y += ballState.vy * deltaTime

      // Обрабатываем коллизии с границами
      this.handleBoundaryCollisions(ballState)
    },

    handleBoundaryCollisions: function(ballState) {
      const radius = ballState.radius || 40

      // Левая и правая границы
      if (ballState.x - radius <= 0) {
        ballState.x = radius
        ballState.vx = Math.abs(ballState.vx)
      } else if (ballState.x + radius >= this.worldWidth) {
        ballState.x = this.worldWidth - radius
        ballState.vx = -Math.abs(ballState.vx)
      }

      // Верхняя и нижняя границы
      if (ballState.y - radius <= 0) {
        ballState.y = radius
        ballState.vy = Math.abs(ballState.vy)
      } else if (ballState.y + radius >= this.worldHeight) {
        ballState.y = this.worldHeight - radius
        ballState.vy = -Math.abs(ballState.vy)
      }
    }
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

// Rate limiting (мягкий для локальной разработки)
const isLocal = process.env.NODE_ENV !== 'production'
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: isLocal ? 1000 : 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
})
app.use('/api/', limiter)

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

    sessionManager.updateBallState(sessionId, req.body)
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
      sessionManager.setViewerScreenSize(sessionId, { width, height })
      return res.json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid screen size' })
  } catch (error) {
    logger.error('Error updating viewer screen size:', error)
    res.status(500).json({ error: error.message })
  }
})

// Bounce event endpoint
app.post('/api/session/:sessionId/bounce', (req, res) => {
  try {
    const { sessionId } = req.params
    const bounceData = req.body

    const session = sessionManager.getSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // Log bounce event for debugging
    console.log(`🎯 Bounce event for session ${sessionId}:`, bounceData)

    // Here you can add bounce analytics, logging, or other processing
    // For now, just acknowledge the bounce
    res.json({ success: true, message: 'Bounce recorded' })

  } catch (error) {
    logger.error('Error processing bounce:', error)
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

// Physics update loop (60 FPS)
setInterval(() => {
  const deltaTime = 1/60 // 60 FPS
  sessionManager.sessions.forEach((session, sessionId) => {
    if (session.ballState && !session.ballState.paused) {
      sessionManager.physicsEngine.updateBallPosition(session.ballState, deltaTime)
    }
  })
}, 1000/60) // 60 FPS

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
