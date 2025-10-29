'use strict'
const { logger, DEBUG_MODE } = require('../logger.js')
// Интерфейс для рассылки состояния клиентам
class StateBroadcaster {
  constructor(sessionRepository, webSocketManager) {
    this.sessionRepository = sessionRepository
    this.webSocketManager = webSocketManager
    this.logger = logger
  }

  broadcastState(sessionId, stateType = 'state_update', payload = null) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false
    const message = JSON.stringify({
      type: stateType,
      timestamp: Date.now(),
      payload: payload || { ...session.ballState, viewerScreenSize: session.viewerScreenSize }
    })
    let sentCount = 0
    for (const { client } of this.webSocketManager.getClients(sessionId)) {
      if (this._isClientReady(client)) {
        try {
          client.send(message)
          sentCount++
        } catch (error) {
          this.logger.error(`Error broadcasting to client: ${error.message}`)
        }
      }
    }

    if (sentCount > 0 && DEBUG_MODE) {
      // Логируем только в DEBUG режиме для производительности
      this.logger.logSession(sessionId, `Broadcasted ${stateType} to ${sentCount} clients`)
    }

    return sentCount > 0
  }

  broadcastViewerStatus(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false
    return this.broadcastState(sessionId, 'viewer_status', {
      connected: session.viewerConnected,
      screenSize: session.viewerScreenSize
    })
  }

  broadcastInitialState(sessionId, client, currentState) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) return false
    // Используем переданное состояние, если оно есть, иначе берем из сессии
    const ballState = currentState || session.ballState
    const initialState = {
      type: 'initial_state',
      timestamp: Date.now(),
      payload: {
        ...ballState,
        viewerConnected: session.viewerConnected,
        controllerConnected: session.controllerConnected,
        viewerScreenSize: session.viewerScreenSize
      }
    }

    if (this._isClientReady(client)) {
      try {
        client.send(JSON.stringify(initialState))
        this.logger.logSession(sessionId, 'Sent initial_state to client')
        return true
      } catch (error) {
        this.logger.error(`Error sending initial state: ${error.message}`)
        return false
      }
    }

    return false
  }

  _isClientReady(client) {
    return client?.readyState === 1 // WebSocket.OPEN
  }
}

module.exports = StateBroadcaster
