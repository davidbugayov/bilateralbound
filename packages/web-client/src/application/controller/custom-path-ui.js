'use strict'
/**
 * Custom Path UI — Configurator for custom ball movement paths (Zig-Zag, Spiral, Wave, Waypoints)
 * @module application/controller/custom-path-ui
 */

const PRESET_WAYPOINTS = {
  triangle: [
    { x: 0.1, y: 0.85 },
    { x: 0.5, y: 0.15 },
    { x: 0.9, y: 0.85 }
  ],
  diamond: [
    { x: 0.1, y: 0.5 },
    { x: 0.5, y: 0.15 },
    { x: 0.9, y: 0.5 },
    { x: 0.5, y: 0.85 }
  ],
  hourglass: [
    { x: 0.1, y: 0.15 },
    { x: 0.9, y: 0.85 },
    { x: 0.1, y: 0.85 },
    { x: 0.9, y: 0.15 }
  ],
  star: [
    { x: 0.5, y: 0.1 },
    { x: 0.62, y: 0.38 },
    { x: 0.92, y: 0.38 },
    { x: 0.68, y: 0.58 },
    { x: 0.78, y: 0.9 },
    { x: 0.5, y: 0.72 },
    { x: 0.22, y: 0.9 },
    { x: 0.32, y: 0.58 },
    { x: 0.08, y: 0.38 },
    { x: 0.38, y: 0.38 }
  ],
  mountain: [
    { x: 0.08, y: 0.8 },
    { x: 0.28, y: 0.25 },
    { x: 0.48, y: 0.7 },
    { x: 0.7, y: 0.15 },
    { x: 0.92, y: 0.8 }
  ]
}

let _deps = {}
let _animFrameId = null
let _animPhase = 0

const _config = {
  type: 'zigzag',
  frequency: 4,
  amplitude: 60,
  points: [
    { x: 0.1, y: 0.8 },
    { x: 0.3, y: 0.2 },
    { x: 0.5, y: 0.8 },
    { x: 0.7, y: 0.2 },
    { x: 0.9, y: 0.8 }
  ]
}

function init(deps) {
  _deps = deps || {}

  try {
    const saved = localStorage.getItem('bb_custom_path_config')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.type === 'string') _config.type = parsed.type
        if (typeof parsed.frequency === 'number') _config.frequency = parsed.frequency
        if (typeof parsed.amplitude === 'number') _config.amplitude = parsed.amplitude
        if (Array.isArray(parsed.points) && parsed.points.length >= 2) {
          _config.points = parsed.points
        }
      }
    }
  } catch (_) {
    /* ignore */
  }

  _bindDomEvents()
  _syncUiToConfig()
  _startPreviewAnimation()
}

function _saveConfig() {
  try {
    localStorage.setItem('bb_custom_path_config', JSON.stringify(_config))
  } catch (_) {
    /* ignore */
  }
}

function getConfig() {
  return JSON.parse(JSON.stringify(_config))
}

function setType(type, triggerApply = false) {
  if (!['zigzag', 'spiral', 'wave', 'custom'].includes(type)) return
  _config.type = type
  _saveConfig()
  _syncUiToConfig()

  if (triggerApply) {
    applyCurrentPath()
  } else {
    // If currently running this mode or a custom mode, update live
    const curMode = _deps.getCurrentDirectionMode?.()
    if (['zigzag', 'spiral', 'wave', 'custom'].includes(curMode)) {
      applyCurrentPath()
    }
  }
}

function setFrequency(val, triggerApply = false) {
  const num = Math.max(1, Math.min(12, Math.round(Number(val) || 4)))
  _config.frequency = num
  _saveConfig()
  const valEl = document.getElementById('pathFreqValue')
  if (valEl) valEl.textContent = String(num)

  if (triggerApply) {
    applyCurrentPath()
  } else {
    const curMode = _deps.getCurrentDirectionMode?.()
    if (['zigzag', 'spiral', 'wave', 'custom'].includes(curMode)) {
      _applyToPreviewEngine()
      _notifyServer()
    }
  }
}

