/* jshint boss: true, laxbreak: true, laxcomma: true, asi: true, unused: false, esversion: 11, es3: false, es5: false, eqeqeq: false, immed: false, nonbsp: true, strict: false, curly: false, forin: false, -W140: true */
/* global globalThis, console, module, process */

'use strict'
const DEBUG_MODE = process.env.LOG_LEVEL === 'DEBUG'
const logger = {
  info: msg => {
    if (DEBUG_MODE) {
      console.log(`[INFO] ${new Date().toISOString()} - ${msg}`)
    }
  },
  error: msg => {
    if (DEBUG_MODE) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
    }
  },
  logSession: (sessionId, msg) => {
    if (DEBUG_MODE) {
      console.log(`[SESSION ${sessionId}] ${msg}`)
    }
  }
}

module.exports = { logger, DEBUG_MODE }
