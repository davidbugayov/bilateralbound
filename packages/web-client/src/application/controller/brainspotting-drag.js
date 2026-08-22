'use strict'
/**
 * Brainspotting drag — manual ball positioning via mouse/touch on preview canvas.
 * The ball smoothly chases the cursor (no teleporting) and the current
 * position is streamed to the server so the viewer mirrors the motion.
 *
 * The chase + streaming loop runs on setInterval, NOT requestAnimationFrame:
 * rAF is paused in background tabs (and in some headless environments), which
 * would freeze the ball and stop position sync. setInterval keeps working.
 * @module application/controller/brainspotting-drag
 */

let _deps = {}
let _dragActive = false
let _target = null
let _throttleTs = 0
let _lastSentX = null
let _lastSentY = null
let _intervalId = null

function init(deps) {
  _deps = deps
}

function enable() {
  if (_dragActive) return
  const canvas = document.getElementById('preview')
  if (!canvas) return
  _dragActive = true
  _lastSentX = null
  _lastSentY = null

  const handleMove = (clientX, clientY) => {
    const engine = _deps.getPreviewPhysicsEngine?.()
    if (!engine || !engine.ball.brainspotting) return
    const rect = canvas.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * engine.options.worldWidth
    const y = ((clientY - rect.top) / rect.height) * engine.options.worldHeight
    const r = engine.ball.radius
    _target = {
      x: Math.max(r, Math.min(x, engine.options.worldWidth - r)),
      y: Math.max(r, Math.min(y, engine.options.worldHeight - r))
    }
  }

  canvas._bsMouseMove = (e) => handleMove(e.clientX, e.clientY)
  canvas._bsTouchMove = (e) => {
    if (e.touches.length > 0) {
      e.preventDefault()
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    }
  }

  canvas.addEventListener('mousemove', canvas._bsMouseMove)
  canvas.addEventListener('touchmove', canvas._bsTouchMove, { passive: false })

  // Chase the cursor target and stream the animated position to the server.
  // Runs on an interval so it works even when the render loop (rAF) is
  // throttled or paused in a background tab / headless environment.
  const intervalMs = 33
  const chaseFactor = 1 - Math.exp(-(intervalMs / 1000) * 12) // ~0.33 per tick
  _intervalId = setInterval(() => {
    const engine = _deps.getPreviewPhysicsEngine?.()
    if (!engine || !engine.ball.brainspotting || !_target) return

    const dx = _target.x - engine.ball.x
    const dy = _target.y - engine.ball.y
    const dist = Math.hypot(dx, dy)

    if (dist <= 1) {
      engine.ball.x = _target.x
      engine.ball.y = _target.y
      _target = null
      return
    }

    engine.ball.x += dx * chaseFactor
    engine.ball.y += dy * chaseFactor

    const now = performance.now()
    const moved =
      _lastSentX === null ||
      Math.abs(engine.ball.x - _lastSentX) > 0.5 ||
      Math.abs(engine.ball.y - _lastSentY) > 0.5
    if (moved && now - _throttleTs > 50) {
      _throttleTs = now
      _lastSentX = engine.ball.x
      _lastSentY = engine.ball.y
      _deps.safeSend?.(globalThis.WS_MSG?.controllerUpdate, {
        x: engine.ball.x,
        y: engine.ball.y
      })
    }
  }, intervalMs)
}

function disable() {
  if (!_dragActive) return
  const canvas = document.getElementById('preview')
  if (canvas) {
    if (canvas._bsMouseMove)
      canvas.removeEventListener('mousemove', canvas._bsMouseMove)
    if (canvas._bsTouchMove)
      canvas.removeEventListener('touchmove', canvas._bsTouchMove)
  }
  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
  }
  _dragActive = false
  _target = null
  _lastSentX = null
  _lastSentY = null
}

module.exports = { init, enable, disable }