function setAmplitude(val, triggerApply = false) {
  const num = Math.max(15, Math.min(100, Math.round(Number(val) || 60)))
  _config.amplitude = num
  _saveConfig()
  const valEl = document.getElementById('pathAmpValue')
  if (valEl) valEl.textContent = `${num}%`

  const slider = document.getElementById('pathAmpSlider')
  if (slider) {
    const min = Number(slider.min) || 15
    const max = Number(slider.max) || 100
    const pct = ((num - min) / (max - min)) * 100
    slider.style.setProperty('--pct', `${pct}%`)
  }

  if (triggerApply) {
    applyCurrentPath()
  } else {
    const curMode = _deps.getCurrentDirectionMode?.()
    if (['zigzag', 'spiral', 'wave', 'custom'].includes(curMode)) {
      _applyToPreviewEngine()
      _notifyServer()
    }
  }
}

function setPresetWaypoints(name) {
  if (PRESET_WAYPOINTS[name]) {
    _config.points = JSON.parse(JSON.stringify(PRESET_WAYPOINTS[name]))
    _config.type = 'custom'
    _saveConfig()
    _syncUiToConfig()
    _drawWaypointCanvas()

    const curMode = _deps.getCurrentDirectionMode?.()
    if (curMode === 'custom') {
      applyCurrentPath()
    }
  }
}

function clearWaypoints() {
  _config.points = []
  _config.type = 'custom'
  _saveConfig()
  _syncUiToConfig()
  _drawWaypointCanvas()
}

function _applyToPreviewEngine() {
  const engine = _deps.getPreviewPhysicsEngine?.()
  if (engine && typeof engine.setCustomPath === 'function') {
    engine.setCustomPath(_config.type, getConfig())
  }
}

function _notifyServer() {
  if (globalThis.__current?.isInitializing) return
  if (!globalThis.__current?.viewerConnected) return
  _deps.safeSend?.(globalThis.WS_MSG?.controllerUpdate || 'controller_update', {
    customPath: _config.type,
    customPathConfig: getConfig(),
    infinity: false,
    brainspotting: false,
    dirX: 0,
    dirY: 0
  })
}

function applyCurrentPath() {
  if (typeof _deps.setDirection === 'function') {
    _deps.setDirection(_config.type)
  }
}

function _syncUiToConfig() {
  // Update Type Tabs
  document.querySelectorAll('.custom-path-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.pathType === _config.type)
  })

  // Update Freq slider
  const freqSlider = document.getElementById('pathFreqSlider')
  if (freqSlider) freqSlider.value = String(_config.frequency)
  const freqVal = document.getElementById('pathFreqValue')
  if (freqVal) freqVal.textContent = String(_config.frequency)

  // Update Amp slider
  const ampSlider = document.getElementById('pathAmpSlider')
  if (ampSlider) {
    ampSlider.value = String(_config.amplitude)
    const min = Number(ampSlider.min) || 15
    const max = Number(ampSlider.max) || 100
    const pct = ((_config.amplitude - min) / (max - min)) * 100
    ampSlider.style.setProperty('--pct', `${pct}%`)
  }
  const ampVal = document.getElementById('pathAmpValue')
  if (ampVal) ampVal.textContent = `${_config.amplitude}%`

  // Waypoint section visibility
  const waypointSection = document.getElementById('waypointSection')
  if (waypointSection) {
    waypointSection.style.display = _config.type === 'custom' ? 'block' : 'none'
  }

  // Active Badge
  const badge = document.getElementById('activePathBadge')
  if (badge) {
    const titles = {
      zigzag: '⚡ Zig-Zag',
      spiral: '🌀 Spiral',
      wave: '〰️ Sine Wave',
      custom: '✍️ Custom Waypoints'
    }
    badge.textContent = titles[_config.type] || _config.type
  }

  _drawWaypointCanvas()
}

