'use strict'

const path = require('node:path')
const express = require('express')

function registerStaticRoutes(
  app,
  sessionService,
  localizationService,
  { setNoCacheHeaders, logger }
) {
  const publicPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'web-client',
    'public'
  )

  // Root route - serve cached index.html with localized meta tags (from expressApp L456-463)
  app.get('/', (req, res) => {
    const html = localizationService.getLocalizedHtml('index', req, null)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    setNoCacheHeaders(res)
    res.send(html)
  })

  // Static files - only serve specific paths (from expressApp L617-631)
  // Assets use ?v=version query params → safe for immutable long-term cache
  const staticDirectories = ['css', 'js', 'dist', 'emdr-therapy', 'fonts', 'sounds']
  for (const dir of staticDirectories) {
    app.use(
      `/${dir}`,
      express.static(path.join(publicPath, dir), {
        etag: true,
        lastModified: true,
        setHeaders: (res) => {
          if (dir === 'dist') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        }
      })
    )
  }

  // Catch-all for other static files (but not index.html) (from expressApp L634-653)
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/emdr-therapy/')
    ) {
      return next()
    }

    express.static(publicPath, {
      index: false,
      etag: false,
      lastModified: false,
      setHeaders: setNoCacheHeaders
    })(req, res, next)
  })

  // Test file serving (from expressApp L654)
  app.use('/test', express.static(path.join(__dirname, '..', '..')))

  // Privacy page (client-side i18n, no server-side localization needed)
  app.get('/privacy', (req, res) => {
    const publicPath = path.join(__dirname, '..', '..', '..', 'web-client', 'public')
    res.sendFile(path.join(publicPath, 'privacy.html'))
  })

  // Public offer page (client-side i18n, no server-side localization needed)
  app.get('/offer', (req, res) => {
    const publicPath = path.join(__dirname, '..', '..', '..', 'web-client', 'public')
    res.sendFile(path.join(publicPath, 'offer.html'))
  })

  // Viewer HTML (from expressApp L941-949)
  app.get('/s/:sessionId', (req, res) => {
    const session = sessionService.getSession(req.params.sessionId)
    const html = localizationService.getLocalizedHtml('viewer', req, session)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    setNoCacheHeaders(res)
    res.send(html)
  })

  // Controller HTML (from expressApp L950-959)
  app.get('/c/:sessionId', (req, res) => {
    const session = sessionService.getSession(req.params.sessionId)
    const html = localizationService.getLocalizedHtml(
      'controller',
      req,
      session
    )
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    setNoCacheHeaders(res)
    res.send(html)
  })

  // Test file with path traversal guard (from expressApp L966-1005)
  app.get('/test/:file', (req, res) => {
    const file = req.params.file
    if (!file || typeof file !== 'string') {
      return res
        .status(400)
        .json({ error: 'Invalid file parameter', requestId: req.id })
    }
    if (
      file.includes('..') ||
      file.includes('/') ||
      file.includes('\\') ||
      file.includes('\0')
    ) {
      return res
        .status(400)
        .json({ error: 'Invalid file name', requestId: req.id })
    }
    const allowedExtensions = ['.html', '.css', '.js', '.json', '.txt', '.md']
    const fileExt = path.extname(file).toLowerCase()
    if (!allowedExtensions.includes(fileExt)) {
      return res
        .status(400)
        .json({ error: 'File type not allowed', requestId: req.id })
    }
    const safePath = path.resolve(__dirname, '..', '..', 'test', file)
    const testDir = path.resolve(__dirname, '..', '..', 'test')
    if (!safePath.startsWith(testDir)) {
      return res
        .status(403)
        .json({ error: 'Access denied', requestId: req.id })
    }

    res.sendFile(safePath)
  })

  // 404 handler (from expressApp L1007-1011)
  app.use((req, res) => {
    res
      .status(404)
      .json({ error: 'Not Found', path: req.path, requestId: req.id })
  })

  // Centralized error handler (from expressApp L1013-1021)
  app.use((err, req, res, _next) => {
    const status = err.status || 500
    const message = err.message || 'Internal Server Error'
    logger.error({ err, requestId: req.id }, `${status} ${message}`)
    res.status(status).json({ error: message, requestId: req.id })
  })
}

module.exports = { registerStaticRoutes }
