'use strict'
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const express = require('express')
const os = require('node:os')
const { v4: uuidv4 } = require('uuid')

function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces()
  const result = {}
  for (const key of Object.keys(interfaces)) {
    const iface = interfaces[key].find(
      (alias) => alias.family === 'IPv4' && !alias.internal
    )
    if (iface) {
      result[key] = iface.address
    }
  }
  return result
}

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4()
  res.setHeader('X-Request-Id', req.id)
  next()
}

function requireSession(sessionService) {
  return (req, res, next) => {
    const { sessionId } = req.params
    const session = sessionService.getSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found', requestId: req.id })
    }
    req.session = session
    next()
  }
}

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
}

function clearStateCache(apiCache, sessionId) {
  apiCache.delete(`state_${sessionId}`)
}

function setupMiddleware(app, config) {
  const networkInterfaces = getNetworkInterfaces()

  // Request ID
  app.use(requestId)

  // Network interface IP (from expressApp L246-251)
  app.use((req, res, next) => {
    const interfaceIP = networkInterfaces[Object.keys(networkInterfaces)[0]]
    req.interfaceIP = interfaceIP || '127.0.1'
    next()
  })

  // Helmet (from expressApp L253-288)
  const isDev = config.isDev
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          styleSrcAttr: ["'self'", "'unsafe-inline'"],
          styleSrcElem: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'self'", "'unsafe-inline'"],
          scriptSrcElem: [
            "'self'",
            "'unsafe-inline'",
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'https://yastatic.net'
          ],
          imgSrc: ["'self'", 'data:', 'https:', 'https://*.mc.yandex.ru'],
          connectSrc: [
            "'self'",
            'wss:',
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'wss://mc.yandex.com'
          ],
          frameSrc: ["'self'", 'https://mc.yandex.md'],
          upgradeInsecureRequests: isDev ? null : []
        }
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  )

  // Rate limiting (non-dev only, from expressApp L290-302)
  if (!isDev) {
    const apiLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      validate: { xForwardedForHeader: false }
    })
    app.use('/api/', apiLimiter)
  }

  // CORS (from expressApp L304-319)
  app.use(
    cors({
      origin: config.cors.origins,
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

  // Compression
  app.use(compression({ level: 6 }))

  // JSON parser
  app.use(express.json())
}

module.exports = { setupMiddleware, requireSession, setNoCacheHeaders, clearStateCache }
