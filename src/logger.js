// Simple logger for BilateralBound Server
class Logger {
  constructor() {
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };

    this.currentLevel = process.env.LOG_LEVEL ?
      this.levels[process.env.LOG_LEVEL.toUpperCase()] || this.levels.INFO :
      this.levels.INFO;
  }

  // Format timestamp
  getTimestamp() {
    return new Date().toISOString();
  }

  // Format log message
  formatMessage(level, message, ...args) {
    const timestamp = this.getTimestamp();
    const prefix = {
      'DEBUG': '🐛',
      'INFO': 'ℹ️ ',
      'WARN': '⚠️ ',
      'ERROR': '❌'
    }[level] || '📝';

    let formattedMessage = message;
    if (args.length > 0) {
      formattedMessage = `${message} ${args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : arg
      ).join(' ')}`;
    }

    return `[${timestamp}] ${prefix} ${formattedMessage}`;
  }

  // Debug logging
  debug(message, ...args) {
    if (this.currentLevel <= this.levels.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message, ...args));
    }
  }

  // Info logging
  info(message, ...args) {
    if (this.currentLevel <= this.levels.INFO) {
      console.log(this.formatMessage('INFO', message, ...args));
    }
  }

  // Warning logging
  warn(message, ...args) {
    if (this.currentLevel <= this.levels.WARN) {
      console.warn(this.formatMessage('WARN', message, ...args));
    }
  }

  // Error logging
  error(message, ...args) {
    if (this.currentLevel <= this.levels.ERROR) {
      console.error(this.formatMessage('ERROR', message, ...args));
    }
  }

  // Log session-specific messages
  logSession(sessionId, message) {
    this.info(`[Session:${sessionId}] ${message}`);
  }

  // Log with custom level
  log(level, message, ...args) {
    const upperLevel = level.toUpperCase();
    if (this.levels[upperLevel] !== undefined) {
      this[upperLevel.toLowerCase()](message, ...args);
    } else {
      this.info(message, ...args);
    }
  }
}

// Create singleton logger instance
const logger = new Logger();

// Export logger methods for backwards compatibility
function debug(message, ...args) { return logger.debug(message, ...args); }
function info(message, ...args) { return logger.info(message, ...args); }
function warn(message, ...args) { return logger.warn(message, ...args); }
function error(message, ...args) { return logger.error(message, ...args); }
function logSession(sessionId, message) { return logger.logSession(sessionId, message); }
function log(level, message, ...args) { return logger.log(level, message, ...args); }

module.exports = {
  Logger,
  logger,
  debug,
  info,
  warn,
  error,
  logSession,
  log
};
