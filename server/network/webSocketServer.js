const { WebSocketServer } = require('ws')
const { logger, DEBUG_MODE } = require('../logger.js')

function setupWebSocketServer (server, sessionManager) {
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
    ws.on('pong', () => { ws.isAlive = true })

    sessionManager.handleWebSocketConnection(ws, sessionId, role)

    ws.on('message', message => {
      try {
        const clientInfo = sessionManager.getClientInfo(ws)
        if (!clientInfo) return

        const { sessionId, role } = clientInfo
        const data = JSON.parse(message)

        if (data.type === 'heartbeat') return

        if (DEBUG_MODE) {
          logger.logSession(sessionId, `[MSG IN] ${role}:${data.type}`, 'debug')
        }

        if (role === 'controller' && data.type === 'controller_update') {
          sessionManager.updateBallState(sessionId, data.payload)
        }
      } catch (error) {
        const clientInfoForError = sessionManager.getClientInfo(ws)
        const sid = clientInfoForError ? clientInfoForError.sessionId : 'unknown'
        if (DEBUG_MODE) logger.error(`WebSocket error from session ${sid}: ${error.message}`)
      }
    })

    ws.on('close', () => {
      sessionManager.handleWebSocketDisconnection(ws)
    })

    ws.on('error', (error) => {
      logger.error(`WebSocket error for session ${sessionId}: ${error.message}`)
    })
  })

  const heartbeatInterval = setInterval(function ping () {
    wss.clients.forEach(function each (ws) {
      if (ws.isAlive === false) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)

  return { wss, heartbeatInterval }
}

module.exports = setupWebSocketServer
