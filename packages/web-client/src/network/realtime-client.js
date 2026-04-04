/**
 * RealtimeClient - WebSocket transport wrapper
 */
'use strict';

const WebSocketClient = require('./websocket-client');

class RealtimeClient {
  constructor(sessionId, role, options = {}) {
    this.sessionId = sessionId;
    this.role = role;
    this.transportType = 'websocket';
    this.client = new WebSocketClient(sessionId, role, options);
  }
  async connect() {
    return this.client.connect();
  }
  async send(type, payload, options = {}) {
    return this.client.send(type, payload, options);
  }
  on(eventType, handler) {
    this.client.on(eventType, handler);
  }
  off(eventType, handler) {
    this.client.off(eventType, handler);
  }
  close() {
    this.client.close();
  }
  get isConnected() {
    return this.client.isConnected;
  }
  getStats() {
    return {
      ...this.client.getStats(),
      transportType: this.transportType,
    };
  }
  getTransportType() {
    return this.transportType;
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.RealtimeClient = RealtimeClient;
}

module.exports = RealtimeClient;
