'use strict';
const { logger, DEBUG_MODE } = require('../logger.js');

class StateBroadcaster {
  constructor(sessionRepository, webSocketManager, options = {}) {
    this.sessionRepository = sessionRepository;
    this.webSocketManager = webSocketManager;
    this.logger = logger;
    this.clientSimulationOnly = options.clientSimulationOnly === true;
    // Храним последнее отправленное состояние для delta compression
    this._lastBroadcastedState = new Map(); // sessionId -> lastState
  }

  _buildStatePayload(session, stateType, payloadOverride = null, options = {}) {
    if (payloadOverride) {
      return {
        ...payloadOverride,
        viewerScreenSize: session.viewerScreenSize,
        clientSimulationOnly: this.clientSimulationOnly,
      };
    }

    const basePayload = {
      ...session.ballState,
      viewerScreenSize: session.viewerScreenSize,
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected,
    };

    if (this.clientSimulationOnly) {
      basePayload.clientSimulationOnly = true;
    }

    // Delta compression: отправляем только изменившиеся поля
    if (
      options.deltaCompression &&
      this._lastBroadcastedState.has(session.id)
    ) {
      return this._getDeltaPayload(session.id, basePayload);
    }

    return basePayload;
  }

  /**
   * Возвращает только изменившиеся поля по сравнению с последним broadcast
   * Всегда включаем x, y, vx, vy для плавной интерполяции, остальное — только если изменилось
   * @private
   */
  _getDeltaPayload(sessionId, currentPayload) {
    const lastState = this._lastBroadcastedState.get(sessionId);
    const delta = {
      // Всегда отправляем позицию и скорость для интерполяции
      x: currentPayload.x,
      y: currentPayload.y,
      vx: currentPayload.vx,
      vy: currentPayload.vy,
    };

    // Остальные поля — только если изменились
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
    ];

    for (const field of fieldsToCheck) {
      if (currentPayload[field] !== lastState[field]) {
        delta[field] = currentPayload[field];
      }
    }

    // viewerScreenSize — проверяем глубоко
    if (
      JSON.stringify(currentPayload.viewerScreenSize) !==
      JSON.stringify(lastState.viewerScreenSize)
    ) {
      delta.viewerScreenSize = currentPayload.viewerScreenSize;
    }

    return delta;
  }

  broadcastState(sessionId, options = {}) {
    const stateType = options.stateType || 'state_update';
    const payload = options.payload || null;

    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }

    const fullPayload = this._buildStatePayload(
      session,
      stateType,
      payload,
      options,
    );

    const eventData = {
      type: stateType,
      timestamp: Date.now(),
      payload: fullPayload,
    };

    let sentCount = 0;

    if (this.webSocketManager) {
      const message = JSON.stringify(eventData);
      for (const { client } of this.webSocketManager.getClients(sessionId)) {
        if (this._isClientReady(client)) {
          try {
            client.send(message);
            sentCount++;
          } catch (error) {
            this.logger.error(
              `Error broadcasting to WS client: ${error.message}`,
            );
          }
        }
      }
    }

    // Сохраняем состояние для следующей delta compression
    if (options.deltaCompression) {
      this._lastBroadcastedState.set(sessionId, { ...session.ballState });
    }

    if (sentCount > 0 && DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted ${stateType} to ${sentCount} clients${options.deltaCompression ? ' (delta)' : ''}`,
      );
    }

    return sentCount > 0;
  }

  broadcastViewerStatus(sessionId) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }
    return this.broadcastState(sessionId, {
      stateType: 'viewer_status',
      payload: {
        connected: session.viewerConnected,
        viewerConnected: session.viewerConnected,
        controllerConnected: session.controllerConnected,
        screenSize: session.viewerScreenSize,
      },
    });
  }

  broadcastInitialState(sessionId, client, currentState) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }

    const ballState = currentState || session.ballState;
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
        language: session.language || 'en',
      },
    };

    if (this._isClientReady(client)) {
      try {
        client.send(JSON.stringify(initialState));
        this.logger.logSession(sessionId, 'Sent initial_state to WS client');
        return true;
      } catch (error) {
        this.logger.error(`Error sending initial state: ${error.message}`);
        return false;
      }
    }

    return false;
  }

  broadcastControllerConnection(sessionId, isConnected) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }

    const eventType = isConnected
      ? 'controller_connected'
      : 'controller_disconnected';
    const event = {
      type: eventType,
      timestamp: Date.now(),
      payload: {
        controllerConnected: isConnected,
      },
    };

    let sentCount = 0;

    if (this.webSocketManager) {
      const message = JSON.stringify(event);
      for (const { client, info } of this.webSocketManager.getClients(
        sessionId,
      )) {
        if (info.role === 'viewer' && this._isClientReady(client)) {
          try {
            client.send(message);
            sentCount++;
          } catch (error) {
            this.logger.error(
              `Error broadcasting ${eventType} to WS viewer: ${error.message}`,
            );
          }
        }
      }
    }

    if (DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted controller_connection (connected=${isConnected}) to ${sentCount} viewers`,
      );
    }

    return sentCount > 0;
  }

  broadcastViewerConnection(sessionId, isConnected, screenSize = null) {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }

    const event = {
      type: 'viewer_status',
      timestamp: Date.now(),
      payload: {
        connected: isConnected,
        viewerConnected: isConnected,
        screenSize: screenSize || session.viewerScreenSize,
      },
    };

    let sentCount = 0;

    if (this.webSocketManager) {
      const message = JSON.stringify(event);
      for (const { client, info } of this.webSocketManager.getClients(
        sessionId,
      )) {
        if (info.role === 'controller' && this._isClientReady(client)) {
          try {
            client.send(message);
            sentCount++;
          } catch (error) {
            this.logger.error(
              `Error broadcasting viewer_status to WS controller: ${error.message}`,
            );
          }
        }
      }
    }

    if (DEBUG_MODE) {
      this.logger.logSession(
        sessionId,
        `Broadcasted viewer_connection (connected=${isConnected}) to ${sentCount} controllers`,
      );
    }

    return sentCount > 0;
  }

  _isClientReady(client) {
    return client?.readyState === 1; // WebSocket.OPEN
  }
}

module.exports = StateBroadcaster;
