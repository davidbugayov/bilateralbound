const config = {
  getServerConfig: () => ({
    PORT: process.env.PORT || 3003
  }),
  getRuntimeTuning: () => ({
    DEAD_RECKON_EPS: Math.max(0, parseFloat(process.env.DEAD_RECKON_EPS || '1.5') || 1.5) // Увеличиваем до 1.5px для снижения сетевой нагрузки
  }),
  getCorsConfig: () => ({
    origins: [
      'https://davidbugayov.github.io',
      'https://bilateralbound.onrender.com',
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:8080'
    ]
  })
}

module.exports = config
