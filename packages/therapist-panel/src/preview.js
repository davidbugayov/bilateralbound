// Preview popup — canvas ball animation
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')

const params = new URLSearchParams(location.search)
const sessionId = params.get('s') ?? ''

// Ball render state (absolute px coordinates in viewer's coordinate space)
let bx = 0.5
let by = 0.5
let ballColor = '#3b82f6'
let bgColor = '#000000'
let ballRadius = 24
const SIZE_RADII = [12, 18, 24, 32, 42]

// Viewer screen size (sent by server in state_update.viewerScreenSize)
// Use 0 as default to detect when size hasn't been received yet
let viewerW = 0
let viewerH = 0

function resize() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resize()
window.addEventListener('resize', resize)

function applyPayload(p) {
  // x/y are absolute px in viewer's coordinate space
  if (typeof p.x === 'number') bx = p.x
  if (typeof p.y === 'number') by = p.y
  if (typeof p.ballColor === 'string') ballColor = p.ballColor
  if (typeof p.backgroundColor === 'string') bgColor = p.backgroundColor
  if (typeof p.ballSize === 'number' && p.ballSize >= 1 && p.ballSize <= 5) {
    ballRadius = SIZE_RADII[p.ballSize - 1]
  }
  if (p.viewerScreenSize && typeof p.viewerScreenSize === 'object') {
    const vs = p.viewerScreenSize
    if (vs.width) viewerW = vs.width
    if (vs.height) viewerH = vs.height
  }
}

if (typeof BroadcastChannel !== 'undefined') {
  const bc = new BroadcastChannel('bb_preview')
  bc.onmessage = (e) => {
    if (e.data?.type === 'ball') {
      applyPayload(e.data)
    }
  }
}

// Connect via WS only when BroadcastChannel is unavailable (e.g. Safari < 15.4)
if (sessionId && typeof BroadcastChannel === 'undefined') {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/?sessionId=${sessionId}&role=controller`)
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if ((msg.type === 'state_update' || msg.type === 'initial_state') && msg.payload) {
        applyPayload(msg.payload)
      }
    } catch { /* ignore malformed */ }
  }
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
  }, 30000)
}

function draw() {
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, w, h)

  // Only draw ball if viewerScreenSize has been received from server
  // This prevents incorrect scaling when using default values
  if (viewerW > 0 && viewerH > 0) {
    // Scale ball position from viewer's screen to preview window size
    const px = (bx / viewerW) * w
    const py = (by / viewerH) * h

    ctx.beginPath()
    ctx.arc(px, py, ballRadius, 0, Math.PI * 2)
    ctx.fillStyle = ballColor
    ctx.fill()
  }

  requestAnimationFrame(draw)
}
draw()
