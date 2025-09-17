require('dotenv').config()
const http = require('http')
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

// 4. Запуск сервера
const PORT = config.getServerConfig().PORT
server.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`)
  logger.info('Modular server architecture is ready.')
})

// 5. Настройка фоновых задач (очистка)
const cleanupIntervals = []
cleanupIntervals.push(setInterval(() => {
  sessionManager.cleanupExpiredSessions()
}, 60000))

cleanupIntervals.push(setInterval(() => {
  const now = Date.now()
  let removedCount = 0
  for (const [key, cached] of apiCache) {
    const adaptiveTTL = (cached.type === 'ball_state' ? 50 : 1000) * 3 // Simplified TTL logic
    if (now - cached.timestamp > adaptiveTTL) {
      apiCache.delete(key)
      removedCount++
    }
  }
  if (removedCount > 0) {
    logger.info(`API cache cleanup: ${removedCount} items removed.`)
  }
}, 2 * 60 * 1000))

// 6. Graceful shutdown
function gracefulShutdown () {
  logger.info('Shutting down gracefully...')
  clearInterval(heartbeatInterval)
  cleanupIntervals.forEach(interval => clearInterval(interval))
  server.close(() => {
    logger.info('Server stopped.')
    process.exit(0)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

logger.info('BilateralBound modular server started successfully')
