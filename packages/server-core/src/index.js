'use strict'
const http = require('node:http')
const express = require('express')
const config = require('./config')
const { registerPlugins } = require('./plugins')
const SessionRepository = require('./repositories/SessionRepository')
const WebSocketManager = require('./network/WebSocketManager')
const BroadcastService = require('./services/BroadcastService')
const PhysicsService = require('./services/PhysicsService')
const SessionService = require('./services/SessionService')
const LocalizationService = require('./services/LocalizationService')
const SubscriptionService = require('./services/SubscriptionService')
const TelegramBotService = require('./services/TelegramBotService')
const {
  setupMiddleware,
  requireSession,
  setNoCacheHeaders,
  csrfProtection
} = require('./network/middleware')
const { setupWebSocketServer } = require('./network/webSocketServer')
const { registerSessionRoutes } = require('./controllers/sessionController')
const { registerViewerRoutes } = require('./controllers/viewerController')
const { registerSeoRoutes } = require('./controllers/seoController')
const {
  registerStaticRoutes
} = require('./controllers/static_routes_controller')
const { registerSubscriptionRoutes, autoRenewInterval } = require('./controllers/subscriptionController')

// 1. App + Plugins
const app = express()
const { logger, analytics } = registerPlugins(app, config)

// 2. Repositories
const sessionRepository = new SessionRepository()

// 3. Network
const webSocketManager = new WebSocketManager(sessionRepository, logger)

// 4. Services
const apiCache = new Map()
const broadcastService = new BroadcastService(
  sessionRepository,
  webSocketManager,
  {
    clientSimulationOnly: config.runtime.CLIENT_SIM_ONLY,
    logger
  }
)
const physicsService = new PhysicsService(
  sessionRepository,
  broadcastService,
  webSocketManager,
  {
    clientSimulationOnly: config.runtime.CLIENT_SIM_ONLY,
    logger,
    analytics
  }
)
const subscriptionService = new SubscriptionService({
  logger,
  durationMs: config.subscription.SUBSCRIPTION_DURATION_MS,
  testMode: config.subscription.TEST_MODE
})

// Telegram bot — only initialised if a token is provided via env
const telegramBot = config.subscription.STARS_BOT_TOKEN
  ? new TelegramBotService({
      token: config.subscription.STARS_BOT_TOKEN,
      providerToken: config.subscription.STARS_PROVIDER_TOKEN || '',
      webhookUrl: config.subscription.WEBHOOK_URL || '',
      botUsername: config.subscription.BOT_USERNAME,
      logger
    })
  : null
if (telegramBot) {
  telegramBot.setWebhook()
  telegramBot.setMyCommands()
}
const sessionService = new SessionService(
  sessionRepository,
  physicsService,
  broadcastService,
  webSocketManager,
  { logger, analytics, apiCache, subscriptionService }
)
const localizationService = new LocalizationService(config, logger)

// 5. HTTP Middleware + Routes
const boundRequireSession = requireSession(sessionService)
const mw = { requireSession: boundRequireSession, logger }
setupMiddleware(app, config, logger)

// CSRF protection on all API routes
app.use('/api/', csrfProtection)

// Analytics tracking middleware (HTTP request counting + error tracking)
app.use((req, res, next) => {
  analytics.recordHttpRequest()
  res.on('finish', () => {
    if (res.statusCode >= 400)
      analytics.recordHttpError(res.statusCode, req.path)
  })
  next()
})

registerSessionRoutes(app, sessionService, apiCache, analytics, mw, subscriptionService)
registerSubscriptionRoutes(app, subscriptionService, {
  logger,
  telegramBot,
  priceStars: config.subscription.PRICE_STARS,
  testMode: config.subscription.TEST_MODE
})

registerViewerRoutes(
  app,
  sessionService,
  webSocketManager,
  broadcastService,
  mw
)
registerSeoRoutes(app)
registerStaticRoutes(app, sessionService, localizationService, {
  setNoCacheHeaders,
  logger
})

// 6. Server + WebSocket
const server = http.createServer(app)
const { heartbeatInterval } = setupWebSocketServer(
  server,
  sessionService,
  webSocketManager,
  broadcastService,
  analytics,
  logger
)

// 7. Start
const PORT = config.server.PORT
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      { port: PORT },
      `Port ${PORT} is already in use. Waiting before retry...`
    )
    setTimeout(() => {
      logger.info(
        { port: PORT },
        `Attempting to restart server on port ${PORT}...`
      )
      server.close(() => {
        server.listen(PORT)
      })
    }, 3000)
  } else {
    logger.error({ err }, 'Server error')
    process.exit(1)
  }
})
server.listen(PORT, () => {
  logger.info('Modular server architecture is ready.')
})

// 8. Cleanup intervals
const cleanupIntervals = [
  setInterval(() => {
    sessionService.cleanupExpiredSessions()
  }, 60000),
  setInterval(() => {
    const now = Date.now()
    let removedCount = 0
    for (const [key, cached] of apiCache) {
      const adaptiveTTL = cached.type === 'ball_state' ? 50 : 500
      if (now - cached.timestamp > adaptiveTTL) {
        apiCache.delete(key)
        removedCount += 1
      }
    }
    if (removedCount > 0) {
      logger.debug({ removedCount }, 'API cache cleanup')
    }
  }, 30 * 1000),
  // Auto-renew checker interval (may be null if no Telegram bot configured)
  ...(autoRenewInterval ? [autoRenewInterval] : [])
]

// 9. Graceful shutdown
function gracefulShutdown() {
  logger.info('Shutting down gracefully...')
  clearInterval(heartbeatInterval)
  for (const interval of cleanupIntervals) {
    clearInterval(interval)
  }
  // Stop broadcast service delta cleanup interval and clear cache
  broadcastService.destroy()
  setTimeout(() => process.exit(0), 3000).unref()
  server.closeAllConnections()
  server.close(() => {
    logger.info('Server stopped.')
    process.exit(0)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
logger.info('BilateralBound modular server started successfully')
