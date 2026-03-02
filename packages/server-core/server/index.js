'use strict'
require('dotenv').config()
const http = require('node:http')
const config = require('./config.js')
const { logger } = require('./logger.js')
const SessionManager = require('./session/SessionManager.js')
const setupExpressApp = require('./network/expressApp.js')
const setupWebSocketServer = require('./network/webSocketServer.js')
console.log('\n\n--- SERVER STARTING (Modular Architecture) ---\n\n')
// 1. Инициализация кэша и менеджера сессий
const apiCache = new Map()
const sessionManager = new SessionManager(apiCache)
// 2. Настройка Express-приложения
const app = setupExpressApp(sessionManager, apiCache)
const server = http.createServer(app)
// 3. Настройка WebSocket-сервера
const { heartbeatInterval } = setupWebSocketServer(server, sessionManager)
// 4. Запуск сервера с обработкой ошибки EADDRINUSE
const PORT = config.getServerConfig().PORT
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Waiting before retry...`)
    setTimeout(() => {
      logger.info(`Attempting to restart server on port ${PORT}...`)
      server.close(() => {
        server.listen(PORT)
      })
    }, 3000)
  } else {
    logger.error('Server error:', err)
    process.exit(1)
  }
})
server.listen(PORT, () => {
  // Unconditional stdout so test harness detects readiness
  logger.info('Modular server architecture is ready.')
})
// 5. Настройка фоновых задач (очистка)
const cleanupIntervals = [
  setInterval(() => {
    sessionManager.cleanupExpiredSessions()
  }, 60000),
  setInterval(
    () => {
      const now = Date.now()
      let removedCount = 0
      for (const [key, cached] of apiCache) {
        // Optimized TTL: 50ms for ball_state, 500ms for others
        const adaptiveTTL = cached.type === 'ball_state' ? 50 : 500
        if (now - cached.timestamp > adaptiveTTL) {
          apiCache.delete(key)
          removedCount += 1
        }
      }

      if (removedCount > 0 && process.env.DEBUG_MODE) {
        logger.info(`API cache cleanup: ${removedCount} items removed.`)
      }
    },
    30 * 1000 // Reduced from 2 minutes to 30 seconds
  )
]
// 6. Graceful shutdown
/**
 * Graceful shutdown handler
 */
function gracefulShutdown() {
  logger.info('Shutting down gracefully...')
  clearInterval(heartbeatInterval)
  for (const interval of cleanupIntervals) {
    clearInterval(interval)
  }
  server.close(() => {
    logger.info('Server stopped.')
    process.exit(0)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
logger.info('BilateralBound modular server started successfully')
