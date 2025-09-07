/**
 * SessionSync - оптимизированный модуль синхронизации состояния сессии
 * Управляет polling'ом состояния с сервера
 * Оптимизирован для производительности и переиспользуемости
 */

class SessionSync {
  constructor (options = {}) {
    this.options = {
      sessionId: null,
      pollInterval: this.getOptimalPollInterval(), // Адаптивный интервал для продакшена
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
              console.log('🔄 SessionSync: Request successful', { url, response })
              resolve({ status: xhr.status, data: response })
            } catch (e) {
              console.log('🔄 SessionSync: Request successful (raw)', { url, data: xhr.responseText })
              resolve({ status: xhr.status, data: xhr.responseText })
            }
          } else if (xhr.status === 404) {
            // Сессия истекла
            console.log('🔄 SessionSync: Session expired (404)', { url })
            resolve({ status: xhr.status, data: null })
          } else {
            console.log('🔄 SessionSync: Request failed', { url, status: xhr.status, data: xhr.responseText })
            resolve({ status: xhr.status, data: xhr.responseText })
          }
        }
      }

      xhr.onerror = () => {
        console.error('🔄 SessionSync: Network error', { url })
        reject(new Error('Network error'))
      }
      xhr.ontimeout = () => {
        console.error('🔄 SessionSync: Request timeout', { url })
        reject(new Error('Request timeout'))
      }

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
      console.log('🔄 SessionSync: Session expired (404)')
      if (this.options.onSessionExpired) {
        this.options.onSessionExpired()
      }
      this.stopPolling()
      return
    }

    if (response.status === 200 && response.data) {
      // Парсим JSON данные
      let sessionData
      try {
        sessionData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
      } catch (e) {
        console.error('🔄 SessionSync: Failed to parse response data:', response.data)
        return
      }

      // Проверяем, изменилось ли состояние
      const hasChanged = this.hasStateChanged(sessionData)
      console.log('🔄 SessionSync: State check', {
        hasChanged,
        lastState: this.lastState ? {
          x: this.lastState.x,
          y: this.lastState.y,
          vx: this.lastState.vx,
          vy: this.lastState.vy,
          speed: this.lastState.speed,
          paused: this.lastState.paused
        } : null,
        newState: {
          x: sessionData.x,
          y: sessionData.y,
          vx: sessionData.vx,
          vy: sessionData.vy,
          speed: sessionData.speed,
          paused: sessionData.paused
        }
      })

      if (hasChanged) {
        this.lastState = sessionData
        console.log('✅ SessionSync: State changed, calling callback')

        if (this.options.onStateReceived) {
          this.options.onStateReceived(sessionData)
        }
      } else {
        console.log('⏭️ SessionSync: No significant changes, skipping callback')
      }
    } else {
      console.log('⚠️ SessionSync: Invalid response', {
        status: response.status,
        hasData: !!response.data
      })
    }
  }

  /**
     * Проверяет, изменилось ли состояние (оптимизированная версия)
     * Учитывает только значительные изменения для уменьшения запросов
     */
  hasStateChanged (newState) {
    if (!this.lastState) {
      console.log('🔄 SessionSync: First state, marking as changed')
      return true
    }

    // Быстрая проверка основных параметров
    const last = this.lastState
    const current = newState

    // Для продакшена проверяем только критические изменения
    const isProduction = window.location.hostname.includes('onrender.com') || 
                        window.location.hostname.includes('bilateralbound.onrender.com')

    if (isProduction) {
      // На продакшене синхронизируем движение мяча с очень малым порогом
      const positionChanged = Math.abs(last.x - current.x) > 1 || Math.abs(last.y - current.y) > 1
      const pausedChanged = last.paused !== current.paused
      const speedChanged = Math.abs(last.speed - current.speed) > 0.1

      const changes = {
        positionChanged,
        pausedChanged,
        speedChanged
      }

      const hasAnyChange = Object.values(changes).some(change => change)
      
      console.log('🔄 SessionSync: Production change detection (smooth movement)', {
        changes,
        hasAnyChange,
        thresholds: {
          position: 1,
          speed: 0.1
        }
      })

      return hasAnyChange
    } else {
      // Для локальной разработки полная синхронизация с разумными порогами
      const velocityChanged = Math.abs(last.vx - current.vx) > 1 || Math.abs(last.vy - current.vy) > 1
      const speedChanged = Math.abs(last.speed - current.speed) > 0.1
      const positionChanged = Math.abs(last.x - current.x) > 1 || Math.abs(last.y - current.y) > 1

      const changes = {
        velocityChanged,
        speedChanged,
        positionChanged,
        radiusChanged: last.radius !== current.radius,
        colorBallChanged: last.colorBall !== current.colorBall,
        colorBgChanged: last.colorBg !== current.colorBg,
        pausedChanged: last.paused !== current.paused,
        viewerConnectedChanged: last.viewerConnected !== current.viewerConnected
      }

      const hasAnyChange = Object.values(changes).some(change => change)
      
      console.log('🔄 SessionSync: Local change detection (full sync)', {
        changes,
        hasAnyChange,
        thresholds: {
          velocity: 0.1,
          speed: 0.1,
          position: 0.1
        }
      })

      return hasAnyChange
    }
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

    // Специальная обработка 429 ошибок (Too Many Requests)
    let delay = Math.min(1000 * Math.pow(2, this.errorCount), 10000)
    
    if (error.message && error.message.includes('429')) {
      // Для 429 ошибок увеличиваем задержку еще больше
      delay = Math.min(2000 * Math.pow(2, this.errorCount), 30000)
      debugWarn(`SessionSync: 429 error detected, increasing delay to ${delay}ms`)
    }

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
      const response = await this.makeRequest(`/api/session/${this.sessionId}/bounce`, 'POST', bounceData)
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
   * Определяет оптимальный интервал polling'а в зависимости от окружения
   */
  getOptimalPollInterval () {
    // Проверяем, работаем ли на продакшене (Render.com)
    const isProduction = window.location.hostname.includes('onrender.com') || 
                        window.location.hostname.includes('bilateralbound.onrender.com')
    
    if (isProduction) {
      return 3000 // 3 секунды для продакшена чтобы избежать 429 ошибок
    } else {
      return 100 // 100ms для локальной разработки
    }
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
