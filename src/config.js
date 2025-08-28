// Configuration module - centralized configuration management
class Config {
  constructor() {
    this.server = {
      PORT: process.env.PORT || 3000,
      MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS) || 20,
      MAX_VIEWERS_PER_SESSION: parseInt(process.env.MAX_VIEWERS_PER_SESSION) || 3,
      TICK_RATE: parseInt(process.env.TICK_RATE) || 20,
      SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 15 * 60 * 1000,
      INACTIVE_TIMEOUT: parseInt(process.env.INACTIVE_TIMEOUT) || 3 * 60 * 1000,
      NO_VIEWER_TIMEOUT: parseInt(process.env.NO_VIEWER_TIMEOUT) || 2 * 60 * 1000
    };

    this.world = {
      DEFAULT_WIDTH: 800,
      DEFAULT_HEIGHT: 600
    };

    this.cors = {
      origins: [
        'https://davidbugayov.github.io',
        'https://bilateralbound.onrender.com',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5000'
      ]
    };

    this.physics = {
      BASE_SPEED: 120,
      ENERGY_LOSS: 0.98,
      INTERPOLATION_FACTOR: 0.08,
      MIN_MOVEMENT_THRESHOLD: 0.05
    };

    this.client = {
      TARGET_FPS: 60,
      FRAME_INTERVAL: 1000 / 60
    };
  }

  getServerConfig() {
    return this.server;
  }

  getWorldConfig() {
    return this.world;
  }

  getCorsConfig() {
    return this.cors;
  }

  getPhysicsConfig() {
    return this.physics;
  }

  getClientConfig() {
    return this.client;
  }
}

module.exports = new Config();



