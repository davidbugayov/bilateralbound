'use strict'
const pino = require('pino')

module.exports = {
  name: 'logger',
  version: '1.0.0',
  register(app, { config }) {
    const logger = pino({
      level: config.logLevel,
      transport: config.isDev
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
    })

    logger.logSession = (sessionId, msg) => {
      logger.debug({ sessionId }, msg)
    }

    // HTTP request logging middleware
    app.use((req, res, next) => {
      const start = Date.now()
      res.on('finish', () => {
        logger.info(
          {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            ms: Date.now() - start
          },
          'HTTP request'
        )
      })
      next()
    })

    return logger
  }
}
