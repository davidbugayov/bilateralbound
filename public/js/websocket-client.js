/**
 * WebSocketClient - Модернизированный клиент для WebSocket соединений
 * Использует современные возможности JavaScript для лучшей надежности
 */
class WebSocketClient {
  constructor (sessionId, role, options = {}) {
    // Валидация входных параметров
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Valid sessionId (string) is required for WebSocket connection')
    }
    if (!role || !['controller', 'viewer'].includes(role)) {
      throw new Error('Valid role ("controller" or "viewer") is required for WebSocket connection')
    }

    // Конфигурация с умолчаниями - используем глобальную конфигурацию
    const globalConfig = (typeof window !== 'undefined' && window.BBConfig && window.BBConfig.network) || {}
    this.config = {
      isSecure: window.location.protocol === 'https:',
      maxReconnectAttempts: globalConfig.maxReconnectAttempts || 5,
      reconnectInterval: globalConfig.reconnectDelay || 3000,
      heartbeatInterval: globalConfig.heartbeatInterval || 25000,
      messageTimeout: globalConfig.messageTimeout || 5000,
      // Коалесцирование/троттлинг исходящих сообщений
      coalesceTypes: (globalConfig.coalesceTypes || ['controller_update']),
      coalesceDelayMs: (globalConfig.coalesceDelayMs || 16), // ~60fps
      ...options
    }

    // Состояние клиента
    this.sessionId = sessionId
    this.role = role
    this.ws = null
    this.isConnected = false
    this.isConnecting = false

    // Обработчики событий
    this.eventHandlers = new Map()
    this.pendingMessages = new Map()
    this.messageIdCounter = 0

    // Таймеры
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.messageTimeouts = new Map()

    // Коалесцирование исходящих сообщений
    this._coalesceBuffers = new Map() // type -> latest payload
    this._coalesceTimers = new Map() // type -> timer id

    // Генерация URL
    this.url = this._generateWebSocketUrl()

