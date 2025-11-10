'use strict'
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const fs = require('node:fs')
const config = require('../config.js')
const { DEBUG_MODE, logger } = require('../logger.js')
// Определяем доступные сетевые интерфейсы
/**
 * Получает доступные сетевые интерфейсы
 * @returns {Object} Объект с интерфейсами и их IP адресами
 */
const getNetworkInterfaces = () => {
  const interfaces = os.networkInterfaces()
  const result = {}

  for (const key of Object.keys(interfaces)) {
    const iface = interfaces[key].find(alias => alias.family === 'IPv4' && !alias.internal)
    if (iface) {
      result[key] = iface.address
    }
  }
  return result
}
// Проверка доступности порта
/**
 * Проверяет доступность порта
 * @param {number} port - Порт для проверки
 * @returns {Promise<boolean>} Promise, разрешающийся в true если порт доступен
 */
const checkPortAvailability = port => {
  return new Promise((resolve, reject) => {
    const tester = net
      .createServer()
      .once('error', err => {
        if (err.code === 'EADDRINUSE') {
          resolve(false)
        } else {
          reject(err)
        }
      })
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close()
      })
      .listen(port)
  })
}

/**
 * Устанавливает заголовки для отключения кэширования
 * @param {Object} res - Express response объект
 */
const setNoCacheHeaders = res => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

/**
 * Middleware для проверки существования сессии
 * @param {Object} req - Express request объект
 * @param {Object} res - Express response объект
 * @param {Function} next - Express next функция
 */
const requireSession = (sessionManager, apiCache) => (req, res, next) => {
  const { sessionId } = req.params
  const session = sessionManager.getSession(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Session not found', requestId: req.id })
  }
  req.session = session
  next()
}

/**
 * Очищает кэш состояния сессии
 * @param {Map} apiCache - Кэш API
 * @param {string} sessionId - ID сессии
 */
const clearStateCache = (apiCache, sessionId) => {
  apiCache.delete(`state_${sessionId}`)
}

/**
 * Настраивает Express приложение
 * @param {Object} sessionManager - Менеджер сессий
 * @param {Map} apiCache - Кэш API
 * @returns {Object} Express приложение
 */
