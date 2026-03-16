'use strict'
const loggerPlugin = require('./logger')

function registerPlugins(app, config) {
  const logger = loggerPlugin.register(app, { config })
  logger.info({ plugins: [loggerPlugin.name] }, 'Plugins registered')
  return { logger }
}

module.exports = { registerPlugins }
