'use strict'

const { clearStateCache } = require('../network/middleware')

function registerSessionRoutes(
  app,
  sessionService,
  apiCache,
  analytics,
  { requireSession, logger }
) {
  // Health check (from expressApp L466-474)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      sessions: sessionService.getSessionCount(),
      uptime: process.uptime()
    })
  })

  // Analytics endpoint — localhost only (from expressApp L477-489)
  app.get('/api/analytics', (req, res) => {
    const remoteAddr = req.socket?.remoteAddress
    const isLocal =
      remoteAddr === '127.0.0.1' ||
      remoteAddr === '::1' ||
      remoteAddr === '::ffff:127.0.0.1'
    if (!isLocal) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const count = sessionService.getSessionCount()
    analytics.updatePeak(count)
    res.json(analytics.getStats(count))
  })

  // Create session (from expressApp L686-699)
  app.post('/api/session', async (req, res) => {
    try {
      const session = await sessionService.createSession()
      logger.debug(
        { sessionId: session.id, requestId: req.id },
        'New session created'
      )
      res.json({ sessionId: session.id })
    } catch (error) {
      logger.error({ err: error, requestId: req.id }, 'Error creating session')
      analytics.recordSessionError('unknown', 'session_create_error')
      res.status(500).json({ error: error.message, requestId: req.id })
    }
  })

  // Reserve/create permanent link — idempotent (from expressApp L701-723)
  app.post('/api/session/:sessionId/reserve', (req, res) => {
    const { sessionId } = req.params
    try {
      const session = sessionService.findOrCreateSession(sessionId)
      if (!session) {
        return res
          .status(400)
          .json({ error: 'Invalid session id', requestId: req.id })
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`
      res.json({
        sessionId: session.id,
        viewerUrl: `${baseUrl}/s/${session.id}`,
        controllerUrl: `${baseUrl}/c/${session.id}`
      })
    } catch (error) {
      logger.error(
        { err: error, requestId: req.id },
        'Error reserving session'
      )
      analytics.recordSessionError(sessionId, 'session_reserve_error')
      res.status(500).json({ error: error.message, requestId: req.id })
    }
  })

  // Get session info (from expressApp L724-738)
  app.get('/api/session/:sessionId', requireSession, (req, res) => {
    const session = req.session
    res.json({
      id: session.id,
      controllerConnected: session.controllerConnected,
      viewerConnected: session.viewerConnected,
      language: session.language,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    })
  })

  // Get session state with apiCache (from expressApp L739-778)
  app.get('/api/session/:sessionId/state', requireSession, (req, res) => {
    const { sessionId } = req.params
    const session = req.session
    const cacheKey = `state_${sessionId}`
    const cached = apiCache.get(cacheKey)
    const adaptiveTTL = 50
    if (cached && Date.now() - cached.timestamp < adaptiveTTL) {
      res.set('X-Cache-Status', 'HIT')
      return res.json(cached.data)
    }

    const responseData = {
      ...session.ballState,
      viewerConnected: session.viewerConnected,
      controllerConnected: session.controllerConnected,
      viewerScreenSize: session.viewerScreenSize
    }
    // Normalize direction vx/vy briefly after screen size change for API stability
    if (
      session.normalizeDirectionUntilTs &&
      Date.now() < session.normalizeDirectionUntilTs
    ) {
      const clamp01 = (v) =>
        Math.max(-1, Math.min(1, typeof v === 'number' ? v : 0))
      responseData.vx = clamp01(responseData.vx)
      responseData.vy = clamp01(responseData.vy)
    }

    apiCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
      type: 'ball_state'
    })
    res.set('X-Cache-Status', 'MISS')
    res.json(responseData)
  })

  // Controller connect (from expressApp L779-794)
  app.post(
    '/api/session/:sessionId/controller/connect',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      sessionService.updateBallState(sessionId, req.body)
      const session = req.session
      session.controllerConnected = true
      clearStateCache(apiCache, sessionId)

      sessionService.broadcast.broadcastControllerConnection(sessionId, true)

      res.json({ success: true, message: 'Controller connected' })
    }
  )

  // Controller update (from expressApp L797-815)
  app.post(
    '/api/session/:sessionId/controller/update',
    requireSession,
    (req, res) => {
      const { sessionId } = req.params
      const updates = req.body

      const success = sessionService.updateBallState(sessionId, updates)

      if (success) {
        clearStateCache(apiCache, sessionId)
        res.json({ success: true })
      } else {
        res.status(400).json({ error: 'Failed to update ball state' })
      }
    }
  )

  // Set language (from expressApp L917-939)
  app.post('/api/session/:sessionId/language', requireSession, (req, res) => {
    const { sessionId } = req.params
    const { language } = req.body || {}

    if (typeof language !== 'string' || !/^[a-z]{2,5}$/.test(language)) {
      return res
        .status(400)
        .json({ error: 'Invalid language code', requestId: req.id })
    }

    const success = sessionService.setLanguage(sessionId, language)
    if (!success) {
      return res
        .status(500)
        .json({ error: 'Failed to set language', requestId: req.id })
    }

    return res.json({ success: true, language })
  })
}

module.exports = { registerSessionRoutes }
