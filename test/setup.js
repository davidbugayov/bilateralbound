// Jest setup file
global.performance = require('perf_hooks').performance

// Mock WebSocket
global.WebSocket = class MockWebSocket {
  constructor() {
    this.readyState = 1
    this.onopen = null
    this.onclose = null
    this.onmessage = null
    this.onerror = null
  }
  
  send() {}
  close() {}
}

// Mock canvas
HTMLCanvasElement.prototype.getContext = () => ({
  fillRect: () => {},
  beginPath: () => {},
  arc: () => {},
  fill: () => {},
  createRadialGradient: () => ({
    addColorStop: () => {}
  })
})
