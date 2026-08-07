'use strict'
const { WebSocketServer } = require('ws')

function setupWebSocketServer(
  server,
  sessionService,
  webSocketManager,
  broadcastService,
  analytics,
  logger,
  wsTokenService
) {
  // maxPayload: 4KB limit prevents memory exhaustion attacks
  const wss = new WebSocketServer({ server, maxPayload: 4096 })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `https://${req.headers.host}`)

    // Authenticate via HMAC-signed WS token (replaces insecure query-param role)
    let sessionId, role
    if (wsTokenService) {
      const token = url.searchParams.get('token')
      const decoded = wsTokenService.verify(token)
      if (!decoded) {
        logger.warn({ hasToken: !!token }, 'WS connection rejected: invalid or expired token')
        ws.close(4001, 'Unauthorized — invalid or expired token')
        return
      }
      sessionId = decoded.sessionId
      role = decoded.role
    } else {
      // Fallback for dev environments without WsTokenService
      sessionId = url.searchParams.get('sessionId')
      role = url.searchParams.get('role')
    }

    if (!sessionId || !role) {
      ws.close(1008, 'Session ID and role are required')
      return
    }

    // Validate role is one of the expected values
    if (role !== 'controller' && role !== 'viewer') {
      ws.close(1008, 'Invalid role')
      return
    }

    // Ensure session exists for permanent links
    const ensured = sessionService.findOrCreateSession(sessionId)
    if (!ensured) {
      ws.close(1008, 'Invalid session id')
      return
    }

    ws.isAlive = true
    ws._missedPings = 0
    ws.on('pong', () => {
      ws.isAlive = true
      ws._missedPings = 0
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
                logger.error(
                  { err: error },
                  'Error sending controller_connected'
                )
              }
            }
          }
        }
      },

      viewer_connected: (data) => {
        if (role === 'viewer') {
          // Save theme from viewer to session
          const theme = data.payload?.theme
          if (theme && (theme === 'dark' || theme === 'light')) {
            const session = sessionService.getSession(sessionId)
            if (session) {
              session.theme = theme
              logger.debug({ sessionId, theme }, 'Theme saved from viewer')
            }
          }

          // Save screen size from viewer reconnect — critical for preview sync
          const screenSize = data.payload?.screenSize
          if (screenSize && typeof screenSize.width === 'number' && typeof screenSize.height === 'number') {
            sessionService.setViewerScreenSize(sessionId, screenSize)
          }

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
                      sessionId,
                      theme,
                      screenSize
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

      // Bounce sync - viewer sends bounce event; relay direction only to controller.
      // Position is NOT relayed: both clients run local physics from the same params
      // and detect bounces independently. Position relay caused spring-damper jitter.
      bounce: (data) => {
        if (role === 'viewer') {
          const clients = webSocketManager.getClients(sessionId)
          // Direction-only bounce_sync to controller preview
          const bounceMessage = JSON.stringify({
            type: 'bounce_sync',
            payload: {
              side: data.payload.side,
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
          // Direction-only bounce_ack back to viewer
          const ackMessage = JSON.stringify({
            type: 'bounce_ack',
            payload: {
              side: data.payload.side,
              serverDirX: data.payload.dirX,
              serverDirY: data.payload.dirY,
              ts: Date.now()
            }
          })
          if (ws.readyState === 1) {
            try {
              ws.send(ackMessage)
            } catch (error) {
              logger.error({ err: error }, 'Error sending bounce_ack')
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
      handleWebSocketMessage(
        message,
        ws,
        webSocketManager,
        messageHandlers,
        analytics,
        logger
      )
    })

    ws.on('close', () => {
      handleWebSocketClose(
        ws,
        sessionId,
        role,
        sessionService,
        analytics,
        webSocketManager,
        logger
      )
    })

    ws.on('error', (error) => {
      logger.error({ err: error, sessionId }, 'WebSocket error')
      analytics.recordSessionError(sessionId, 'ws_error')
    })
  })

  // Allow up to 3 missed pings (90s grace period) before terminating.
  // This prevents false disconnects for mobile/bg tabs where timers are throttled.
  const MAX_MISSED_PINGS = 3
  const heartbeatInterval = setInterval(function ping() {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws._missedPings = (ws._missedPings || 0) + 1
        if (ws._missedPings > MAX_MISSED_PINGS) {
          logger.debug({ missedPings: ws._missedPings }, 'WS terminated after max missed pings')
          return ws.terminate()
        }
        // Still send a ping to give it one more chance
        try { ws.ping() } catch { /* ignore */ }
      } else {
        ws.isAlive = false
        try { ws.ping() } catch { /* ignore */ }
      }
    }
  }, 30000)

  return { wss, heartbeatInterval }
}

/**
 * Handles incoming WebSocket messages
 * @private
 */
function handleWebSocketMessage(
  message,
  ws,
  webSocketManager,
  messageHandlers,
  analytics,
  logger
) {
  try {
    const clientInfo = webSocketManager.getClientInfo(ws)
    if (!clientInfo) {
      return
    }

    const data = JSON.parse(message)
    if (data.type === 'heartbeat') {
      return
    }

    // Validate sessionId format in WS messages
    if (data.payload?.sessionId) {
      const ValidationUtils = require('../utils/validation')
      if (!ValidationUtils.validateSessionId(data.payload.sessionId)) {
        logger.warn({ sessionId: clientInfo.sessionId }, 'Invalid sessionId in WS message')
        return
      }
    }

    logger.debug(
      {
        sessionId: clientInfo.sessionId,
        role: clientInfo.role,
        type: data.type
      },
      'WS message received'
    )

    const handler = messageHandlers[data.type]
    if (handler) {
      handler(data)
    }
  } catch (error) {
    const clientInfoForError = webSocketManager.getClientInfo(ws)
    const sid = clientInfoForError ? clientInfoForError.sessionId : 'unknown'
    logger.error(
      { err: error, sessionId: sid },
      'WebSocket message processing error'
    )
    analytics.recordSessionError(sid, 'ws_message_error')
  }
}

/**
 * Handles WebSocket connection close
 * @private
 */
function handleWebSocketClose(
  ws,
  sessionId,
  role,
  sessionService,
  analyticsModule,
  webSocketManager,
  logger
) {
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

  sendDisconnectionNotification(
    sessionId,
    clientInfo,
    ws,
    webSocketManager,
    logger
  )
}

/**
 * Sends disconnection notification to remaining clients
 * @private
 */
function sendDisconnectionNotification(
  sessionId,
  clientInfo,
  ws,
  webSocketManager,
  logger
) {
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
    broadcastDisconnectionMessage(
      clients,
      ws,
      'viewer_status',
      {
        connected: false,
        viewerConnected: false
      },
      logger
    )
  }
}

/**
 * Broadcasts disconnection message to all ready clients
 * @private
 */
function broadcastDisconnectionMessage(
  clients,
  excludeWs,
  messageType,
  payload,
  logger
) {
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
