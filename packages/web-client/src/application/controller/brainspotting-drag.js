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

function _getCanvases() {
  // Attach to both canvases so brainspotting works regardless of whether
  // fullscreen was opened before or after enabling brainspotting mode.
  return [
    document.getElementById('preview'),
    document.getElementById('previewFullscreenCanvas')
  ].filter(Boolean)
}

function enable() {
  if (_dragActive) return
  const canvases = _getCanvases()
  if (canvases.length === 0) return
  _dragActive = true
  _lastSentX = null
  _lastSentY = null

  const handleMove = (clientX, clientY, rect) => {
    const engine = _deps.getPreviewPhysicsEngine?.()
    if (!engine || !engine.ball.brainspotting) return
    if (rect.width === 0 || rect.height === 0) return
    const x = ((clientX - rect.left) / rect.width) * engine.options.worldWidth
    const y = ((clientY - rect.top) / rect.height) * engine.options.worldHeight
    const r = engine.ball.radius
    _target = {
      x: Math.max(r, Math.min(x, engine.options.worldWidth - r)),
      y: Math.max(r, Math.min(y, engine.options.worldHeight - r))
    }
    // Immediately move a step toward the cursor and stream the position.
    // Doing this inside the event handler (not a timer) keeps the drag
    // responsive even when rAF/setInterval are throttled in background tabs.
    _chaseStep(engine)
  }

  const _chaseStep = (engine) => {
    if (!_target) return
    const dx = _target.x - engine.ball.x
    const dy = _target.y - engine.ball.y
    const dist = Math.hypot(dx, dy)
    if (dist <= 1) {
      engine.ball.x = _target.x
      engine.ball.y = _target.y
      _syncRenderPositions(engine)
      _target = null
      return
    }
    engine.ball.x += dx * 0.33
    engine.ball.y += dy * 0.33
    // Keep the render interpolation anchors in sync, otherwise the canvas
    // keeps drawing the ball at the last engine-updated position (jitter /
    // "ball does not follow the cursor").
    _syncRenderPositions(engine)
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

  const _syncRenderPositions = (engine) => {
    if (engine._prevPos) {
      engine._prevPos.x = engine.ball.x
      engine._prevPos.y = engine.ball.y
    }
    if (engine._currPos) {
      engine._currPos.x = engine.ball.x
      engine._currPos.y = engine.ball.y
    }
  }

  for (const canvas of canvases) {
    canvas._bsMouseMove = (e) =>
      handleMove(e.clientX, e.clientY, canvas.getBoundingClientRect())
    canvas._bsTouchMove = (e) => {
      if (e.touches.length > 0) {
        e.preventDefault()
        handleMove(
          e.touches[0].clientX,
          e.touches[0].clientY,
          canvas.getBoundingClientRect()
        )
      }
    }

    canvas.addEventListener('mousemove', canvas._bsMouseMove)
    canvas.addEventListener('touchmove', canvas._bsTouchMove, {
      passive: false
    })
  }

  // Chase the cursor target and stream the animated position to the server.
  // Runs on an interval so the ball still settles on the target even when no
  // further mousemove events arrive (or the render loop is throttled).
  _intervalId = setInterval(() => {
    const engine = _deps.getPreviewPhysicsEngine?.()
    if (!engine || !engine.ball.brainspotting || !_target) return
    _chaseStep(engine)
  }, 33)
}

function disable() {
  if (!_dragActive) return
  // Remove from both canvases — listeners may have been attached to either
  const canvases = [
    document.getElementById('preview'),
    document.getElementById('previewFullscreenCanvas')
  ]
  for (const el of canvases) {
    if (el && el._bsMouseMove)
      el.removeEventListener('mousemove', el._bsMouseMove)
    if (el && el._bsTouchMove)
      el.removeEventListener('touchmove', el._bsTouchMove)
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
