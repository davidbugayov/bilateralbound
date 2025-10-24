const { WebSocketServer } = require('ws')
const { logger, DEBUG_MODE } = require('../logger.js')

function setupWebSocketServer(server, sessionManager) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const sessionId = url.searchParams.get('sessionId')
    const role = url.searchParams.get('role')

    if (!sessionId || !role) {
      ws.close(1008, 'Session ID and role are required')
      return
    }

    // Гарантируем существование сессии для постоянных ссылок
    const ensured = sessionManager.findOrCreateSession(sessionId)
    if (!ensured) {
      ws.close(1008, 'Invalid session id')
      return
    }

    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    sessionManager.handleWebSocketConnection(ws, sessionId, role)

    const messageHandlers = {
      controller_connected: (data, { sessionId, role }) => {
        if (role === 'controller') {
          const clients = sessionManager.webSocketManager.getClients(sessionId)
          for (const { client } of clients) {
            if (client !== ws && client.readyState === 1) {
              try {
                client.send(
                  JSON.stringify({
                    type: 'controller_connected',
                    payload: {
                      controllerConnected: true,
                      timestamp: data.timestamp,
                      sessionId: data.sessionId
                    },
                    timestamp: Date.now()
                  })
                )
              } catch (error) {
                logger.error(`Error sending controller_connected: ${error.message}`)
              }
            }
          }
        }
      },
      viewer_connected: (data, { sessionId, role }) => {
        if (role === 'viewer') {
          const clients = sessionManager.webSocketManager.getClients(sessionId)
          for (const { client } of clients) {
            if (client !== ws && client.readyState === 1) {
              try {
                client.send(
                  JSON.stringify({
                    type: 'viewer_connected',
                    payload: {
                      viewerConnected: true,
                      timestamp: data.timestamp,
                      sessionId: data.sessionId
                    },
                    timestamp: Date.now()
                  })
                )
              } catch (error) {
                logger.error(`Error sending viewer_connected: ${error.message}`)
              }
            }
          }
        }
      },
      controller_update: (data, { sessionId, role }) => {
        if (role === 'controller') {
          sessionManager.updateBallState(sessionId, data.payload)
        }
      }
    }

    ws.on('message', message => {
      try {
        const clientInfo = sessionManager.getClientInfo(ws)
        if (!clientInfo) return

        const data = JSON.parse(message)
        if (data.type === 'heartbeat') return

        if (DEBUG_MODE) {
          logger.logSession(
            clientInfo.sessionId,
            `[MSG IN] ${clientInfo.role}:${data.type}`,
            'debug'
          )
        }

        const handler = messageHandlers[data.type]
        if (handler) {
          handler(data, clientInfo)
        }
      } catch (error) {
        const clientInfoForError = sessionManager.getClientInfo(ws)
        const sid = clientInfoForError ? clientInfoForError.sessionId : 'unknown'
        if (DEBUG_MODE) logger.error(`WebSocket error from session ${sid}: ${error.message}`)
      }
    })

    ws.on('close', () => {
      sessionManager.handleWebSocketDisconnection(ws)
      // Рассылаем событие об отключении контроллера всем оставшимся клиентам
      const clientInfo = sessionManager.getClientInfo(ws)
      if (clientInfo?.role === 'controller') {
        // Получаем всех клиентов сессии
        const clients = sessionManager.webSocketManager.getClients(sessionId)
        for (const { client } of clients) {
          if (client !== ws && client.readyState === 1) {
            try {
              client.send(
                JSON.stringify({
                  type: 'controller_disconnected',
                  payload: { controllerConnected: false },
                  timestamp: Date.now()
                })
              )
            } catch (error) {
              logger.error(`Error sending controller_disconnected: ${error.message}`)
            }
          }
        }
      }
    })

    ws.on('error', error => {
      logger.error(`WebSocket error for session ${sessionId}: ${error.message}`)
    })
  })

  const heartbeatInterval = setInterval(function ping() {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    }
  }, 30000)

  return { wss, heartbeatInterval }
}

module.exports = setupWebSocketServer
