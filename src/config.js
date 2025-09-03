// Configuration for BilateralBound Server
const config = {
  server: {
    PORT: process.env.PORT || 3000,
    HOST: process.env.HOST || 'localhost',
    NODE_ENV: process.env.NODE_ENV || 'development'
  },

  cors: {
    origins: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      // Add your production domains here
      ...(process.env.NODE_ENV === 'production' ? [
        'https://your-production-domain.com'
      ] : [])
    ]
  },

  sessions: {
    MAX_DURATION_HOURS: 1, // 1 hour max session duration
    INACTIVE_TIMEOUT_MINUTES: 10, // 10 minutes of inactivity
    NO_VIEWER_TIMEOUT_MINUTES: 5, // 5 minutes without viewer
    CLEANUP_INTERVAL_MINUTES: 1 // Clean up every minute
  },

  physics: {
    DEFAULT_WORLD_WIDTH: 800,
    DEFAULT_WORLD_HEIGHT: 600,
    DEFAULT_BALL_RADIUS: 20,
    DEFAULT_SPEED: 500,
    MAX_SPEED: 1280,
    MIN_SPEED: 250
  }
};

// Get server configuration
function getServerConfig() {
  return config.server;
}

// Get CORS configuration
function getCorsConfig() {
  return config.cors;
}

// Get sessions configuration
function getSessionsConfig() {
  return config.sessions;
}

// Get physics configuration
function getPhysicsConfig() {
  return config.physics;
}

// Get all configuration
function getAllConfig() {
  return config;
}

module.exports = {
  getServerConfig,
  getCorsConfig,
  getSessionsConfig,
  getPhysicsConfig,
  getAllConfig
};
