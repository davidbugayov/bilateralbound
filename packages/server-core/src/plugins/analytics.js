'use strict'
const AnalyticsCollector = require('../services/AnalyticsCollector')

module.exports = {
  name: 'analytics',
  version: '1.0.0',
  register(app, { config, logger }) {
    const analytics = new AnalyticsCollector(logger)
    app.use((req, res, next) => {
      analytics.recordHttpRequest()
      res.on('finish', () => {
        if (res.statusCode >= 400) {
          analytics.recordHttpError(res.statusCode, req.path)
        }
      })
      next()
    })
    return analytics
  }
}
