/**
 * @fileoverview Debug Logger - Unified debug logging with query toggle
 * @module utils/debug-logger
 * @version 2.0.0 - Optimized, merged bb-debug functionality
 *
 * Usage:
 *   Add ?debug=1 or ?bbdebug=1 to URL
 *   Example: /v/abc123?debug=1&debug-cat=sync,movement
 *
 * Categories: sync, physics, network, sse, state, command, movement, bounce, audio
 */
/* jshint esversion: 11, browser: true, node: true, boss: true, laxbreak: true, laxcomma: true, unused: false */
/* global globalThis, console, module, Map, Set */
'use strict';
const CATEGORY_COLORS = {
  sync: '#4A9EFF',
  sse: '#FF8C42',
  network: '#52B788',
  physics: '#9D4EDD',
  state: '#F72585',
  command: '#FF006E',
  movement: '#06FFA5',
  bounce: '#C77DFF',
  audio: '#FFD700',
};
class DebugLogger {
  constructor() {
    this.enabled = this._checkDebugMode();
    this.categories = this._getEnabledCategories();
    this.throttles = new Map();
    if (this.enabled) {
      this._logStats();
    }
  }
  _checkDebugMode() {
    if (globalThis.window === undefined) {
      return false;
    }
    const params = new URLSearchParams(globalThis.location.search);
    return params.get('debug') === '1' || params.get('bbdebug') === '1';
  }
  _getEnabledCategories() {
    if (!this.enabled) {
      return new Set();
    }
    const params = new URLSearchParams(globalThis.location.search);
    const categories = params.get('debug-cat') || params.get('categories');
    return categories
      ? new Set(categories.split(',').map((c) => c.trim()))
      : new Set(Object.keys(CATEGORY_COLORS));
  }
  _logStats() {
    console.log(
      '%c[DEBUG MODE ENABLED]',
      'background: #0A0; color: white; font-weight: bold; padding: 4px 8px; border-radius: 3px;',
    );
    console.log(
      '📊 Enabled categories:',
      Array.from(this.categories).join(', '),
    );
  }
  _isEnabled(category) {
    return this.enabled && this.categories.has(category);
  }
  _log(category, message, data) {
    if (!this._isEnabled(category)) {
      return;
    }
    const color = CATEGORY_COLORS[category] || '#999';
    const time = new Date().toISOString().split('T')[1].slice(0, -1);
    console.log(
      `%c[${category.toUpperCase()}] ${time} - ${message}`,
      `color: ${color}; font-weight: bold;`,
      data ?? '',
    );
  }
  sync(msg, data) {
    this._log('sync', msg, data);
  }
  sse(msg, data) {
    this._log('sse', msg, data);
  }
  physics(msg, data) {
    this._log('physics', msg, data);
  }
  network(msg, data) {
    this._log('network', msg, data);
  }
  state(msg, data) {
    this._log('state', msg, data);
  }
  command(msg, data) {
    this._log('command', msg, data);
  }
  movement(msg, data) {
    this._log('movement', msg, data);
  }
  bounce(msg, data) {
    this._log('bounce', msg, data);
  }
  audio(msg, data) {
    this._log('audio', msg, data);
  }
  throttle(key, intervalMs, category, message, data) {
    const now = Date.now();
    const last = this.throttles.get(key);
    if (last && now - last < intervalMs) {
      return;
    }
    this.throttles.set(key, now);
    this._log(category, message, data);
  }
  error(msg, err) {
    console.error(
      `%c[ERROR] ${msg}`,
      'color: #F00; font-weight: bold;',
      err ?? '',
    );
  }
  warn(msg, data) {
    console.warn(
      `%c[WARN] ${msg}`,
      'color: #FA0; font-weight: bold;',
      data ?? '',
    );
  }
  info(msg, data) {
    console.info(
      `%cℹ️ ${msg}`,
      'color: #4A9EFF; font-weight: bold;',
      data ?? '',
    );
  }
  log(msg, data) {
    console.log(msg, data ?? '');
  }
  /**
   * Creates a scoped logger for a specific module
   * @param {string} moduleName - The name of the module
   * @returns {object} Scoped logger object
   * @public
   * @used
   * jshint unused: false
   */
  scope(moduleName) {
    return {
      sync: (msg, data) => this.sync(`[${moduleName}] ${msg}`, data),
      sse: (msg, data) => this.sse(`[${moduleName}] ${msg}`, data),
      physics: (msg, data) => this.physics(`[${moduleName}] ${msg}`, data),
      network: (msg, data) => this.network(`[${moduleName}] ${msg}`, data),
      state: (msg, data) => this.state(`[${moduleName}] ${msg}`, data),
      command: (msg, data) => this.command(`[${moduleName}] ${msg}`, data),
      movement: (msg, data) => this.movement(`[${moduleName}] ${msg}`, data),
      bounce: (msg, data) => this.bounce(`[${moduleName}] ${msg}`, data),
      audio: (msg, data) => this.audio(`[${moduleName}] ${msg}`, data),
      error: (msg, err) => this.error(`[${moduleName}] ${msg}`, err),
      warn: (msg, data) => this.warn(`[${moduleName}] ${msg}`, data),
      info: (msg, data) => this.info(`[${moduleName}] ${msg}`, data),
      log: (msg, data) => this.log(`[${moduleName}] ${msg}`, data),
    };
  }
}
const debugLogger = new DebugLogger();
if (typeof module !== 'undefined' && module?.exports) {
  module.exports = debugLogger;
}
if (globalThis !== undefined) {
  globalThis.debugLogger = debugLogger;
  globalThis.logger = debugLogger;
  globalThis.createScopedLogger = (moduleName) => debugLogger.scope(moduleName);
  globalThis.debugLog = (...args) => {
    if (!debugLogger.enabled) {
      return;
    }
    if (args.length === 1 && typeof args[0] === 'string') {
      console.log(args[0]);
    } else if (args.length === 2) {
      console.log(args[0], args[1]);
    } else {
      console.log(...args);
    }
  };
  globalThis.debugError = (...args) => {
    if (!debugLogger.enabled) {
      return;
    }
    debugLogger.error(args[0], args[1]);
  };
  globalThis.debugWarn = (...args) => {
    if (!debugLogger.enabled) {
      return;
    }
    debugLogger.warn(args[0], args[1]);
  };
}
