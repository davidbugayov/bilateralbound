'use strict'
const { WebSocketServer } = require('ws')

function setupWebSocketServer(server, sessionService, webSocketManager, broadcastService, analytics, logger) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `https://${req.headers.host}`)
    const sessionId = url.searchParams.get('sessionId')
    const role = url.searchParams.get('role')

    if (!sessionId || !role) {
      ws.close(1008, 'Session ID and role are required')
      return
    }

    // Ensure session exists for permanent links
    const ensured = sessionService.findOrCreateSession(sessionId)
    if (!ensured) {
      ws.close(1008, 'Invalid session id')
      return
    }

    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    sessionService.handleWebSocketConnection(ws, sessionId, role)

    if (role === 'viewer') {
      analytics.recordViewerConnected(sessionId)
    } else if (role === 'controller') {
      analytics.recordControllerConnected(sessionId)
    }

    const messageHandlers = {
      request_state_sync: () => {
        // CRITICAL FIX: Upon reconnection, send full state to restore ball position
        const session = sessionService.getSession(sessionId)
        if (session) {
          const initialState = {
            type: 'initial_state',
            timestamp: Date.now(),
            payload: {
              ...session.ballState,
              viewerConnected: session.viewerConnected,
              controllerConnected: session.controllerConnected,
              viewerScreenSize: session.viewerScreenSize
            }
          }
          try {
            ws.send(JSON.stringify(initialState))
            logger.info({ sessionId }, 'Sent state sync on reconnection')
          } catch (error) {
            logger.error({ err: error }, 'Error sending state sync')
          }
        }
      },

      controller_connected: () => {
        if (role === 'controller') {
          const clients = webSocketManager.getClients(sessionId)
          for (const { client } of clients) {
            if (client !== ws && client.readyState === 1) {
              try {
                client.send(
                  JSON.stringify({
                    type: 'controller_connected',
                    payload: {
                      controllerConnected: true,
                      timestamp: Date.now(),
                      sessionId
                    },
                    timestamp: Date.now()
                  })
                )
              } catch (error) {
                logger.error({ err: error }, 'Error sending controller_connected')
              }
            }
          }
        }
      },

      viewer_connected: () => {
        if (role === 'viewer') {
          const clients = webSocketManager.getClients(sessionId)
          for (const { client } of clients) {
            if (client !== ws && client.readyState === 1) {
              try {
                client.send(
                  JSON.stringify({
                    type: 'viewer_connected',
                    payload: {
                      viewerConnected: true,
                      timestamp: Date.now(),
                      sessionId
                    },
                    timestamp: Date.now()
                  })
                )
              } catch (error) {
                logger.error({ err: error }, 'Error sending viewer_connected')
              }
            }
          }
        }
      },

      viewer_audio_activated: (data) => {
        if (role === 'viewer') {
          const session = sessionService.getSession(sessionId)
          if (session) {
            session.viewerAudioActivated = data.payload?.activated ?? true
            broadcastService.broadcastViewerAudioActivated(
              sessionId,
              session.viewerAudioActivated
            )
          }
        }
      },

      controller_update: (data) => {
        if (role === 'controller') {
          sessionService.updateBallState(sessionId, data.payload)
        }
      },

      // Bounce sync - viewer sends ball position on bounce for controller preview sync
      bounce: (data) => {
        if (role === 'viewer') {
          const clients = webSocketManager.getClients(sessionId)
          const bounceMessage = JSON.stringify({
            type: 'bounce_sync',
            payload: {
              side: data.payload.side,
              x: data.payload.x,
              y: data.payload.y,
              dirX: data.payload.dirX,
              dirY: data.payload.dirY,
              timestamp: data.payload.timestamp
            }
          })
          for (const { client, info: clientInfo } of clients) {
            if (clientInfo.role === 'controller' && client.readyState === 1) {
              try {
                client.send(bounceMessage)
              } catch (error) {
                logger.error({ err: error }, 'Error sending bounce_sync')
              }
            }
          }
        }
      },

      viewer_screen_size: (data) => {
        if (role === 'viewer') {
          const { width, height } = data.payload || {}
          if (typeof width === 'number' && typeof height === 'number') {
            sessionService.setViewerScreenSize(sessionId, { width, height })
          }
        }
      },

      language: (data) => {
        const language = data.payload?.language
        if (language) {
          sessionService.setLanguage(sessionId, language)
        }
      },

      viewer_update: (data) => {
        if (role === 'viewer') {
          sessionService.updateBallState(sessionId, data.payload)
        }
      }
    }

    ws.on('message', (message) => {
      handleWebSocketMessage(message, ws, webSocketManager, messageHandlers, logger)
    })

    ws.on('close', () => {
      handleWebSocketClose(ws, sessionId, role, sessionService, analytics, webSocketManager, logger)
    })

    ws.on('error', (error) => {
      logger.error({ err: error, sessionId }, 'WebSocket error')
    })
  })

  const heartbeatInterval = setInterval(function ping() {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        return ws.terminate()
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30000)

  return { wss, heartbeatInterval }
}

