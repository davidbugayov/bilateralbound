'use strict'
/**
 * Brainspotting drag — manual ball positioning via mouse/touch on preview canvas.
 * The ball smoothly chases the cursor (no teleporting) and the current
 * position is streamed to the server so the viewer mirrors the motion.
 * @module application/controller/brainspotting-drag
 */

let _deps = {}
let _dragActive = false
let _throttleTs = 0
let _lastSentX = null
let _lastSentY = null
let _rafId = null

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
    const clampedX = Math.max(r, Math.min(x, engine.options.worldWidth - r))
    const clampedY = Math.max(r, Math.min(y, engine.options.worldHeight - r))
    // Set the chase target — the engine animates the ball toward it smoothly
    engine.setBrainspottingTarget(clampedX, clampedY)
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

  // Stream the ball's animated position to the server (throttled) while it
  // is still moving toward the cursor target. Stops once it settles.
  const loop = () => {
    const engine = _deps.getPreviewPhysicsEngine?.()
    if (engine && engine.ball.brainspotting && engine._bsTarget) {
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
    }
    _rafId = requestAnimationFrame(loop)
  }
  _rafId = requestAnimationFrame(loop)
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
  if (_rafId) {
    cancelAnimationFrame(_rafId)
    _rafId = null
  }
  _dragActive = false
  _lastSentX = null
  _lastSentY = null
}

module.exports = { init, enable, disable }
