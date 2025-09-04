/**
 * SessionSync - оптимизированный модуль синхронизации состояния сессии
 * Управляет polling'ом состояния с сервера
 * Оптимизирован для производительности и переиспользуемости
 */

class SessionSync {
  constructor (options = {}) {
    this.options = {
      sessionId: null,
      pollInterval: 500, // Увеличен до 500ms для уменьшения нагрузки и HTTP 429 ошибок
      serverUrl: '',
      onStateReceived: null,
      onSessionExpired: null,
      onError: null,
      ...options
    }

    this.isPolling = false
    this.pollTimer = null
    this.lastState = null
    this.retryCount = 0
    this.maxRetries = 3
    this.errorCount = 0
    this.maxErrors = 5

    // Кэшируем часто используемые значения
    this.baseUrl = this.options.serverUrl || ''
    this.sessionId = this.options.sessionId

    // Предварительно создаем URL для API
    this.apiBaseUrl = `${this.baseUrl}/api/session/${this.sessionId}`
  }

  /**
     * Запускает polling состояния
     */
  startPolling () {
    if (this.isPolling || !this.sessionId) {
      return
    }

    this.isPolling = true
    this.poll()
  }

  /**
     * Останавливает polling состояния
     */
  stopPolling () {
    this.isPolling = false
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  /**
     * Выполняет один запрос состояния (оптимизированная версия)
     */
  async poll () {
    if (!this.isPolling) return

    try {
      const response = await this.makeRequest('/state')
      this.handleResponse(response)
      this.errorCount = 0
      this.retryCount = 0
    } catch (error) {
      this.handleError(error)
    }

    // Продолжаем polling если не остановлены
    if (this.isPolling) {
      this.pollTimer = setTimeout(() => this.poll(), this.options.pollInterval)
    }
  }

  /**
     * Делает HTTP запрос к API (оптимизированная версия)
     */
  async makeRequest (endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = `${this.apiBaseUrl}${endpoint}`

      const xhr = new XMLHttpRequest()
      xhr.open(method, url, true)
      xhr.setRequestHeader('Content-Type', 'application/json')

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve({ status: xhr.status, data: response })
            } catch (e) {
              resolve({ status: xhr.status, data: xhr.responseText })
            }
          } else if (xhr.status === 404) {
            // Сессия истекла
            resolve({ status: xhr.status, data: null })
          } else {
            resolve({ status: xhr.status, data: xhr.responseText })
          }
        }
      }

      xhr.onerror = () => reject(new Error('Network error'))
      xhr.ontimeout = () => reject(new Error('Request timeout'))

      if (data) {
        xhr.send(JSON.stringify(data))
      } else {
        xhr.send()
      }
    })
  }

  /**
     * Обрабатывает ответ от сервера
     */
  handleResponse (response) {
    if (response.status === 404) {
      // Сессия истекла
      if (this.options.onSessionExpired) {
        this.options.onSessionExpired()
      }
      this.stopPolling()
      return
    }

    if (response.status === 200 && response.data) {
      // Проверяем, изменилось ли состояние
      if (this.hasStateChanged(response.data)) {
        this.lastState = response.data

        if (this.options.onStateReceived) {
          this.options.onStateReceived(response.data)
        }
      }
    }
  }

  /**
     * Проверяет, изменилось ли состояние (оптимизированная версия)
     */
  hasStateChanged (newState) {
    if (!this.lastState) return true

    // Быстрая проверка основных параметров
    const last = this.lastState
    const current = newState

    return (
      last.x !== current.x ||
            last.y !== current.y ||
            last.vx !== current.vx ||
            last.vy !== current.vy ||
            last.speed !== current.speed ||
            last.radius !== current.radius ||
            last.colorBall !== current.colorBall ||
            last.colorBg !== current.colorBg ||
            last.paused !== current.paused ||
            last.viewerConnected !== current.viewerConnected
    )
  }

  /**
     * Обрабатывает ошибки
     */
  handleError (error) {
    this.errorCount++

    if (this.errorCount >= this.maxErrors) {
      debugError('SessionSync: Max errors reached, stopping polling')
      this.stopPolling()

      if (this.options.onError) {
        this.options.onError(error)
      }
      return
    }

    // Экспоненциальная задержка при ошибках
    const delay = Math.min(1000 * Math.pow(2, this.errorCount), 10000)

    if (this.isPolling) {
      this.pollTimer = setTimeout(() => this.poll(), delay)
    }
  }

  /**
     * Синхронизирует отскок с сервером
     */
  async syncBounce (bounceData) {
    return await this.sendBounce(bounceData)
  }

  /**
     * Отправляет событие отскока на сервер
     */
  async sendBounce (bounceData) {
    try {
      const response = await this.makeRequest('/bounce', 'POST', bounceData)
      return response.status === 200
    } catch (error) {
      debugError('Failed to send bounce:', error)
      return false
    }
  }

  /**
     * Обновляет состояние сессии
     */
  async updateSession (updates) {
    try {
      const response = await this.makeRequest('/controller/update', 'POST', updates)
      return response.status === 200
    } catch (error) {
      debugError('Failed to update session:', error)
      return false
    }
  }

  // === ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ПЕРЕИСПОЛЬЗОВАНИЯ ===

  /**
     * Клонирует синхронизатор для новой сессии
     */
  clone (newSessionId, newOptions = {}) {
    return new SessionSync({
      ...this.options,
      sessionId: newSessionId,
      ...newOptions
    })
  }

  /**
     * Устанавливает новый sessionId
     */
  setSessionId (newSessionId) {
    this.sessionId = newSessionId
    this.apiBaseUrl = `${this.baseUrl}/api/session/${this.sessionId}`
  }

  /**
     * Устанавливает новый интервал polling'а
     */
  setPollInterval (interval) {
    this.options.pollInterval = interval

    // Перезапускаем polling если активен
    if (this.isPolling) {
      this.stopPolling()
      this.startPolling()
    }
  }

  /**
     * Получает текущее состояние
     */
  getCurrentState () {
    return this.lastState
  }

  /**
     * Проверяет, активен ли polling
     */
  isActive () {
    return this.isPolling
  }

  /**
     * Получает статистику синхронизации
     */
  getStats () {
    return {
      isPolling: this.isPolling,
      errorCount: this.errorCount,
      retryCount: this.retryCount,
      lastState: this.lastState ? 'received' : 'none',
      pollInterval: this.options.pollInterval
    }
  }

  /**
     * Сбрасывает счетчики ошибок
     */
  resetErrorCounters () {
    this.errorCount = 0
    this.retryCount = 0
  }

  /**
     * Устанавливает callback'и
     */
  setCallbacks (callbacks) {
    Object.assign(this.options, callbacks)
  }

  /**
     * Приостанавливает polling на указанное время
     */
  pauseFor (duration) {
    this.stopPolling()
    setTimeout(() => {
      if (this.sessionId) {
        this.startPolling()
      }
    }, duration)
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.SessionSync = SessionSync
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionSync
}
