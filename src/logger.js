// Logger module - centralized logging with different levels
class Logger {
  constructor() {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };

    this.currentLevel = process.env.LOG_LEVEL ?
      this.levels[process.env.LOG_LEVEL.toUpperCase()] || this.levels.INFO :
      this.levels.INFO;
  }

  shouldLog(level) {
    return level <= this.currentLevel;
  }

  error(message, ...args) {
    if (this.shouldLog(this.levels.ERROR)) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (this.shouldLog(this.levels.WARN)) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.shouldLog(this.levels.INFO)) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    if (this.shouldLog(this.levels.DEBUG)) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }

  logSession(sessionId, message, ...args) {
    this.info(`[SESSION:${sessionId}] ${message}`, ...args);
  }


}

module.exports = new Logger();