function syncFromState(pathType, config) {
  if (pathType && ['zigzag', 'spiral', 'wave', 'custom'].includes(pathType)) {
    _config.type = pathType
    if (config && typeof config === 'object') {
      if (typeof config.frequency === 'number') _config.frequency = config.frequency
      if (typeof config.amplitude === 'number') _config.amplitude = config.amplitude
      if (Array.isArray(config.points)) _config.points = config.points
    }
    _syncUiToConfig()
  }
}

function _bindDomEvents() {
  // Path Type Tabs
  document.querySelectorAll('.custom-path-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.pathType
      if (type) setType(type, true)
    })
  })

  // Frequency slider
  const freqSlider = document.getElementById('pathFreqSlider')
  if (freqSlider) {
    freqSlider.addEventListener('input', (e) => {
      setFrequency(Number(e.target.value))
    })
  }

  // Amplitude slider
  const ampSlider = document.getElementById('pathAmpSlider')
  if (ampSlider) {
    ampSlider.addEventListener('input', (e) => {
      setAmplitude(Number(e.target.value))
    })
  }

  // Waypoint presets
  document.querySelectorAll('.waypoint-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shape = btn.dataset.shape
      if (shape) setPresetWaypoints(shape)
    })
  })

  // Waypoint actions
  const clearBtn = document.getElementById('clearWaypointsBtn')
  if (clearBtn) {
    clearBtn.addEventListener('click', clearWaypoints)
  }

  const applyBtn = document.getElementById('applyCustomPathBtn')
  if (applyBtn) {
    applyBtn.addEventListener('click', applyCurrentPath)
  }

  _setupWaypointCanvasEvents()
}

function _setupWaypointCanvasEvents() {
  const canvas = document.getElementById('waypointCanvas')
  if (!canvas) return

  let draggingIdx = -1

  const getCanvasCoords = (e) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const x = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width))
    const y = Math.max(0.06, Math.min(0.94, (clientY - rect.top) / rect.height))
    return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) }
  }

  const findNearestIdx = (pos) => {
    if (!_config.points.length) return -1
    let bestDist = 0.08
    let bestIdx = -1
    _config.points.forEach((p, idx) => {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y)
      if (d < bestDist) {
        bestDist = d
        bestIdx = idx
      }
    })
    return bestIdx
  }

  canvas.addEventListener('mousedown', (e) => {
    const pos = getCanvasCoords(e)
    const nearest = findNearestIdx(pos)
    if (nearest >= 0) {
      draggingIdx = nearest
    } else {
      if (_config.points.length < 30) {
        _config.points.push(pos)
        _config.type = 'custom'
        _saveConfig()
        _syncUiToConfig()
        _drawWaypointCanvas()
        const curMode = _deps.getCurrentDirectionMode?.()
        if (curMode === 'custom') applyCurrentPath()
      }
    }
  })

  window.addEventListener('mousemove', (e) => {
    if (draggingIdx >= 0) {
      const pos = getCanvasCoords(e)
      _config.points[draggingIdx] = pos
      _drawWaypointCanvas()
    }
  })

  window.addEventListener('mouseup', () => {
    if (draggingIdx >= 0) {
      draggingIdx = -1
      _saveConfig()
      const curMode = _deps.getCurrentDirectionMode?.()
      if (curMode === 'custom') applyCurrentPath()
    }
  })
}