/**
 * Handles incoming WebSocket messages
 * @private
 */
function handleWebSocketMessage(message, ws, webSocketManager, messageHandlers, logger) {
  try {
    const clientInfo = webSocketManager.getClientInfo(ws)
    if (!clientInfo) {
      return
    }

    const data = JSON.parse(message)
    if (data.type === 'heartbeat') {
      return
    }

    logger.debug(
      { sessionId: clientInfo.sessionId, role: clientInfo.role, type: data.type },
      'WS message received'
    )

    const handler = messageHandlers[data.type]
    if (handler) {
      handler(data)
    }
  } catch (error) {
    const clientInfoForError = webSocketManager.getClientInfo(ws)
    const sid = clientInfoForError ? clientInfoForError.sessionId : 'unknown'
    logger.error({ err: error, sessionId: sid }, 'WebSocket message processing error')
  }
}

/**
 * Handles WebSocket connection close
 * @private
 */
function handleWebSocketClose(ws, sessionId, role, sessionService, analyticsModule, webSocketManager, logger) {
  // Record analytics for disconnection
  if (role === 'viewer') {
    analyticsModule.recordViewerDisconnected()
  } else if (role === 'controller') {
    analyticsModule.recordControllerDisconnected()
  }

  // Capture client info BEFORE removing from registry
  const clientInfo = webSocketManager.getClientInfo(ws)
  sessionService.handleWebSocketDisconnection(ws)

  if (!clientInfo) return

  sendDisconnectionNotification(sessionId, clientInfo, ws, webSocketManager, logger)
}

/**
 * Sends disconnection notification to remaining clients
 * @private
 */
function sendDisconnectionNotification(sessionId, clientInfo, ws, webSocketManager, logger) {
  const clients = webSocketManager.getClients(sessionId)

  if (clientInfo.role === 'controller') {
    broadcastDisconnectionMessage(
      clients,
      ws,
      'controller_disconnected',
      { controllerConnected: false },
      logger
    )
  } else if (clientInfo.role === 'viewer') {
    broadcastDisconnectionMessage(clients, ws, 'viewer_status', {
      connected: false,
      viewerConnected: false
    }, logger)
  }
}

/**
 * Broadcasts disconnection message to all ready clients
 * @private
 */
function broadcastDisconnectionMessage(clients, excludeWs, messageType, payload, logger) {
  const msg = JSON.stringify({
    type: messageType,
    payload,
    timestamp: Date.now()
  })

  for (const { client } of clients) {
    if (client !== excludeWs && client.readyState === 1) {
      try {
        client.send(msg)
      } catch (error) {
        logger.error({ err: error }, `Error sending ${messageType}`)
      }
    }
  }
}

module.exports = { setupWebSocketServer }
