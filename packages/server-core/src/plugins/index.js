'use strict';
const loggerPlugin = require('./logger');
const analyticsPlugin = require('./analytics');

function registerPlugins(app, config) {
  const logger = loggerPlugin.register(app, { config });
  const analytics = analyticsPlugin.register(app, { config, logger });
  logger.info(
    { plugins: [loggerPlugin.name, analyticsPlugin.name] },
    'Plugins registered',
  );
  return { logger, analytics };
}

module.exports = { registerPlugins };
