/* jshint boss: true, laxbreak: true, laxcomma: true, asi: true, unused: false, esversion: 11, es3: false, es5: false, eqeqeq: false, immed: false, nonbsp: true, strict: false, curly: false, forin: false, -W140: true */
/* global globalThis, console, module, process */

"use strict";
const config = {
  getServerConfig: () => ({
    PORT: process.env.NODE_PORT || process.env.PORT || 3000
  }),
  getRuntimeTuning: () => ({
    DEAD_RECKON_EPS: Math.max(0, Number.parseFloat(process.env.DEAD_RECKON_EPS || '1.5') || 1.5) // Увеличиваем до 1.5px для снижения сетевой нагрузки
  }),
  getCorsConfig: () => ({
    origins: [
      'https://davidbugayov.github.io',
      'https://bilateralbound.onrender.com',
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:8080',
      'https://emdrbilateral.ru',
      'https://emdrbilateral.online'
    ]
  })
};

module.exports = config;
