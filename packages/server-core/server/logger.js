const DEBUG_MODE = process.env.LOG_LEVEL === 'DEBUG'
const logger = {
  info: msg => {
    if (DEBUG_MODE) console.log(`[INFO] ${new Date().toISOString()} - ${msg}`)
  },
  error: msg => {
    if (DEBUG_MODE) console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
  },
  logSession: (sessionId, msg) => {
    if (DEBUG_MODE) console.log(`[SESSION ${sessionId}] ${msg}`)
  }
}

module.exports = { logger, DEBUG_MODE }