    // Статистика
    this._stats = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      lastActivity: Date.now(),
      rttMs: 0,
      jitterMs: 0,
      _lastRttSamples: []
    }
  }

  _generateWebSocketUrl () {
    const protocol = this.config.isSecure ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = new URL(`${protocol}//${host}`)
    url.searchParams.set('sessionId', this.sessionId)
    url.searchParams.set('role', this.role)
    return url.toString()
  }

  // ===== ОСНОВНЫЕ МЕТОДЫ =====

  /**
   * Подключение к WebSocket серверу
   */
  async connect () {
    if (this.isConnected || this.isConnecting) {
      this.log('Connection already in progress or established')
      return Promise.resolve()
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
          reject(error)
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  /**
   * Улучшенная отправка с приоритетами и буферизацией
   */
  async send (type, payload, options = {}) {
    if (!this.isConnected) {
      throw new Error('WebSocket is not connected')
    }

    // Приоритизация критически важных сообщений
    const priorityTypes = ['controller_update', 'heartbeat']
    const isPriority = priorityTypes.includes(type)

    // Для приоритетных сообщений отключаем коалесцирование
    if (isPriority) {
      const messageId = ++this.messageIdCounter
      const message = {
        id: messageId,
        type,
        payload,
        timestamp: Date.now(),
        priority: true
      }

      if (options.expectResponse) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingMessages.delete(messageId)
            reject(new Error(`Message timeout: ${type}`))
          }, this.config.messageTimeout)

          this.pendingMessages.set(messageId, { resolve, reject, timeout })
          this._sendMessage(message)
        })
      } else {
        this._sendMessage(message)
        return Promise.resolve()
      }
    }

    // Коалесцирование для обычных сообщений
    if (this.config.coalesceTypes.includes(type) && !options.expectResponse) {
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
      return Promise.resolve()
    }

    // Обычная отправка для остальных сообщений
    const messageId = ++this.messageIdCounter
    const message = { id: messageId, type, payload, timestamp: Date.now() }

    if (options.expectResponse) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingMessages.delete(messageId)
          reject(new Error(`Message timeout: ${type}`))
        }, this.config.messageTimeout)

        this.pendingMessages.set(messageId, { resolve, reject, timeout })
        this._sendMessage(message)
      })
    } else {
      this._sendMessage(message)
      return Promise.resolve()
    }
  }

  /**
   * Регистрация обработчика события
   */
  on (eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType).push(handler)
  }

  /**
   * Отписка от события
   */
  off (eventType, handler = null) {
    if (!this.eventHandlers.has(eventType)) return

    if (handler) {
      const handlers = this.eventHandlers.get(eventType)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    } else {
      this.eventHandlers.delete(eventType)
    }
  }

  /**
   * Отключение от сервера
   */
  disconnect (code = 1000, reason = 'Client disconnect') {
    this._clearTimers()
    this.isConnected = false
    this.isConnecting = false

    if (this.ws) {
      this.ws.close(code, reason)
      this.ws = null
    }
  }

  // ===== ВНУТРЕННИЕ МЕТОДЫ =====

  _setupEventHandlers () {
    this.ws.onmessage = this._handleMessage.bind(this)
    this.ws.onclose = this._handleClose.bind(this)
    this.ws.onerror = this._handleError.bind(this)
  }

  _handleConnectionSuccess () {
    this.isConnected = true
    this.isConnecting = false
    this._stats.reconnectCount = 0
    this._stats.lastActivity = Date.now()

    this._startHeartbeat()
    this._emit('open', { sessionId: this.sessionId, role: this.role })
    this.log('Connected successfully')
  }

  _handleConnectionError (error) {
    this._emit('error', { error, type: 'connection' })
    this._scheduleReconnect()
  }

  _handleMessage (event) {
    try {
      const message = JSON.parse(event.data)
      this._stats.messagesReceived++
      this._stats.lastActivity = Date.now()

      // Обработка подтверждений
      if (message.id && this.pendingMessages.has(message.id)) {
        const pending = this.pendingMessages.get(message.id)
        clearTimeout(pending.timeout)
        this.pendingMessages.delete(message.id)
        pending.resolve(message.payload)
        return
      }

      // Обработка обычных сообщений
      this._emit(message.type, message.payload)
      this._emit('message', message)

      // Пробуем оценить сетевые метрики если есть timestamp
      if (message && typeof message.timestamp === 'number') {
        const now = performance.now()
        const rtt = Math.max(0, now - message.timestamp)
        this._stats._lastRttSamples.push(rtt)
        if (this._stats._lastRttSamples.length > 20) this._stats._lastRttSamples.shift()
        const n = this._stats._lastRttSamples.length
        const avg = this._stats._lastRttSamples.reduce((a, b) => a + b, 0) / n
        const varSum = this._stats._lastRttSamples.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n
        const jitter = Math.sqrt(varSum)
        this._stats.rttMs = Math.round(avg)
        this._stats.jitterMs = Math.round(jitter)
        this._emit('net_metrics', { rttMs: this._stats.rttMs, jitterMs: this._stats.jitterMs })
      }
    } catch (error) {
      this.log(`Failed to parse message: ${error.message}`, 'error')
      this._emit('error', { error, type: 'parse', rawData: event.data })
    }
  }

  _handleClose (event) {
    this.isConnected = false
    this._clearTimers()
    this._emit('close', event)

    if (event.code !== 1000) { // Не нормальное отключение
      this._scheduleReconnect()
    }
  }

  _handleError (error) {
    this._emit('error', { error, type: 'websocket' })
  }

  _scheduleReconnect () {
    if (this._stats.reconnectCount >= this.config.maxReconnectAttempts) {
      this.log('Max reconnection attempts reached', 'error')
      this._emit('maxReconnectAttemptsReached')
      return
    }

    this._stats.reconnectCount++
    const delay = this.config.reconnectInterval * Math.pow(1.5, this._stats.reconnectCount - 1)

    this.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._stats.reconnectCount})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        this._scheduleReconnect()
      })
    }, delay)
  }

  _startHeartbeat () {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send('heartbeat', { timestamp: Date.now() }).catch(err => {
          this.log(`Heartbeat failed: ${err.message}`, 'warning')
        })
      }
    }, this.config.heartbeatInterval)
  }

  _sendMessage (message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      this._stats.messagesSent++
    } else {
      throw new Error('WebSocket is not connected')
    }
  }

  _emit (eventType, data) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          this.log(`Error in event handler for ${eventType}: ${error.message}`, 'error')
        }
      })
    }
  }

  _clearTimers () {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.messageTimeouts.forEach(timeout => clearTimeout(timeout))
    this.messageTimeouts.clear()
    // Чистим коалесцирование
    this._coalesceTimers.forEach(timerId => clearTimeout(timerId))
    this._coalesceTimers.clear()
    this._coalesceBuffers.clear()
  }

  log (message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = `[WS:${this.role}]`
    const coloredMessage = `%c${prefix} ${message}`

    const style = type === 'error'
      ? 'color: #ef4444; font-weight: bold;'
      : type === 'warning'
        ? 'color: #f59e0b; font-weight: bold;'
        : 'color: #3b82f6; font-weight: bold;'

    console[type === 'error' ? 'error' : 'log'](coloredMessage, style, timestamp)
  }

  // ===== ГЕТТЕРЫ =====

  get isReady () {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN
  }

  get stats () {
    return { ...this._stats }
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketClient
}
