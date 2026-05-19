/* jshint node: true, esversion: 11, strict: true */
'use strict'

class BroadcastService {
  constructor(
    sessionRepository,
    webSocketManager,
    { clientSimulationOnly, logger }
  ) {
    this.sessionRepository = sessionRepository
    this.webSocketManager = webSocketManager
    this.logger = logger
    this.clientSimulationOnly = clientSimulationOnly === true
    // Храним последнее отправленное состояние для delta compression
    this._lastBroadcastedState = new Map() // sessionId -> lastState
    // Cleanup interval для stale delta entries
    this._deltaCleanupInterval = setInterval(
      () => this._cleanupStaleDeltaEntries(),
      60 * 1000
    )
    this._deltaCleanupInterval.unref()
  }

  _buildStatePayload(session, stateType, payloadOverride = null, options = {}) {
    if (payloadOverride) {
      return {
        ...payloadOverride,
        viewerScreenSize: session.viewerScreenSize,
        clientSimulationOnly: this.clientSimulationOnly
      }
    }

    const basePayload = {
      ...session.ballState,
      viewerScreenSize: session.viewerScreenSize,
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected
    }

    if (this.clientSimulationOnly) {
      basePayload.clientSimulationOnly = true
    }

    // Delta compression: отправляем только изменившиеся поля
    if (
      options.deltaCompression &&
      this._lastBroadcastedState.has(session.id)
    ) {
      return this._getDeltaPayload(session.id, basePayload)
    }

    return basePayload
  }

  /**
   * Возвращает только изменившиеся параметры по сравнению с последним broadcast.
   * Позиция (x, y, vx, vy) намеренно исключена: оба клиента запускают локальную
   * физику и синхронизируются по параметрам, а не по координатам. Позиционный
   * relay вызывал spring-damper коррекцию → рывки на контроллере и вьювере.
   * @private
   */
  _getDeltaPayload(sessionId, currentPayload) {
    const lastState = this._lastBroadcastedState.get(sessionId)
    const delta = {}

    this._addChangedFields(delta, currentPayload, lastState)
    this._addScreenSizeIfChanged(delta, currentPayload, lastState)

    return delta
  }

  /**
   * Добавляет в delta только те поля, которые изменились
   * @private
   */
  _addChangedFields(delta, currentPayload, lastState) {
    const fieldsToCheck = [
      'paused',
      'stopping',
      'speed',
      'dirX',
      'dirY',
      'radius',
      'colorBall',
      'colorBg',
      'soundEnabled',
      'soundType',
      'viewerConnected',
      'controllerConnected',
      'clientSimulationOnly',
      'ballEmoji',
      'infinity',
      'trackBand'
    ]

    for (const field of fieldsToCheck) {
      if (currentPayload[field] !== lastState[field]) {
        delta[field] = currentPayload[field]
      }
    }
  }

  /**
   * Добавляет viewerScreenSize если изменился
   * @private
   */
  _addScreenSizeIfChanged(delta, currentPayload, lastState) {
    if (
      JSON.stringify(currentPayload.viewerScreenSize) !==
      JSON.stringify(lastState.viewerScreenSize)
    ) {
      delta.viewerScreenSize = currentPayload.viewerScreenSize
    }
  }

  broadcastState(sessionId, options = {}) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    const stateType = options.stateType || 'state_update'
    const payload = options.payload || null
    const fullPayload = this._buildStatePayload(
      session,
      stateType,
      payload,
      options
    )

    const eventData = {
      type: stateType,
      timestamp: Date.now(),
      payload: fullPayload
    }

    const sentCount = this._sendMessageToClients(sessionId, eventData)
    this._saveBroadcastStateIfNeeded(sessionId, session, options)
    this._logBroadcastIfDebug(sessionId, stateType, sentCount, options)

