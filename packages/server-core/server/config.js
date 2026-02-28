'use strict';
const config = {
  getServerConfig: () => ({
    PORT: process.env.NODE_PORT || process.env.PORT || 3000,
  }),
  getRuntimeTuning: () => ({
    DEAD_RECKON_EPS: Math.max(
      0,
      Number.parseFloat(process.env.DEAD_RECKON_EPS || '1.5') || 1.5,
    ),
    CLIENT_SIM_ONLY:
      String(process.env.CLIENT_SIM_ONLY || 'true').toLowerCase() === 'true',
  }),
  getCorsConfig: () => ({
    origins: [
      'https://davidbugayov.github.io',
      'https://bilateralbound.onrender.com',
      'http://localhost:3000',
      'http://localhost:3006',
      'http://localhost:5000',
      'http://localhost:8080',
      'https://emdrbilateral.ru',
      'https://emdrbilateral.online',
    ],
  }),
};

module.exports = config;
