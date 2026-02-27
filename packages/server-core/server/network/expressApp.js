'use strict'
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const os = require('node:os')
const path = require('node:path')
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
 * @param sessionManager
 */
const requireSession = (sessionManager) => (req, res, next) => {
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
// Supported languages matching locales/ directory
const SUPPORTED_LANGS = ['en', 'ru', 'de', 'es', 'fr', 'pt', 'ja', 'zh']

/**
 * Loads all locale JSON files at startup for server-side meta tag injection.
 * Returns Map<lang, parsedJSON>
 */
function loadLocales(publicPath) {
  const locales = new Map()
  for (const lang of SUPPORTED_LANGS) {
    const filePath = path.join(publicPath, 'locales', lang, 'common.json')
    try {
      locales.set(lang, JSON.parse(fs.readFileSync(filePath, 'utf8')))
    } catch (e) {
      logger.error(`Failed to load locale ${lang}: ${e.message}`)
    }
  }
  return locales
}

/**
 * Resolves nested key like "viewer.title" from locale object
 */
function getLocaleValue(locale, key) {
  return key.split('.').reduce((obj, k) => obj?.[k], locale)
}

/**
 * Detects language from request: ?lang= > session.language > domain > 'en'
 */
function detectLanguage(req, session) {
  // 1. Explicit query param
  const queryLang = req.query.lang
  if (queryLang && SUPPORTED_LANGS.includes(queryLang)) return queryLang

  // 2. Session language (set by controller)
  if (session?.language && SUPPORTED_LANGS.includes(session.language)) return session.language

  // 3. Domain-based: .ru → ru, everything else → en
  const host = req.get('host') || ''
  if (host.endsWith('.ru')) return 'ru'

  return 'en'
}

/**
 * Replaces meta tags in cached HTML with localized values.
 * Strategy: find all <meta .../> tags (multiline), check if they match
 * an entry from metaMap, and replace content="..." inside.
 */
function localizeHtml(html, lang, locale, metaMap) {
  let result = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)

  // Match each <meta ... /> or <meta ... > tag (spanning multiple lines)
  result = result.replace(/<meta\b[^>]*?\/?>/gs, (tag) => {
    for (const entry of metaMap) {
      if (entry.isTitle) continue
      // Check if this tag has the right attribute (e.g. name="description" or property="og:title")
      const attrPattern = new RegExp(`${entry.attr}=["']${entry.attrValue}["']`)
      if (!attrPattern.test(tag)) continue

      const value = getLocaleValue(locale, entry.key)
      if (value) {
        const escaped = value.replace(/"/g, '&quot;')
        return tag.replace(/content="[^"]*"/, `content="${escaped}"`)
      }
    }
    return tag
  })

  // Replace <title>...</title>
  const titleEntry = metaMap.find(m => m.isTitle)
  if (titleEntry) {
    const titleValue = getLocaleValue(locale, titleEntry.key)
    if (titleValue) {
      result = result.replace(/<title[^>]*>[^<]*<\/title>/, `<title data-i18n="${titleEntry.key}">${titleValue}</title>`)
    }
  }

  return result
}

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
  const isDev = process.env.NODE_ENV !== 'production'
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
            'wss:',
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'wss://mc.yandex.com'
          ],
          frameSrc: ['\'self\'', 'https://mc.yandex.md'],
          // Disable upgrade-insecure-requests in dev (HTTP) to allow SSE/fetch on localhost
          upgradeInsecureRequests: isDev ? null : []
        }
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  )
  // Rate limiting
  const isLocal = process.env.NODE_ENV !== 'production'
  if (!isLocal) {
    const apiLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      // Behind nginx proxy — disable X-Forwarded-For validation
      validate: { xForwardedForHeader: false }
    })
    app.use('/api/', apiLimiter)
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

  // Gzip compression for all responses (except SSE streams)
  app.use(compression({
    filter: (req, res) => {
      // Don't compress SSE streams
      if (req.path.includes('/sse/') || req.path.includes('/stream')) {
        return false
      }
      return compression.filter(req, res)
    },
    level: 6 // Balance between speed and compression ratio
  }))

  app.use(express.json())

  // Static files path
  const publicPath = path.join(__dirname, '..', '..', '..', 'web-client', 'public')

  // Cache locale files and HTML templates at startup for server-side meta tag localization
  const locales = loadLocales(publicPath)
  const cachedViewerHtml = fs.readFileSync(path.join(publicPath, 'viewer.html'), 'utf8')
  const cachedControllerHtml = fs.readFileSync(path.join(publicPath, 'session-controller.html'), 'utf8')

  // Meta tag replacement uses attribute-level search (not full tag regex)
  // to avoid greedy multiline matching issues
  const viewerMetaMap = [
    { isTitle: true, key: 'viewer.title' },
    { attr: 'name', attrValue: 'description', key: 'viewer.description' },
    { attr: 'property', attrValue: 'og:title', key: 'viewer.title' },
    { attr: 'property', attrValue: 'og:description', key: 'viewer.description' }
  ]

  const controllerMetaMap = [
    { isTitle: true, key: 'controller.meta.controllerTitle' },
    { attr: 'name', attrValue: 'description', key: 'controller.meta.controllerDescription' },
    { attr: 'property', attrValue: 'og:title', key: 'controller.meta.controllerTitle' },
    { attr: 'property', attrValue: 'og:description', key: 'controller.meta.controllerDescription' },
    { attr: 'name', attrValue: 'twitter:title', key: 'controller.meta.controllerTitle' },
    { attr: 'name', attrValue: 'twitter:description', key: 'controller.meta.controllerDescription' }
  ]

  const indexMetaMap = [
    { isTitle: true, key: 'home.pageTitle' },
    { attr: 'name', attrValue: 'description', key: 'home.metaDescription' },
    { attr: 'property', attrValue: 'og:title', key: 'home.pageTitle' },
    { attr: 'property', attrValue: 'og:description', key: 'home.metaDescription' },
    { attr: 'name', attrValue: 'twitter:title', key: 'home.pageTitle' },
    { attr: 'name', attrValue: 'twitter:description', key: 'home.metaDescription' }
  ]

  // Pre-render index.html with version at startup (avoid 2x sync fs reads per request)
  const packageJsonPath = path.join(__dirname, '..', '..', '..', '..', 'package.json')
  const appVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
  const cachedIndexHtml = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8')
    .replace(/⚡ BilateralBound v[\d.]+/, `⚡ BilateralBound v${appVersion}`)

  // Root route - serve cached index.html with injected version and localized meta tags
  app.get('/', (req, res) => {
    const lang = detectLanguage(req, null)
    const locale = locales.get(lang) || locales.get('en')
    const html = localizeHtml(cachedIndexHtml, lang, locale, indexMetaMap)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    setNoCacheHeaders(res)
    res.send(html)
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

  // SSE endpoint для стриминга состояния сессии
  app.get('/api/session/:sessionId/stream', requireSession(sessionManager), (req, res) => {
    const { sessionId } = req.params
    const role = req.query.role || 'viewer'

    // Валидация роли
    if (!['viewer', 'controller'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be viewer or controller' })
    }

    // Настраиваем SSE заголовки
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Отключаем буферизацию для nginx

    // Разрешаем CORS для SSE
    const origin = req.headers.origin
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }

    // Отправляем начальный комментарий для установки соединения
    res.write(': SSE connection established\n\n')

    // Регистрируем SSE-клиента
    const connected = sessionManager.handleSSEConnection(res, sessionId, role)
    if (!connected) {
      return res.end()
    }

    if (DEBUG_MODE) {
      logger.info(`[${req.id}] SSE stream opened for session ${sessionId}, role: ${role}`)
    }

    // Обработка закрытия соединения
    req.on('close', () => {
      sessionManager.handleSSEDisconnection(res)
      if (DEBUG_MODE) {
        logger.info(`[${req.id}] SSE stream closed for session ${sessionId}`)
      }
    })
  })

  // Static files - only serve specific paths, not root using helper function
  // Assets use ?v=version query params → safe for immutable long-term cache
  const staticDirectories = ['css', 'js', 'emdr-therapy']
  for (const dir of staticDirectories) {
    app.use(
      `/${dir}`,
      express.static(path.join(publicPath, dir), {
        etag: true,
        lastModified: true,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
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
      if (DEBUG_MODE) {
        logger.info(`[${req.id}] New session created: ${session.id}`)
      }
      res.json({ sessionId: session.id })
    } catch (error) {
      if (DEBUG_MODE) {
        logger.error(`[${req.id}] Error creating session: ${error.message}`)
      }
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
      if (DEBUG_MODE) {
        logger.error(`[${req.id}] Error reserving session: ${error.message}`)
      }
      res.status(500).json({ error: error.message, requestId: req.id })
    }
  })
  app.get('/api/session/:sessionId', requireSession(sessionManager), (req, res) => {
    const session = req.session
    res.json({
      id: session.id,
      controllerConnected: session.controllerConnected,
      viewerConnected: session.viewerConnected,
      language: session.language,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    })
  })
  app.get('/api/session/:sessionId/state', requireSession(sessionManager), (req, res) => {
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
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      sessionManager.updateBallState(sessionId, req.body)
      sessionManager.sessionRepository.update(sessionId, { controllerConnected: true })
      clearStateCache(apiCache, sessionId)

      // FIX: Уведомляем вьювера о подключении контроллера через SSE
      sessionManager.broadcastControllerConnection(sessionId, true)

      res.json({ success: true, message: 'Controller connected' })
    }
  )

  // Новый эндпоинт для обновлений от контроллера (замена WebSocket controller_update)
  app.post(
    '/api/session/:sessionId/controller/update',
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      const updates = req.body

      // console.log(`[EXPRESS] 📥 Controller update payload for ${sessionId}:`, JSON.stringify(updates))
      if (Object.keys(updates).length === 0) {
        // console.log('[EXPRESS] ⚠️  Received EMPTY payload from controller! Headers:', JSON.stringify(req.headers))
      }

      // Обновляем состояние шара
      const success = sessionManager.updateBallState(sessionId, updates)

      if (success) {
        clearStateCache(apiCache, sessionId)
        // Состояние автоматически рассылается через StateBroadcaster в updateBallState
        res.json({ success: true })
      } else {
        res.status(400).json({ error: 'Failed to update ball state' })
      }
    }
  )
  app.post(
    '/api/session/:sessionId/viewer/update',
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      // console.log(`[EXPRESS] 📥 Viewer update payload for ${sessionId}:`, JSON.stringify(req.body))
      sessionManager.updateBallState(sessionId, req.body)

      // Рассылаем обновление всем WebSocket клиентам
      sessionManager.stateBroadcaster.broadcastState(sessionId)

      res.json({ success: true, message: 'Viewer update processed' })
    }
  )

  // Новый эндпоинт для уведомления об активации звука
  app.post(
    '/api/session/:sessionId/viewer/audio-activated',
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      const session = req.session

      session.viewerAudioActivated = req.body?.activated ?? true

      // Рассылаем уведомление контроллерам через SSE и WebSocket
      sessionManager.stateBroadcaster.broadcastState(
        sessionId,
        'viewer_audio_activated',
        {
          activated: session.viewerAudioActivated,
          timestamp: Date.now()
        }
      )

      res.json({ success: true })
    }
  )
  // Bounce sync - viewer sends ball position for controller preview sync
  app.post(
    '/api/session/:sessionId/viewer/bounce',
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      const { side, x, y, dirX, dirY, timestamp } = req.body || {}

      // Broadcast bounce_sync to controllers via SSE
      sessionManager.sseManager.broadcast(
        sessionId,
        'bounce_sync',
        { side, x, y, dirX, dirY, timestamp },
        'viewer' // exclude viewer (they sent it)
      )

      res.json({ success: true })
    }
  )
  app.post(
    '/api/session/:sessionId/viewer/connect',
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      const { screenSize } = req.body
      sessionManager.sessionRepository.update(sessionId, { viewerConnected: true })
      if (screenSize) {
        sessionManager.setViewerScreenSize(sessionId, screenSize)
        clearStateCache(apiCache, sessionId)
      }

      // FIX: Уведомляем контроллер о подключении вьювера через SSE
      sessionManager.broadcastViewerConnection(sessionId, true, screenSize)

      res.json({ success: true, message: 'Viewer connected' })
    }
  )
  app.post(
    '/api/session/:sessionId/viewer/screen-size',
    requireSession(sessionManager),
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
  app.post(
    '/api/session/:sessionId/language',
    requireSession(sessionManager),
    (req, res) => {
      const { sessionId } = req.params
      const { language } = req.body || {}

      if (typeof language !== 'string' || !/^[a-z]{2,5}$/.test(language)) {
        return res.status(400).json({ error: 'Invalid language code', requestId: req.id })
      }

      const success = sessionManager.setLanguage(sessionId, language)
      if (!success) {
        return res.status(500).json({ error: 'Failed to set language', requestId: req.id })
      }

      return res.json({ success: true, language })
    }
  )
  // Static routes with server-side meta tag localization
  app.get('/s/:sessionId', (req, res) => {
    const session = sessionManager.getSession(req.params.sessionId)
    const lang = detectLanguage(req, session)
    const locale = locales.get(lang) || locales.get('en')
    const html = localizeHtml(cachedViewerHtml, lang, locale, viewerMetaMap)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    setNoCacheHeaders(res)
    res.send(html)
  })
  app.get('/c/:sessionId', (req, res) => {
    const session = sessionManager.getSession(req.params.sessionId)
    const lang = detectLanguage(req, session)
    const locale = locales.get(lang) || locales.get('en')
    const html = localizeHtml(cachedControllerHtml, lang, locale, controllerMetaMap)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    setNoCacheHeaders(res)
    res.send(html)
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
    if (DEBUG_MODE) {
      logger.error(`[${req.id}] ${status} ${message}`)
    }
    res.status(status).json({ error: message, requestId: req.id })
  })
  return app
}

module.exports = setupExpressApp
