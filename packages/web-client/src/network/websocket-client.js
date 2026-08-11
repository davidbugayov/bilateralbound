/**
 * WebSocketClient - Модернизированный клиент для WebSocket соединений
 * Использует современные возможности JavaScript для лучшей надежности
 */
'use strict'

class WebSocketClient {
  constructor(sessionId, role, options = {}) {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error(
        'Valid sessionId (string) is required for WebSocket connection'
      )
    }
    if (!role || !['controller', 'viewer'].includes(role)) {
      throw new Error(
        'Valid role ("controller" or "viewer") is required for WebSocket connection'
      )
    }
    const globalConfig = globalThis.BBConfig?.network || {}
    this.config = {
      isSecure: globalThis.location.protocol === 'https:',
      maxReconnectAttempts: globalConfig.maxReconnectAttempts || 50,
      reconnectInterval: globalConfig.reconnectDelay || 3000,
      heartbeatInterval: globalConfig.heartbeatInterval || 25000,
      messageTimeout: globalConfig.messageTimeout || 5000,
      coalesceTypes: globalConfig.coalesceTypes || ['controller_update'],
      coalesceDelayMs: globalConfig.coalesceDelayMs || 16, // ~60fps
      ...options
    }
    this.sessionId = sessionId
    this.role = role
    this.ws = null
    this._intentionallyClosed = false
    this.isConnected = false
    this.isConnecting = false
    this.eventHandlers = new Map()
    this.pendingMessages = new Map()
    this.messageIdCounter = 0
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.messageTimeouts = new Map()
    this._coalesceBuffers = new Map() // type -> latest payload
    this._coalesceTimers = new Map() // type -> timer id
    this.url = this._generateWebSocketUrl()
    this._stats = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      lastActivity: Date.now(),
      rttMs: 0,
      jitterMs: 0,
      _lastRttSamples: []
    }
    // Фоновая живучесть: отслеживаем visibility для немедленного переподключения
    this._visibilityHandler = () => {
      if (
        document.visibilityState === 'visible' &&
        !this.isConnected &&
        !this.isConnecting
      ) {
        this.log('Tab visible — triggering immediate reconnect', 'info')
        this.connect().catch(() => {})
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibilityHandler)
    }
  }
  _generateWebSocketUrl() {
    const protocol = this.config.isSecure ? 'wss:' : 'ws:'
    const host = globalThis.location.host
    const url = new URL(`${protocol}//${host}`)
    // Use HMAC-signed WS token for authentication (set by server in HTML)
    const token = globalThis.__WS_TOKEN__
    if (token) {
      url.searchParams.set('token', token)
    } else {
      // Fallback for legacy / dev: pass sessionId and role directly
      url.searchParams.set('sessionId', this.sessionId)
      url.searchParams.set('role', this.role)
    }
    return url.toString()
  }
  /**
   * Подключение к WebSocket серверу
   */
  async connect() {
    if (this.isConnected || this.isConnecting) {
      this.log('Connection already in progress or established')
      return
    }
    return new Promise((resolve, reject) => {
      this.isConnecting = true
      this.log(`Connecting to ${this.url}`)
      try {
        this.ws = new WebSocket(this.url)
        this._setupEventHandlers()
        const connectionTimeout = setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false
            this.ws?.close()
            reject(new Error('Connection timeout'))
          }
        }, 10000)
        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          this._handleConnectionSuccess()
          resolve()
        }
        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this._handleConnectionError(error)
          reject(new Error('WebSocket connection failed'))
        }
      } catch (error) {
        this.isConnecting = false
        reject(new Error(`WebSocket connection failed: ${error.message}`))
      }
    })
  }
  /**
   * Улучшенная отправка с приоритетами и буферизацией.
   * Queues messages when not connected instead of throwing — they are flushed on open.
   */
  async send(type, payload, options = {}) {
    if (!this.isConnected) {
      // Queue for later delivery when connection is established
      if (!this._sendQueue) this._sendQueue = []
      this._sendQueue.push({ type, payload, options })
      this.log(`Queued ${type} message (${this._sendQueue.length} pending)`, 'warning')
      // Trigger connection if not already connecting
      if (!this.isConnecting) {
        this.connect().catch(() => {})
      }
      return
    }
    const priorityTypes = ['controller_update', 'heartbeat']
    const isPriority = priorityTypes.includes(type)
    if (isPriority) {
      const messageId = ++this.messageIdCounter
      const message = {
        id: messageId,
        type,
        payload,
        timestamp: Date.now(),
        priority: true
      }
      return this._sendWithResponse(message, type, options)
    } else if (
      this.config.coalesceTypes.includes(type) &&
      !options.expectResponse
    ) {
      this._coalesceMessage(type, payload)
    } else {
      const messageId = ++this.messageIdCounter
      const message = { id: messageId, type, payload, timestamp: Date.now() }
      return this._sendWithResponse(message, type, options)
    }
  }
  _sendWithResponse(message, type, options) {
    if (options.expectResponse) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingMessages.delete(message.id)
          reject(new Error(`Message timeout: ${type}`))
        }, this.config.messageTimeout)
        this.pendingMessages.set(message.id, { resolve, reject, timeout })
        this._sendMessage(message)
      })
    } else {
      this._sendMessage(message)
    }
  }
  _coalesceMessage(type, payload) {
    this._coalesceBuffers.set(type, payload)
    if (!this._coalesceTimers.has(type)) {
      const timerId = setTimeout(() => {
        const latest = this._coalesceBuffers.get(type)
        this._coalesceBuffers.delete(type)
        this._coalesceTimers.delete(type)
        const coalescedMessage = {
          id: ++this.messageIdCounter,
          type,
          payload: latest,
          timestamp: Date.now(),
          batched: true
        }
        try {
          this._sendMessage(coalescedMessage)
        } catch (e) {
          this.log(`Coalesced send failed: ${e.message}`, 'warning')
        }
      }, this.config.coalesceDelayMs)
      this._coalesceTimers.set(type, timerId)
    }
  }
  /**
   * Регистрация обработчика события
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType).push(handler)
  }
  off(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx !== -1) handlers.splice(idx, 1)
  }
  close() {
    this._intentionallyClosed = true
    this._clearTimers()
    if (this.ws) {
      this.ws.onclose = null // prevent reconnect on intentional close
      const ws = this.ws
      this.ws = null
      try { ws.close(1000, 'Client closed') } catch { /* already closing */ }
    }
    this.isConnected = false
    this.isConnecting = false
  }
  getStats() {
    return {
      messagesSent: this._stats.messagesSent,
      messagesReceived: this._stats.messagesReceived,
      reconnectCount: this._stats.reconnectCount,
      lastActivity: this._stats.lastActivity,
      rttMs: this._stats.rttMs,
      jitterMs: this._stats.jitterMs
    }
  }
  _setupEventHandlers() {
    this.ws.onmessage = this._handleMessage.bind(this)
    this.ws.onclose = this._handleClose.bind(this)
    this.ws.onerror = this._handleError.bind(this)
  }
  _handleConnectionSuccess() {
    this.isConnected = true
    this.isConnecting = false
    const isReconnection = this._stats.reconnectCount > 0
    this._stats.reconnectCount = 0
    this._stats.lastActivity = Date.now()
    this._startHeartbeat()
    this._emit('open', {
      sessionId: this.sessionId,
      role: this.role,
      isReconnection
    })
    this.log(
      'Connected successfully' + (isReconnection ? ' (reconnected)' : '')
    )
    // Flush queued messages
    if (this._sendQueue && this._sendQueue.length > 0) {
      const queue = this._sendQueue
      this._sendQueue = []
      this.log(`Flushing ${queue.length} queued messages`)
      for (const msg of queue) {
        this.send(msg.type, msg.payload, msg.options)
      }
    }
    // Track WebSocket reconnects in Metrika
    if (isReconnection && typeof globalThis !== 'undefined') {
      try { globalThis.dispatchEvent(new CustomEvent('bb_metrika_ws_reconnect')) } catch (e) { void e }
    }
  }
  _handleConnectionError(error) {
    this._emit('error', { error, type: 'connection' })
    this._scheduleReconnect()
  }
  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data)
      this._stats.messagesReceived++
      this._stats.lastActivity = Date.now()
      if (this._handlePendingMessage(message)) return
      this._emit(message.type, message.payload)
      this._emit('message', message)
      if (message?.timestamp) {
        this._updateNetworkMetrics(message.timestamp)
      }
    } catch (error) {
      this.log(`Failed to parse message: ${error.message}`, 'error')
      this._emit('error', { error, type: 'parse', rawData: event.data })
    }
  }
  _handlePendingMessage(message) {
    if (!message.id || !this.pendingMessages.has(message.id)) return false
    const pending = this.pendingMessages.get(message.id)
    clearTimeout(pending.timeout)
    this.pendingMessages.delete(message.id)
    pending.resolve(message.payload)
    return true
  }
  _updateNetworkMetrics(timestamp) {
    const now = performance.now()
    const rtt = Math.max(0, now - timestamp)
    this._stats._lastRttSamples.push(rtt)
    if (this._stats._lastRttSamples.length > 20) {
      this._stats._lastRttSamples.shift()
    }
    const n = this._stats._lastRttSamples.length
    const avg = this._stats._lastRttSamples.reduce((a, b) => a + b, 0) / n
    const variance =
      this._stats._lastRttSamples.reduce(
        (a, b) => a + Math.pow(b - avg, 2),
        0
      ) / n
    const jitter = Math.sqrt(variance)
    this._stats.rttMs = Math.round(avg)
    this._stats.jitterMs = Math.round(jitter)
    this._emit('net_metrics', {
      rttMs: this._stats.rttMs,
      jitterMs: this._stats.jitterMs
    })
  }
  _handleClose(event) {
    this.isConnected = false
    this._clearTimers()
    this._emit('close', event)
    // Если обработчик 'close' намеренно закрыл сокет (close() во время события) —
    // не планировать переподключение (например, сессия удалена на сервере).
    if (event.code !== 1000 && !this._intentionallyClosed) {
      this._scheduleReconnect()
    }
  }
  _handleError(error) {
    this._emit('error', { error, type: 'websocket' })
  }
  _scheduleReconnect() {
    if (this._stats.reconnectCount >= this.config.maxReconnectAttempts) {
      this.log('Max reconnection attempts reached', 'error')
      this._emit('maxReconnectAttemptsReached')
      return
    }
    this._stats.reconnectCount++
    const delay =
      this.config.reconnectInterval *
      Math.pow(1.5, this._stats.reconnectCount - 1)
    this.log(
      `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._stats.reconnectCount})`
    )
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        this._scheduleReconnect()
      })
    }, delay)
  }
  _startHeartbeat() {
    // Use setTimeout chain instead of setInterval — more reliable in background tabs
    // where setInterval gets throttled to 1+ minute.
    const sendHeartbeat = () => {
      if (!this.isConnected) {
        this.heartbeatTimer = null
        return
      }
      this.send('heartbeat', { timestamp: Date.now() }).catch((err) => {
        this.log(`Heartbeat failed: ${err.message}`, 'warning')
        // If send failed, connection is likely broken — force reconnect check
        if (this.isConnected && this.ws?.readyState !== WebSocket.OPEN) {
          this.isConnected = false
          this._handleClose({ code: 1006, reason: 'Heartbeat detected dead connection' })
        }
      })
      this.heartbeatTimer = setTimeout(sendHeartbeat, this.config.heartbeatInterval)
    }
    this.heartbeatTimer = setTimeout(sendHeartbeat, this.config.heartbeatInterval)
  }
  _sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      this._stats.messagesSent++
    } else {
      throw new Error('WebSocket is not connected')
    }
  }
  _emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data)
        } catch (error) {
          this.log(
            `Error in event handler for ${eventType}: ${error.message}`,
            'error'
          )
        }
      }
    }
  }
  _clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    for (const timeout of this.messageTimeouts.values()) {
      clearTimeout(timeout)
    }
    this.messageTimeouts.clear()
    for (const timerId of this._coalesceTimers.values()) {
      clearTimeout(timerId)
    }
    this._coalesceTimers.clear()
    this._coalesceBuffers.clear()
  }
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = `[WS:${this.role}]`
    const coloredMessage = `%c${prefix} ${message}`
    let style
    if (type === 'error') {
      style = 'color: #ef4444; font-weight: bold;'
    } else if (type === 'warning') {
      style = 'color: #f59e0b; font-weight: bold;'
    } else {
      style = 'color: #3b82f6; font-weight: bold;'
    }
    console[type === 'error' ? 'error' : 'log'](
      coloredMessage,
      style,
      timestamp
    )
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.WebSocketClient = WebSocketClient
}

module.exports = WebSocketClient
