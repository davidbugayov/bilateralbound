'use strict'
const { logger, DEBUG_MODE } = require('../logger.js')
// Интерфейс для рассылки состояния клиентам (поддержка SSE и WebSocket)
class StateBroadcaster {
  constructor(sessionRepository, webSocketManager, sseManager = null, options = {}) {
    this.sessionRepository = sessionRepository
    this.webSocketManager = webSocketManager
    this.sseManager = sseManager
    this.logger = logger
    this.clientSimulationOnly = options.clientSimulationOnly === true
  }

  _buildStatePayload(session, stateType, payloadOverride = null) {
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

    if (this.clientSimulationOnly && stateType === 'state_update') {
      // Remove position/velocity to avoid corrupting client-side simulation
      delete basePayload.x
      delete basePayload.y
      delete basePayload.vx
      delete basePayload.vy
    }

    if (this.clientSimulationOnly) {
      basePayload.clientSimulationOnly = true
    }


    return basePayload
  }

  broadcastState(sessionId, stateType = 'state_update', payload = null) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }

    const eventData = {
      type: stateType,
      timestamp: Date.now(),
      payload: this._buildStatePayload(session, stateType, payload)
    }

    let sentCount = 0

    // Рассылка через SSE (приоритет)
    if (this.sseManager) {
      sentCount += this.sseManager.broadcast(sessionId, stateType, eventData)
    }

    // Fallback на WebSocket для обратной совместимости
    if (this.webSocketManager) {
      const message = JSON.stringify(eventData)
      for (const { client } of this.webSocketManager.getClients(sessionId)) {
        if (this._isClientReady(client)) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            this.logger.error(`Error broadcasting to WS client: ${error.message}`)
          }
        }
      }
    }

    if (sentCount > 0 && DEBUG_MODE) {
      this.logger.logSession(sessionId, `Broadcasted ${stateType} to ${sentCount} clients`)
    }

    return sentCount > 0
  }

  broadcastViewerStatus(sessionId) {
    const session = this.sessionRepository.findById(sessionId)
    if (!session) {
      return false
    }
    return this.broadcastState(sessionId, 'viewer_status', {
      connected: session.viewerConnected,
      screenSize: session.viewerScreenSize
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
        clientSimulationOnly: this.clientSimulationOnly
      }
    }

    // Log what we're sending (TEMPORARY DEBUG)
    this.logger.logSession(
      sessionId,
      `Broadcasting initial_state with controllerConnected=${session.controllerConnected}`,
      'debug'
    )

    // Если client это SSE response объект
    if (client && typeof client.write === 'function') {
      try {
        const payload = JSON.stringify(initialState)
        client.write(`event: initial_state\ndata: ${payload}\n\n`)
        this.logger.logSession(sessionId, 'Sent initial_state to SSE client')
        return true
      } catch (error) {
        this.logger.error(`Error sending initial state via SSE: ${error.message}`)
        return false
      }
    }

    // Fallback на WebSocket
    if (this._isClientReady(client)) {
      try {
        client.send(JSON.stringify(initialState))
        this.logger.logSession(sessionId, 'Sent initial_state to WS client')
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