    return sentCount > 0
  }

  /**
   * Отправляет сообщение всем готовым клиентам
   * @private
   */
  _sendMessageToClients(sessionId, eventData) {
    if (!this.webSocketManager) {
      return 0
    }

    const message = JSON.stringify(eventData)
    let sentCount = 0

    for (const { client } of this.webSocketManager.getClients(sessionId)) {
      if (this._isClientReady(client)) {
        this._sendToClient(client, message)
        sentCount++
      }
    }

    return sentCount
  }

  /**
   * Отправляет сообщение одному клиенту
   * @private
   */
  _sendToClient(client, message) {
    try {
      client.send(message)
    } catch (error) {
      this.logger.error(`Error broadcasting to WS client: ${error.message}`)
    }
  }

  /**
   * Сохраняет состояние для delta compression если требуется
   * @private
   */
  _saveBroadcastStateIfNeeded(sessionId, session, options) {
    if (options.deltaCompression) {
      this._lastBroadcastedState.set(sessionId, { ...session.ballState })
    }
  }

  /**
   * Логирует информацию о broadcast в режиме отладки
   * @private
   */
  _logBroadcastIfDebug(sessionId, stateType, sentCount, options) {
    if (sentCount > 0) {
      const deltaInfo = options.deltaCompression ? ' (delta)' : ''
      this.logger.debug(
        { sessionId },
        `Broadcasted ${stateType} to ${sentCount} clients${deltaInfo}`
      )
    }
  }

  broadcastViewerStatus(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }
    return this.broadcastState(sessionId, {
      stateType: 'viewer_status',
      payload: {
        connected: session.viewerConnected,
        viewerConnected: session.viewerConnected,
        controllerConnected: session.controllerConnected,
        screenSize: session.viewerScreenSize
      }
    })
  }

  broadcastInitialState(sessionId, client, currentState) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    const ballState = currentState || session.ballState
    const initialState = {
      type: 'initial_state',
      timestamp: Date.now(),
      payload: {
        ...ballState,
        viewerConnected: session.viewerConnected,
        controllerConnected: session.controllerConnected,
        viewerScreenSize: session.viewerScreenSize,
        viewerAudioActivated: session.viewerAudioActivated || false,
        clientSimulationOnly: this.clientSimulationOnly,
        language: session.language || 'en'
      }
    }

    if (this._isClientReady(client)) {
      try {
        client.send(JSON.stringify(initialState))
        this.logger.debug({ sessionId }, 'Sent initial_state to WS client')
        return true
      } catch (error) {
        this.logger.error(`Error sending initial state: ${error.message}`)
        return false
      }
    }

    return false
  }

  broadcastControllerConnection(sessionId, isConnected) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    const eventType = isConnected
      ? 'controller_connected'
      : 'controller_disconnected'
    const event = {
      type: eventType,
      timestamp: Date.now(),
      payload: {
        controllerConnected: isConnected
      }
    }

    let sentCount = 0

    if (this.webSocketManager) {
      const message = JSON.stringify(event)
      for (const { client, info } of this.webSocketManager.getClients(
        sessionId
      )) {
        if (info.role === 'viewer' && this._isClientReady(client)) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            this.logger.error(
              `Error broadcasting ${eventType} to WS viewer: ${error.message}`
            )
          }
        }
      }
    }

    this.logger.debug(
      { sessionId },
      `Broadcasted controller_connection (connected=${isConnected}) to ${sentCount} viewers`
    )

    return sentCount > 0
  }

  broadcastViewerConnection(sessionId, isConnected, screenSize = null) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    const event = {
      type: 'viewer_status',
      timestamp: Date.now(),
      payload: {
        connected: isConnected,
        viewerConnected: isConnected,
        screenSize: screenSize || session.viewerScreenSize
      }
    }

    let sentCount = 0

    if (this.webSocketManager) {
      const message = JSON.stringify(event)
      for (const { client, info } of this.webSocketManager.getClients(
        sessionId
      )) {
        if (info.role === 'controller' && this._isClientReady(client)) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            this.logger.error(
              `Error broadcasting viewer_status to WS controller: ${error.message}`
            )
          }
        }
      }
    }

    this.logger.debug(
      { sessionId },
      `Broadcasted viewer_connection (connected=${isConnected}) to ${sentCount} controllers`
    )

    return sentCount > 0
  }

  /**
   * Рассылает обновление языка всем клиентам сессии
   * @param {string} sessionId - ID сессии
   * @param {string} language - Код языка
   */
  broadcastLanguageUpdate(sessionId, language) {
    const eventData = {
      type: 'language_updated',
      timestamp: Date.now(),
      payload: {
        language
      }
    }

    let sentCount = 0

    if (this.webSocketManager) {
      const message = JSON.stringify(eventData)
      for (const { client } of this.webSocketManager.getClients(sessionId)) {
        if (this._isClientReady(client)) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            this.logger.error(
              `Error broadcasting language_updated to WS client: ${error.message}`
            )
          }
        }
      }
    }

    if (sentCount > 0) {
      this.logger.debug(
        { sessionId },
        `Broadcasted language_updated to ${sentCount} clients`
      )
    }
  }

  /**
   * Рассылает событие активации аудио вьювером только контроллерам
   * @param {string} sessionId - ID сессии
   * @param {boolean} activated - Активировано ли аудио
   */
  broadcastViewerAudioActivated(sessionId, activated) {
    const eventData = {
      type: 'viewer_audio_activated',
      timestamp: Date.now(),
      payload: {
        activated,
        timestamp: Date.now()
      }
    }

    let sentCount = 0

    if (this.webSocketManager) {
      const message = JSON.stringify(eventData)
      for (const { client, info } of this.webSocketManager.getClients(
        sessionId
      )) {
        if (info.role === 'controller' && this._isClientReady(client)) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            this.logger.error(
              `Error broadcasting viewer_audio_activated to WS controller: ${error.message}`
            )
          }
        }
      }
    }

    if (sentCount > 0) {
      this.logger.debug(
        { sessionId },
        `Broadcasted viewer_audio_activated (activated=${activated}) to ${sentCount} controllers`
      )
    }
  }

  _isClientReady(client) {
    return client?.readyState === 1 // WebSocket.OPEN
  }

  /**
   * Graceful shutdown — stops the delta cleanup interval
   */
  destroy() {
    if (this._deltaCleanupInterval) {
      clearInterval(this._deltaCleanupInterval)
      this._deltaCleanupInterval = null
    }
    this._lastBroadcastedState.clear()
  }

  /**
   * Удаляет delta cache для сессии при её очистке (вызывается из SessionService)
   * @param {string} sessionId
   */
  clearDeltaCache(sessionId) {
    this._lastBroadcastedState.delete(sessionId)
  }

  /**
   * Периодическая очистка stale записей из delta cache
   * Удаляет записи старше 10 минут (сессия уже мертва но cache остался)
   * @private
   */
  _cleanupStaleDeltaEntries() {
    const now = Date.now()
    const MAX_AGE = 10 * 60 * 1000 // 10 минут
    let removedCount = 0

    for (const [sessionId] of this._lastBroadcastedState) {
      const session = this.sessionRepository.findById(sessionId)
      if (!session || now - session.lastActivity > MAX_AGE) {
        this._lastBroadcastedState.delete(sessionId)
        removedCount++
      }
    }

    if (removedCount > 0) {
      this.logger.debug(
        { removedCount, remainingSize: this._lastBroadcastedState.size },
        'Delta cache cleanup'
      )
    }
  }
}

module.exports = BroadcastService