function _drawWaypointCanvas() {
  const canvas = document.getElementById('waypointCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  const w = Math.round(rect.width) || 300
  const h = Math.round(rect.height) || 130

  const targetW = Math.round(w * dpr)
  const targetH = Math.round(h * dpr)

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }

  try {
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    // Draw grid & center guidelines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()

    const pts = _config.points
    if (!pts || !pts.length) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)'
      ctx.font = '12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Click to place movement waypoints', w / 2, h / 2 + 4)
      ctx.restore()
      return
    }

    // Draw connected path line
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    pts.forEach((p, idx) => {
      const px = p.x * w
      const py = p.y * h
      if (idx === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    if (pts.length > 2) {
      ctx.lineTo(pts[0].x * w, pts[0].y * h)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Draw waypoint nodes
    pts.forEach((p, idx) => {
      const px = p.x * w
      const py = p.y * h

      ctx.fillStyle = '#0284c7'
      ctx.beginPath()
      ctx.arc(px, py, 6, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 9px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(idx + 1), px, py)
    })

    ctx.restore()
  } catch (_e) {
    try {
      ctx.restore()
    } catch (_) {
      /* ignore */
    }
  }
}

let _previewObserver = null
let _previewIsVisible = false

function _resizePreviewCanvas(canvas) {
  if (!canvas) return
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rect = canvas.getBoundingClientRect()
    const w = Math.round(rect.width) || 300
    const h = Math.round(rect.height) || 90
    const targetW = Math.max(100, Math.round(w * dpr))
    const targetH = Math.max(40, Math.round(h * dpr))

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }
  } catch (_) {
    /* ignore resize error */
  }
}