function setupExpressApp(sessionManager, apiCache) {
  const networkInterfaces = getNetworkInterfaces()
  const app = express()
  // Request ID middleware for traceability
  app.use(async (req, res, next) => {
    try {
      const { v4: uuidv4 } = await import('uuid')
      req.id = req.headers['x-request-id'] || uuidv4()
      res.setHeader('X-Request-Id', req.id)
      next()
    } catch (error) {
      next(error)
    }
  })
  // Улучшенная обработка безопасности с учетом сетевых интерфейсов
  app.use((req, res, next) => {
    const interfaceIP = networkInterfaces[Object.keys(networkInterfaces)[0]]

    req.interfaceIP = interfaceIP || '127.0.1'
    next()
  })
  // Расширенная конфигурация Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ['\'self\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\''],
          styleSrcAttr: ['\'self\'', '\'unsafe-inline\''],
          styleSrcElem: ['\'self\'', '\'unsafe-inline\''],
          scriptSrc: ['\'self\'', '\'unsafe-inline\''],
          scriptSrcAttr: ['\'self\'', '\'unsafe-inline\''],
          scriptSrcElem: [
            '\'self\'',
            '\'unsafe-inline\'',
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'https://yastatic.net'
          ],
          imgSrc: ['\'self\'', 'data:', 'https:', 'https://*.mc.yandex.ru'],
          connectSrc: [
            '\'self\'',
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'wss://mc.yandex.com'
          ],
          frameSrc: ['\'self\'', 'https://mc.yandex.md']
        }
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  )
  // Добавляем middleware для проверки доступности порта при старте
  app.use(async (req, res, next) => {
    try {
      const portAvailable = await checkPortAvailability(config.port)
      if (!portAvailable) {
        logger.warn(`[${req.id}] Port ${config.port} is not available during request`)
      }

      next()
    } catch (error) {
      next(error)
    }
  })
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
      keyGenerator: req =>
        req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown'
    })
    app.use('/api/', limiter)
  }
  // CORS middleware
  app.use(
    cors({
      origin: config.getCorsConfig().origins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Origin',
        'Accept',
        'X-Request-Id'
      ],
      credentials: true,
      optionsSuccessStatus: 200
    })
  )
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Origin, Accept, X-Request-Id'
    )
    res.header('Access-Control-Allow-Credentials', 'true')
    if (req.method === 'OPTIONS') res.sendStatus(200)
    else next()
  })
  app.use(express.json())

  // Static files path
  const publicPath = path.join(__dirname, '..', '..', '..', 'web-client', 'public')

  // Root route - serve index.html with injected version (MUST come before static middleware)
  app.get('/', (req, res) => {
    try {
      // Read package.json to get current version
      const packageJsonPath = path.join(__dirname, '..', '..', '..', '..', 'package.json')
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      const version = packageJson.version

      // Read index.html
      const indexPath = path.join(publicPath, 'index.html')
      let html = fs.readFileSync(indexPath, 'utf8')

      // Replace hardcoded version with dynamic version
      html = html.replace(/⚡ BilateralBound v[\d.]+/, `⚡ BilateralBound v${version}`)

      // Set headers and send modified HTML
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      setNoCacheHeaders(res)
      res.send(html)
    } catch (error) {
      logger.error(`Error serving index.html: ${error.message}`)
      // Fallback to static file if something goes wrong
      res.sendFile(path.join(publicPath, 'index.html'))
    }
  })

  // Routes
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      sessions: sessionManager.getSessionCount(),
      uptime: process.uptime()
    })
  })

  // Static files - only serve specific paths, not root using helper function
  const staticDirectories = ['css', 'js', 'emdr-therapy']
  for (const dir of staticDirectories) {
    app.use(
      `/${dir}`,
      express.static(path.join(publicPath, dir), {
        etag: false,
        lastModified: false,
        setHeaders: setNoCacheHeaders
      })
    )
  }

  // Catch-all for other static files (but not index.html)
  app.use((req, res, next) => {
    // Skip if it's a root request or index.html request
    if (
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/emdr-therapy/')
    ) {
      return next()
    }

    // For other static files, serve them
    express.static(publicPath, {
      index: false,
      etag: false,
      lastModified: false,
      setHeaders: setNoCacheHeaders
    })(req, res, next)
  })
  app.use('/test', express.static(path.join(__dirname, '..', '..')))

  app.get('/rss.xml', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const rss = `
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>BilateralBound - EMDR Терапия</title>
  <link>${baseUrl}</link>
  <description>Инновационная платформа для EMDR терапии с биодинамической стимуляцией</description>
  <language>ru</language>
  <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
  <item>
    <title>BilateralBound - EMDR терапия для пациентов</title>
    <link>${baseUrl}/</link>
    <description>Профессиональная платформа EMDR терапии с биодинамической стимуляцией для лечения ПТСР, тревоги и травм. Движение шарика создает двустороннюю стимуляцию мозга для переработки травматических воспоминаний.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/</guid>
  </item>
  <item>
    <title>EMDR Терапия для Супружеских Пар | Bilateral Stimulation | Психолог Онлайн</title>
    <link>${baseUrl}/emdr-therapy/</link>
    <description>Профессиональная EMDR терапия для супружеских пар с использованием билатеральной стимуляции. Эффективное лечение травм, ПТСР, конфликтов в отношениях. Онлайн-сессии с сертифицированным психологом.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/emdr-therapy/</guid>
  </item>
</channel>
</rss>
    `.trim()
    res.type('application/xml').send(rss)
  })
  app.post('/api/session', async (req, res) => {
    try {
      const session = await sessionManager.createSession()
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
  app.get('/api/session/:sessionId', requireSession(sessionManager, apiCache), (req, res) => {
    const session = req.session
    res.json({
      id: session.id,
      controllerConnected: session.controllerConnected,
      viewerConnected: session.viewerConnected,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    })
  })
  app.get('/api/session/:sessionId/state', requireSession(sessionManager, apiCache), (req, res) => {
    const { sessionId } = req.params
    const session = req.session
    const cacheKey = `state_${sessionId}`
    const cached = apiCache.get(cacheKey)
    const adaptiveTTL = 50
    if (cached && Date.now() - cached.timestamp < adaptiveTTL) {
      res.set('X-Cache-Status', 'HIT')
      return res.json(cached.data)
    }

    const responseData = {
      ...session.ballState,
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected,
      viewerScreenSize: session.viewerScreenSize
    }
    // Нормализуем направление vx/vy кратковременно после смены размера/первого коннекта для стабильности API
    if (session.normalizeDirectionUntilTs && Date.now() < session.normalizeDirectionUntilTs) {
      const clamp01 = v => Math.max(-1, Math.min(1, typeof v === 'number' ? v : 0))
      responseData.vx = clamp01(responseData.vx)
      responseData.vy = clamp01(responseData.vy)
    }

    apiCache.set(cacheKey, { data: responseData, timestamp: Date.now(), type: 'ball_state' })
    res.set('X-Cache-Status', 'MISS')
    res.json(responseData)
  })
  app.post(
    '/api/session/:sessionId/controller/connect',
    requireSession(sessionManager, apiCache),
    (req, res) => {
      const { sessionId } = req.params
      sessionManager.updateBallState(sessionId, req.body)
      sessionManager.sessionRepository.update(sessionId, { controllerConnected: true })
      clearStateCache(apiCache, sessionId)
      res.json({ success: true, message: 'Controller connected' })
    }
  )
  app.post(
    '/api/session/:sessionId/controller/update',
    requireSession(sessionManager, apiCache),
    (req, res) => {
      const { sessionId } = req.params
      sessionManager.updateBallState(sessionId, req.body)
      res.json({ success: true, message: 'Controller update processed' })
    }
  )
  app.post(
    '/api/session/:sessionId/viewer/connect',
    requireSession(sessionManager, apiCache),
    (req, res) => {
      const { sessionId } = req.params
      const { screenSize } = req.body
      sessionManager.sessionRepository.update(sessionId, { viewerConnected: true })
      if (screenSize) {
        sessionManager.setViewerScreenSize(sessionId, screenSize)
        clearStateCache(apiCache, sessionId)
      }

      res.json({ success: true, message: 'Viewer connected' })
    }
  )
  app.post(
    '/api/session/:sessionId/viewer/screen-size',
    requireSession(sessionManager, apiCache),
    (req, res) => {
      const { sessionId } = req.params
      const { width, height } = req.body || {}

      if (typeof width === 'number' && typeof height === 'number') {
        sessionManager.setViewerScreenSize(sessionId, { width, height })
        clearStateCache(apiCache, sessionId)
        return res.json({ success: true })
      }

      return res.status(400).json({ error: 'Invalid screen size', requestId: req.id })
    }
  )
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
