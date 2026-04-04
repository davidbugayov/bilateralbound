'use strict'

const { clearStateCache } = require('../network/middleware')

function registerViewerRoutes(
  app,
  sessionService,
  webSocketManager,
  broadcastService,
  { requireSession, logger }
) {
  // Viewer update (from expressApp L816-828)
  app.post(
    '/api/session/:sessionId/viewer/update',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      sessionService.updateBallState(sessionId, req.body)

      // Broadcast update to all WebSocket clients
      broadcastService.broadcastState(sessionId)

      res.json({ success: true, message: 'Viewer update processed' })
    }
  )

  // Audio activated notification (from expressApp L831-851)
  app.post(
    '/api/session/:sessionId/viewer/audio-activated',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      const session = req.session

      session.viewerAudioActivated = req.body?.activated ?? true

      // Use dedicated broadcastViewerAudioActivated instead of broadcastState with 3 args
      broadcastService.broadcastViewerAudioActivated(
        sessionId,
        session.viewerAudioActivated
      )

      res.json({ success: true })
    }
  )

  // Bounce sync - viewer sends ball position for controller preview sync (from expressApp L852-879)
  app.post(
    '/api/session/:sessionId/viewer/bounce',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      const { side, x, y, dirX, dirY, timestamp } = req.body || {}

      // Broadcast bounce_sync to controllers via WebSocket
      const bounceMessage = JSON.stringify({
        type: 'bounce_sync',
        payload: { side, x, y, dirX, dirY, timestamp }
      })
      for (const { client, info } of webSocketManager.getClients(sessionId)) {
        if (info.role === 'controller' && client.readyState === 1) {
          try {
            client.send(bounceMessage)
          } catch {
            /* ignore */
          }
        }
      }

      res.json({ success: true })
    }
  )

  // Viewer connect (from expressApp L880-898)
  app.post(
    '/api/session/:sessionId/viewer/connect',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      const { screenSize } = req.body
      const session = req.session
      session.viewerConnected = true

      if (screenSize) {
        sessionService.setViewerScreenSize(sessionId, screenSize)
        clearStateCache(sessionService.apiCache, sessionId)
      }

      broadcastService.broadcastViewerConnection(sessionId, true, screenSize)

      res.json({ success: true, message: 'Viewer connected' })
    }
  )

  // Viewer screen size (from expressApp L899-916)
  app.post(
    '/api/session/:sessionId/viewer/screen-size',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      const { width, height } = req.body || {}

      if (typeof width === 'number' && typeof height === 'number') {
        sessionService.setViewerScreenSize(sessionId, { width, height })
        clearStateCache(sessionService.apiCache, sessionId)
        return res.json({ success: true })
      }

      return res
        .status(400)
        .json({ error: 'Invalid screen size', requestId: req.id })
    }
  )
}

module.exports = { registerViewerRoutes }
