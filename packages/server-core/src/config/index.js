'use strict'

module.exports = {
  server: {
    PORT: process.env.NODE_PORT || process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development'
  },
  runtime: {
    CLIENT_SIM_ONLY:
      String(process.env.CLIENT_SIM_ONLY || 'true').toLowerCase() === 'true',
    DEAD_RECKON_EPS: Math.max(
      0,
      Number.parseFloat(process.env.DEAD_RECKON_EPS || '1.5') || 1.5
    )
  },
  cors: {
    origins: [
      'https://emdrbilateral.ru',
      'https://emdrbilateral.online',
      'http://localhost:3000',
      'http://localhost:3006',
      'http://localhost:5000',
      'http://localhost:8080',
      'https://davidbugayov.github.io',
      'https://bilateralbound.onrender.com'
    ]
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  isDev: (process.env.NODE_ENV || 'development') !== 'production',

  // Telegram Stars subscription (https://core.telegram.org/bots/payments#stars)
  subscription: {
    ENABLED:
      String(process.env.SUBSCRIPTION_ENABLED || 'true').toLowerCase() === 'true',
    STARS_BOT_TOKEN: process.env.STARS_BOT_TOKEN || '',
    STARS_PROVIDER_TOKEN: process.env.STARS_PROVIDER_TOKEN || '',
    PRICE_STARS: Number.parseInt(process.env.PRICE_STARS || '75', 10), // 75 Stars (~100 RUB)
    SUBSCRIPTION_DURATION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
    TEST_MODE:
      String(process.env.SUBSCRIPTION_TEST_MODE || '').toLowerCase() === 'true',
    BOT_USERNAME: process.env.BOT_USERNAME || 'emdrbilateral_bot',
    WEBHOOK_URL: process.env.WEBHOOK_URL || '',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || ''
  }
}
