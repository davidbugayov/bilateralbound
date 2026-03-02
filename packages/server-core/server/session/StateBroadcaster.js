'use strict'
const { logger, DEBUG_MODE } = require('../logger.js')

class StateBroadcaster {
  constructor(sessionRepository, webSocketManager, options = {}) {
    this.sessionRepository = sessionRepository
    this.webSocketManager = webSocketManager
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

    if (this.webSocketManager) {
      const message = JSON.stringify(eventData)
      for (const { client } of this.webSocketManager.getClients(sessionId)) {
        if (this._isClientReady(client)) {
          try {
            client.send(message)
            sentCount++
          } catch (error) {
            this.logger.error(
              `Error broadcasting to WS client: ${error.message}`
            )
          }
        }
      }
    }

    if (sentCount > 0 && DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted ${stateType} to ${sentCount} clients`
      )
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
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected,
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
        viewerAudioActivated: session.viewerAudioActivated || false,
        clientSimulationOnly: this.clientSimulationOnly,
        language: session.language || 'en'
      }
    }

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

    if (DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted controller_connection (connected=${isConnected}) to ${sentCount} viewers`
      )
    }

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

    if (DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted viewer_connection (connected=${isConnected}) to ${sentCount} controllers`
      )
    }

    return sentCount > 0
  }

  _isClientReady(client) {
    return client?.readyState === 1 // WebSocket.OPEN
  }
}

module.exports = StateBroadcaster
