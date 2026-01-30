'use strict'
const { logger, DEBUG_MODE } = require('../logger.js')

/**
 * SSE (Server-Sent Events) менеджер для управления потоками событий
 * Заменяет WebSocket для односторонней передачи данных сервер → клиент
 */
class SSEManager {
  constructor(sessionRepository) {
    this.sessionRepository = sessionRepository
    this.logger = logger
    // Храним SSE-клиенты: Map<sessionId, Set<{res, role, connectedAt}>>
    this.sseClients = new Map()

    // Запускаем heartbeat интервал для поддержания SSE соединений
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat()
    }, 30000) // Каждые 30 секунд
  }

  /**
   * Добавляет SSE-клиента к сессии
   * @param {string} sessionId - ID сессии
   * @param {Object} res - Express response объект
   * @param {string} role - Роль клиента (viewer или controller)
   * @returns {boolean} Успех добавления
   */
  addClient(sessionId, res, role) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    if (!this.sseClients.has(sessionId)) {
      this.sseClients.set(sessionId, new Set())
    }

    const clientInfo = {
      res,
      role,
      connectedAt: Date.now(),
      sessionId
    }

    this.sseClients.get(sessionId).add(clientInfo)

    // Обновляем статус подключения в сессии
    if (role === 'controller') {
      session.controllerConnected = true
    } else if (role === 'viewer') {
      session.viewerConnected = true
    }

    // Сбрасываем таймер частичного отключения если оба снова подключены
    if (session.controllerConnected && session.viewerConnected) {
      session.partialDisconnectTime = null
      this.logger.logSession(sessionId, 'Both participants reconnected via SSE - timeout cleared')
    }

    this.logger.logSession(sessionId, `${role} connected via SSE`)
    return true
  }

  /**
   * Удаляет SSE-клиента
   * @param {Object} res - Express response объект
   * @returns {string|null} ID сессии или null
   */
  removeClient(res) {
    for (const [sessionId, clients] of this.sseClients.entries()) {
      for (const clientInfo of clients) {
        if (clientInfo.res === res) {
          clients.delete(clientInfo)

          // Если клиентов больше нет, удаляем сессию из Map
          if (clients.size === 0) {
            this.sseClients.delete(sessionId)
          }

          // Обновляем статус подключения
          this._updateConnectionStatus(sessionId, clientInfo.role)
          this.logger.logSession(sessionId, `${clientInfo.role} disconnected via SSE`)

          // Устанавливаем таймаут на отключение если осталась только одна роль
          const session = this.sessionRepository.findById(sessionId)
          if (session && (!session.controllerConnected || !session.viewerConnected)) {
            session.partialDisconnectTime = Date.now()
            this.logger.logSession(sessionId, 'Partial disconnect detected (SSE) - 15 min timeout started')
          }

          return sessionId
        }
      }
    }
    return null
  }

  /**
   * Обновляет статус подключения после отключения клиента
   * @private
   */
  _updateConnectionStatus(sessionId, disconnectedRole) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return

    const clients = this.getClients(sessionId)
    let hasController = false
    let hasViewer = false

    for (const clientInfo of clients) {
      if (clientInfo.role === 'controller') hasController = true
      if (clientInfo.role === 'viewer') hasViewer = true
    }

    if (disconnectedRole === 'controller') {
      session.controllerConnected = hasController
    } else if (disconnectedRole === 'viewer') {
      session.viewerConnected = hasViewer
    }
  }

  /**
   * Получает всех SSE-клиентов сессии
   * @param {string} sessionId - ID сессии
   * @param {string} role - Фильтр по роли (опционально)
   * @returns {Array} Массив клиентов
   */
  getClients(sessionId, role = null) {
    const clients = this.sseClients.get(sessionId)
    if (!clients) {
      return []
    }

    const clientsArray = Array.from(clients)

    if (role) {
      return clientsArray.filter(c => c.role === role)
    }

    return clientsArray
  }

  /**
   * Отправляет SSE-событие клиенту
   * @param {Object} res - Express response объект
   * @param {string} eventType - Тип события
   * @param {Object} data - Данные события
   * @returns {boolean} Успех отправки
   */
  sendEvent(res, eventType, data) {
    try {
      const payload = JSON.stringify(data)
      // SSE формат: event: type\ndata: payload\n\n
      res.write(`event: ${eventType}\ndata: ${payload}\n\n`)
      return true
    } catch (error) {
      this.logger.error(`Error sending SSE event: ${error.message}`)
      return false
    }
  }

  /**
   * Рассылает событие всем клиентам сессии
   * @param {string} sessionId - ID сессии
   * @param {string} eventType - Тип события
   * @param {Object} data - Данные события
   * @param {string} excludeRole - Роль которую исключить из рассылки (опционально)
   * @returns {number} Количество клиентов получивших событие
   */
  broadcast(sessionId, eventType, data, excludeRole = null) {
    const clients = this.getClients(sessionId)
    let sentCount = 0

    for (const clientInfo of clients) {
      if (excludeRole && clientInfo.role === excludeRole) {
        continue
      }

      if (this.sendEvent(clientInfo.res, eventType, data)) {
        sentCount++
      } else {
        // Если отправка не удалась, клиент вероятно отключился
        this.removeClient(clientInfo.res)
      }
    }

    if (sentCount > 0 && DEBUG_MODE) {
      this.logger.logSession(sessionId, `Broadcasted SSE event ${eventType} to ${sentCount} clients`)
    }

    return sentCount
  }

  /**
   * Отправляет heartbeat всем клиентам для поддержания соединения
   */
  sendHeartbeat() {
    for (const [sessionId, clients] of this.sseClients.entries()) {
      for (const clientInfo of clients) {
        try {
          // SSE требует периодических данных для поддержания соединения
          clientInfo.res.write(': heartbeat\n\n')
        } catch (error) {
          this.logger.error(`Heartbeat failed for session ${sessionId}: ${error.message}`)
          this.removeClient(clientInfo.res)
        }
      }
    }
  }

  /**
   * Получает количество всех активных SSE-соединений
   * @returns {number}
   */
  getTotalConnectionsCount() {
    let count = 0
    for (const clients of this.sseClients.values()) {
      count += clients.size
    }
    return count
  }
}

module.exports = SSEManager