function _startPreviewAnimation() {
  const canvas = document.getElementById('pathTrajectoryPreviewCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  _resizePreviewCanvas(canvas)

  if (typeof globalThis.IntersectionObserver !== 'undefined' && !_previewObserver) {
    _previewObserver = new globalThis.IntersectionObserver((entries) => {
      for (const entry of entries) {
        _previewIsVisible = entry.isIntersecting && entry.intersectionRatio > 0.05
        if (_previewIsVisible) {
          _resizePreviewCanvas(canvas)
          if (!_animFrameId) {
            _animFrameId = requestAnimationFrame(render)
          }
        }
      }
    }, { threshold: [0, 0.1] })
    _previewObserver.observe(canvas)
  } else {
    _previewIsVisible = true
  }

  const render = () => {
    _animFrameId = null
    if (ctx.isContextLost && ctx.isContextLost()) {
      return
    }
    // Only continue animation if canvas is connected and visible
    if (!canvas.isConnected) return
    const isVisible = _previewIsVisible && canvas.offsetParent !== null && canvas.clientHeight > 0
    if (isVisible) {
      _animPhase = (_animPhase + 0.028) % (2 * Math.PI)
      _drawTrajectoryPreview(canvas, ctx, _animPhase)
      _animFrameId = requestAnimationFrame(render)
    }
  }

  if (_animFrameId) cancelAnimationFrame(_animFrameId)
  _animFrameId = requestAnimationFrame(render)
}

function _drawTrajectoryPreview(canvas, ctx, phase) {
  if (!canvas || !ctx) return
  if (canvas.width <= 0 || canvas.height <= 0) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  if (w <= 0 || h <= 0) return

  ctx.save()
  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)

    const cx = w / 2
    const cy = h / 2
    const scale = 0.88
    const freq = Math.max(1, _config.frequency || 4)
    const amp = Math.max(5, ((_config.amplitude || 60) / 100) * (h / 2) * scale)
    const spanX = Math.max(10, (w / 2) * scale)
    const type = _config.type || 'zigzag'

    // Draw static trajectory path
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
    ctx.lineWidth = 2
    ctx.beginPath()

    const steps = 120
    for (let i = 0; i <= steps; i++) {
      const s = (i / steps) * 2 * Math.PI
      let sx = cx
      let sy = cy

      if (type === 'zigzag') {
        sx = cx + spanX * Math.cos(s)
        const sinVal = Math.max(-1, Math.min(1, Math.sin(freq * s)))
        const tri = (2 / Math.PI) * Math.asin(sinVal)
        sy = cy + amp * tri
      } else if (type === 'spiral') {
        const maxR = Math.min(spanX, amp * 1.5)
        const minR = 10
        const loops = Math.max(1, freq)
        const expansion = (1 - Math.cos(s)) / 2
        const r = minR + (maxR - minR) * expansion
        const angle = s * loops
        sx = cx + r * Math.cos(angle)
        sy = cy + (r * 0.45) * Math.sin(angle)
      } else if (type === 'wave') {
        sx = cx + spanX * Math.cos(s)
        sy = cy + amp * Math.sin(freq * s)
      } else if (type === 'custom' && _config.points && _config.points.length >= 2) {
        const numPts = _config.points.length
        const pIdx = (s / (2 * Math.PI)) * numPts
        const idx1 = Math.floor(pIdx) % numPts
        const idx2 = (idx1 + 1) % numPts
        const t = pIdx - Math.floor(pIdx)
        const smoothT = (1 - Math.cos(t * Math.PI)) / 2
        const p1 = _config.points[idx1]
        const p2 = _config.points[idx2]
        sx = w * 0.06 + (p1.x + (p2.x - p1.x) * smoothT) * (w * 0.88)
        sy = h * 0.08 + (p1.y + (p2.y - p1.y) * smoothT) * (h * 0.84)
      }

      if (!Number.isFinite(sx)) sx = cx
      if (!Number.isFinite(sy)) sy = cy

      if (i === 0) ctx.moveTo(sx, sy)
      else ctx.lineTo(sx, sy)
    }
    ctx.stroke()

    // Draw moving simulated ball along the path
    let ballX = cx
    let ballY = cy
    const s = phase

    if (type === 'zigzag') {
      ballX = cx + spanX * Math.cos(s)
      const sinVal = Math.max(-1, Math.min(1, Math.sin(freq * s)))
      const tri = (2 / Math.PI) * Math.asin(sinVal)
      ballY = cy + amp * tri
    } else if (type === 'spiral') {
      const maxR = Math.min(spanX, amp * 1.5)
      const minR = 10
      const loops = Math.max(1, freq)
      const expansion = (1 - Math.cos(s)) / 2
      const r = minR + (maxR - minR) * expansion
      const angle = s * loops
      ballX = cx + r * Math.cos(angle)
      ballY = cy + (r * 0.45) * Math.sin(angle)
    } else if (type === 'wave') {
      ballX = cx + spanX * Math.cos(s)
      ballY = cy + amp * Math.sin(freq * s)
    } else if (type === 'custom' && _config.points && _config.points.length >= 2) {
      const numPts = _config.points.length
      const pIdx = (s / (2 * Math.PI)) * numPts
      const idx1 = Math.floor(pIdx) % numPts
      const idx2 = (idx1 + 1) % numPts
      const t = pIdx - Math.floor(pIdx)
      const smoothT = (1 - Math.cos(t * Math.PI)) / 2
      const p1 = _config.points[idx1]
      const p2 = _config.points[idx2]
      ballX = w * 0.06 + (p1.x + (p2.x - p1.x) * smoothT) * (w * 0.88)
      ballY = h * 0.08 + (p1.y + (p2.y - p1.y) * smoothT) * (h * 0.84)
    }

    if (!Number.isFinite(ballX)) ballX = cx
    if (!Number.isFinite(ballY)) ballY = cy

    // Glow
    try {
      const grad = ctx.createRadialGradient(ballX, ballY, 1, ballX, ballY, 12)
      grad.addColorStop(0, 'rgba(56, 189, 248, 1)')
      grad.addColorStop(0.4, 'rgba(37, 99, 235, 0.7)')
      grad.addColorStop(1, 'rgba(37, 99, 235, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(ballX, ballY, 12, 0, 2 * Math.PI)
      ctx.fill()
    } catch (_) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.9)'
      ctx.beginPath()
      ctx.arc(ballX, ballY, 10, 0, 2 * Math.PI)
      ctx.fill()
    }

    // Center core
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ballX, ballY, 4.5, 0, 2 * Math.PI)
    ctx.fill()
  } catch (_e) {
    /* safely handled */
  } finally {
    try {
      ctx.restore()
    } catch (_) {
      /* ignore */
    }
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.customPathUI = {
    init,
    getConfig,
    setType,
    setFrequency,
    setAmplitude,
    setPresetWaypoints,
    clearWaypoints,
    applyCurrentPath,
    syncFromState
  }
}

module.exports = {
  init,
  getConfig,
  setType,
  setFrequency,
  setAmplitude,
  setPresetWaypoints,
  clearWaypoints,
  applyCurrentPath,
  syncFromState
}
