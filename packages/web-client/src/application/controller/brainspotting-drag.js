'use strict';
/**
 * Brainspotting drag — manual ball positioning via mouse/touch on preview canvas.
 * @module application/controller/brainspotting-drag
 */

let _deps = {};
let _dragActive = false;
let _throttleTs = 0;

function init(deps) {
  _deps = deps;
}

function enable() {
  if (_dragActive) return;
  const canvas = document.getElementById('preview');
  if (!canvas) return;
  _dragActive = true;

  const handleMove = (clientX, clientY) => {
    const engine = _deps.getPreviewPhysicsEngine?.();
    if (!engine || !engine.ball.brainspotting) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * engine.options.worldWidth;
    const y = ((clientY - rect.top) / rect.height) * engine.options.worldHeight;
    const r = engine.ball.radius;
    const clampedX = Math.max(r, Math.min(x, engine.options.worldWidth - r));
    const clampedY = Math.max(r, Math.min(y, engine.options.worldHeight - r));
    engine.ball.x = clampedX;
    engine.ball.y = clampedY;
    const now = performance.now();
    if (now - _throttleTs > 50) {
      _throttleTs = now;
      _deps.safeSend?.(globalThis.WS_MSG?.controllerUpdate, {
        x: clampedX,
        y: clampedY,
      });
    }
  };

  canvas._bsMouseMove = (e) => handleMove(e.clientX, e.clientY);
  canvas._bsTouchMove = (e) => {
    if (e.touches.length > 0) {
      e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  canvas.addEventListener('mousemove', canvas._bsMouseMove);
  canvas.addEventListener('touchmove', canvas._bsTouchMove, { passive: false });
}

function disable() {
  if (!_dragActive) return;
  const canvas = document.getElementById('preview');
  if (canvas) {
    if (canvas._bsMouseMove)
      canvas.removeEventListener('mousemove', canvas._bsMouseMove);
    if (canvas._bsTouchMove)
      canvas.removeEventListener('touchmove', canvas._bsTouchMove);
  }
  _dragActive = false;
}

module.exports = { init, enable, disable };
