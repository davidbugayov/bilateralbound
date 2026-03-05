import './modulepreload-polyfill-B5Qt9EMX.js';
const a = document.getElementById('c'),
  i = a.getContext('2d'),
  S = new URLSearchParams(location.search),
  l = S.get('s') ?? '';
let s = 0.5,
  r = 0.5,
  c = '#3b82f6',
  d = '#000000',
  f = 24;
const u = [12, 18, 24, 32, 42];
let y = 1920,
  b = 1080;
function h() {
  ((a.width = window.innerWidth), (a.height = window.innerHeight));
}
h();
window.addEventListener('resize', h);
function w(e) {
  if (
    (typeof e.x == 'number' && (s = e.x),
    typeof e.y == 'number' && (r = e.y),
    typeof e.ballColor == 'string' && (c = e.ballColor),
    typeof e.backgroundColor == 'string' && (d = e.backgroundColor),
    typeof e.ballSize == 'number' &&
      e.ballSize >= 1 &&
      e.ballSize <= 5 &&
      (f = u[e.ballSize - 1]),
    e.viewerScreenSize && typeof e.viewerScreenSize == 'object')
  ) {
    const t = e.viewerScreenSize;
    (t.width && (y = t.width), t.height && (b = t.height));
  }
}
if (typeof BroadcastChannel < 'u') {
  const e = new BroadcastChannel('bb_preview');
  e.onmessage = (t) => {
    var o;
    ((o = t.data) == null ? void 0 : o.type) === 'ball' && w(t.data);
  };
}
if (l && typeof BroadcastChannel > 'u') {
  const e = location.protocol === 'https:' ? 'wss' : 'ws',
    t = new WebSocket(
      `${e}://${location.host}/?sessionId=${l}&role=controller`,
    );
  ((t.onmessage = (o) => {
    try {
      const n = JSON.parse(o.data);
      (n.type === 'state_update' || n.type === 'initial_state') &&
        n.payload &&
        w(n.payload);
    } catch {}
  }),
    setInterval(() => {
      t.readyState === WebSocket.OPEN &&
        t.send(JSON.stringify({ type: 'ping' }));
    }, 3e4));
}
function g() {
  const e = a.width,
    t = a.height;
  ((i.fillStyle = d), i.fillRect(0, 0, e, t));
  const o = (s / y) * e,
    n = (r / b) * t;
  (i.beginPath(),
    i.arc(o, n, f, 0, Math.PI * 2),
    (i.fillStyle = c),
    i.fill(),
    requestAnimationFrame(g));
}
g();
