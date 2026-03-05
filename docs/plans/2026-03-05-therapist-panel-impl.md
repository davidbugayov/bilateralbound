# Therapist Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a compact React + Tailwind therapist control panel at `/panel/:sessionId` that replaces `session-controller.html` as the primary therapist UI.

**Architecture:** New Vite package `packages/therapist-panel/` builds to `packages/web-client/public/panel/`. Express serves the SPA via a new `/panel/:sessionId` route. Panel connects to existing WS server as `role=controller`, reusing existing backend protocol without modifications.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Vite 5, existing WS backend (ws://host/?sessionId=:id&role=controller)

---

## Task 1: Scaffold the Vite package

**Files:**
- Create: `packages/therapist-panel/package.json`
- Create: `packages/therapist-panel/vite.config.ts`
- Create: `packages/therapist-panel/tsconfig.json`
- Create: `packages/therapist-panel/index.html`
- Create: `packages/therapist-panel/tailwind.config.js`
- Create: `packages/therapist-panel/postcss.config.js`
- Create: `packages/therapist-panel/src/index.css`
- Create: `packages/therapist-panel/src/main.tsx`

**Step 1: Create `packages/therapist-panel/package.json`**

```json
{
  "name": "therapist-panel",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  }
}
```

**Step 2: Create `packages/therapist-panel/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/panel/',
  build: {
    outDir: path.resolve(__dirname, '../web-client/public/panel'),
    emptyOutDir: true,
  },
})
```

**Step 3: Create `packages/therapist-panel/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": false,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 4: Create `packages/therapist-panel/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{tsx,ts}'],
  theme: { extend: {} },
  plugins: [],
}
```

**Step 5: Create `packages/therapist-panel/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 6: Create `packages/therapist-panel/index.html`**

```html
<!doctype html>
<html lang="ru" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>EMDR Panel</title>
  </head>
  <body class="bg-zinc-900 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Create `packages/therapist-panel/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 8: Create `packages/therapist-panel/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 9: Install dependencies**

```bash
cd packages/therapist-panel && npm install
```

Expected: `node_modules` created, no errors.

**Step 10: Verify build works**

```bash
cd packages/therapist-panel && npx vite build --mode development
```

Expected: Build fails on missing `App.tsx` — that's fine, scaffold is correct.

**Step 11: Commit**

```bash
git add packages/therapist-panel/
git commit -m "feat: scaffold therapist-panel vite package"
```

---

## Task 2: Core hooks

**Files:**
- Create: `packages/therapist-panel/src/hooks/useStorage.ts`
- Create: `packages/therapist-panel/src/hooks/useWebSocket.ts`

**Step 1: Create `src/hooks/useStorage.ts`**

This hook reads/writes panel settings to localStorage.

```ts
import { useState, useEffect } from 'react'

const PREFIX = 'bb_panel_'

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function set<T>(key: string, value: T) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value))
}

export function useStorage<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => get(key, fallback))

  const update = (v: T) => {
    set(key, v)
    setValue(v)
  }

  return [value, update]
}

// Session log helpers — not a hook, just utilities
export type SessionLogEntry = { date: string; passes: number; sets: number }

export function appendSessionLog(entry: SessionLogEntry) {
  const log: SessionLogEntry[] = get('session_log', [])
  log.push(entry)
  // Keep last 100 entries
  if (log.length > 100) log.splice(0, log.length - 100)
  set('session_log', log)
}
```

**Step 2: Create `src/hooks/useWebSocket.ts`**

Connects as controller to the existing WS server. Sends controller updates, receives state_update and viewer_update messages.

```ts
import { useEffect, useRef, useCallback } from 'react'

export type WsState = {
  passes: number
  sets: number
  timerMs: number
  isPlaying: boolean
  viewerConnected: boolean
}

type Handlers = {
  onState: (s: Partial<WsState>) => void
  onViewerStatus: (connected: boolean) => void
}

export function useWebSocket(sessionId: string | null, handlers: Handlers) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const connect = useCallback(() => {
    if (!sessionId) return
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${location.host}/?sessionId=${sessionId}&role=controller`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'state_update' && msg.payload) {
          const p = msg.payload
          handlersRef.current.onState({
            passes: p.passes,
            sets: p.sets,
            timerMs: p.timerMs,
            isPlaying: p.isPlaying,
          })
        }
        if (msg.type === 'viewer_update' || msg.type === 'viewer_connected') {
          handlersRef.current.onViewerStatus(true)
        }
        if (msg.type === 'viewer_disconnected') {
          handlersRef.current.onViewerStatus(false)
        }
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [sessionId])

  useEffect(() => {
    connect()
    // Heartbeat every 30s
    const hb = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
    return () => {
      clearInterval(hb)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Send a controller update via REST (same as existing controller.js)
  const sendUpdate = useCallback(async (sessionId: string, payload: Record<string, unknown>) => {
    try {
      await fetch(`/api/session/${sessionId}/controller/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch { /* ignore */ }
  }, [])

  return { sendUpdate }
}
```

**Step 3: Commit**

```bash
git add packages/therapist-panel/src/hooks/
git commit -m "feat: therapist-panel hooks (storage + websocket)"
```

---

## Task 3: UI Components

**Files:**
- Create: `packages/therapist-panel/src/components/Header.tsx`
- Create: `packages/therapist-panel/src/components/Counters.tsx`
- Create: `packages/therapist-panel/src/components/PlayButton.tsx`
- Create: `packages/therapist-panel/src/components/SpeedSlider.tsx`
- Create: `packages/therapist-panel/src/components/Settings.tsx`
- Create: `packages/therapist-panel/src/components/PreviewButton.tsx`

**Step 1: Create `src/components/Header.tsx`**

```tsx
import React from 'react'

type Props = {
  sessionId: string
  viewerConnected: boolean
}

export default function Header({ sessionId, viewerConnected }: Props) {
  const viewerUrl = `${location.origin}/s/${sessionId}`

  function copyLink() {
    navigator.clipboard.writeText(viewerUrl).catch(() => {})
  }

  return (
    <div className="flex flex-col gap-1 p-3 border-b border-zinc-700">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400 font-mono">{sessionId}</span>
        <span className={`text-xs font-medium ${viewerConnected ? 'text-green-400' : 'text-zinc-500'}`}>
          {viewerConnected ? '● Клиент подключён' : '○ Ожидание клиента'}
        </span>
      </div>
      <button
        onClick={copyLink}
        className="w-full text-left text-xs text-zinc-400 hover:text-zinc-200 truncate transition-colors"
        title={viewerUrl}
      >
        📋 {viewerUrl}
      </button>
    </div>
  )
}
```

**Step 2: Create `src/components/Counters.tsx`**

```tsx
import React from 'react'

type Props = {
  timerMs: number
  passes: number
  sets: number
  onReset: () => void
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function Counters({ timerMs, passes, sets, onReset }: Props) {
  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-3xl font-mono font-bold text-zinc-100 tabular-nums">
            {formatTime(timerMs)}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Таймер</div>
        </div>
        <div>
          <div className="text-3xl font-mono font-bold text-zinc-100 tabular-nums">{passes}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Пасы</div>
        </div>
        <div>
          <div className="text-3xl font-mono font-bold text-zinc-100 tabular-nums">{sets}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Сеты</div>
        </div>
      </div>
      <button
        onClick={onReset}
        className="w-full py-1 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
      >
        ↺ Сброс
      </button>
    </div>
  )
}
```

**Step 3: Create `src/components/PlayButton.tsx`**

```tsx
import React from 'react'

type Props = {
  isPlaying: boolean
  disabled: boolean
  onClick: () => void
}

export default function PlayButton({ isPlaying, disabled, onClick }: Props) {
  return (
    <div className="px-3 pb-3">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-4 rounded-lg text-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          isPlaying
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {isPlaying ? '⏹ Остановить' : '▶ Начать BLS'}
      </button>
    </div>
  )
}
```

**Step 4: Create `src/components/SpeedSlider.tsx`**

```tsx
import React from 'react'

type Props = {
  speed: number
  soundEnabled: boolean
  onSpeedChange: (v: number) => void
  onSoundToggle: (v: boolean) => void
}

export default function SpeedSlider({ speed, soundEnabled, onSpeedChange, onSoundToggle }: Props) {
  return (
    <div className="px-3 pb-3 flex flex-col gap-2 border-b border-zinc-700">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400 w-16 shrink-0">Скорость</span>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="flex-1 accent-blue-500"
        />
        <span className="text-xs text-zinc-300 w-8 text-right tabular-nums">{speed.toFixed(1)}×</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400 w-16 shrink-0">Звук</span>
        <button
          onClick={() => onSoundToggle(!soundEnabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            soundEnabled ? 'bg-blue-600' : 'bg-zinc-600'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              soundEnabled ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-xs text-zinc-500">{soundEnabled ? 'Вкл' : 'Выкл'}</span>
      </div>
    </div>
  )
}
```

**Step 5: Create `src/components/Settings.tsx`**

```tsx
import React, { useState } from 'react'

type Props = {
  ballColor: string
  bgColor: string
  ballSize: number
  onBallColorChange: (v: string) => void
  onBgColorChange: (v: string) => void
  onBallSizeChange: (v: number) => void
}

export default function Settings({
  ballColor, bgColor, ballSize,
  onBallColorChange, onBgColorChange, onBallSizeChange
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-zinc-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>Настройки</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-400 w-24">Цвет шара</label>
            <input
              type="color"
              value={ballColor}
              onChange={(e) => onBallColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-400 w-24">Фон</label>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-400 w-24">Размер</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => onBallSizeChange(s)}
                  className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                    ballSize === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 6: Create `src/components/PreviewButton.tsx`**

```tsx
import React, { useRef } from 'react'

type Props = { sessionId: string }

export default function PreviewButton({ sessionId }: Props) {
  const winRef = useRef<Window | null>(null)

  function openPreview() {
    const url = `/panel/preview.html?s=${sessionId}`
    if (winRef.current && !winRef.current.closed) {
      winRef.current.focus()
      return
    }
    winRef.current = window.open(url, 'bb_preview', 'width=520,height=320,resizable=yes')
  }

  return (
    <div className="p-3">
      <button
        onClick={openPreview}
        className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
      >
        ⧉ Открыть превью клиента
      </button>
    </div>
  )
}
```

**Step 7: Commit**

```bash
git add packages/therapist-panel/src/components/
git commit -m "feat: therapist-panel UI components"
```

---

## Task 4: App root and session routing

**Files:**
- Create: `packages/therapist-panel/src/App.tsx`

**Step 1: Create `src/App.tsx`**

Session ID comes from URL path `/panel/:sessionId` — extracted via `location.pathname`.
If no session ID in URL, shows a "create session" screen.

```tsx
import React, { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import Counters from './components/Counters'
import PlayButton from './components/PlayButton'
import SpeedSlider from './components/SpeedSlider'
import Settings from './components/Settings'
import PreviewButton from './components/PreviewButton'
import { useStorage, appendSessionLog } from './hooks/useStorage'
import { useWebSocket } from './hooks/useWebSocket'

// Extract sessionId from /panel/:sessionId
function getSessionId(): string | null {
  const parts = location.pathname.split('/')
  // /panel/abc123 → parts = ['', 'panel', 'abc123']
  const id = parts[2]
  return id && id.length >= 3 ? id : null
}

export default function App() {
  const sessionId = getSessionId()

  const [speed, setSpeedRaw] = useStorage('speed', 1.0)
  const [ballColor, setBallColorRaw] = useStorage('ballColor', '#3b82f6')
  const [bgColor, setBgColorRaw] = useStorage('bgColor', '#000000')
  const [ballSize, setBallSizeRaw] = useStorage('ballSize', 3)
  const [soundEnabled, setSoundRaw] = useStorage('sound', false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [viewerConnected, setViewerConnected] = useState(false)
  const [passes, setPasses] = useState(0)
  const [sets, setSets] = useState(0)
  const [timerMs, setTimerMs] = useState(0)

  // BroadcastChannel to send ball state to preview popup
  const bcRef = React.useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    bcRef.current = new BroadcastChannel('bb_preview')
    return () => bcRef.current?.close()
  }, [])

  const { sendUpdate } = useWebSocket(sessionId, {
    onState: (s) => {
      if (s.passes !== undefined) setPasses(s.passes)
      if (s.sets !== undefined) setSets(s.sets)
      if (s.timerMs !== undefined) setTimerMs(s.timerMs)
      if (s.isPlaying !== undefined) setIsPlaying(s.isPlaying)
      // Forward ball position to preview popup
      bcRef.current?.postMessage({ type: 'state', ...s })
    },
    onViewerStatus: setViewerConnected,
  })

  async function sendCtrl(extra: Record<string, unknown> = {}) {
    if (!sessionId) return
    await sendUpdate(sessionId, {
      speed,
      ballColor,
      backgroundColor: bgColor,
      ballSize,
      soundEnabled,
      ...extra,
    })
  }

  function handlePlayToggle() {
    const next = !isPlaying
    setIsPlaying(next)
    sendCtrl({ isPlaying: next })
    if (!next && passes > 0) {
      appendSessionLog({ date: new Date().toISOString(), passes, sets })
    }
  }

  function handleReset() {
    setPasses(0)
    setSets(0)
    setTimerMs(0)
    sendCtrl({ reset: true })
  }

  function handleSpeed(v: number) {
    setSpeedRaw(v)
    sendCtrl({ speed: v })
  }

  function handleBallColor(v: string) {
    setBallColorRaw(v)
    sendCtrl({ ballColor: v })
  }

  function handleBgColor(v: string) {
    setBgColorRaw(v)
    sendCtrl({ backgroundColor: v })
  }

  function handleBallSize(v: number) {
    setBallSizeRaw(v)
    sendCtrl({ ballSize: v })
  }

  function handleSound(v: boolean) {
    setSoundRaw(v)
    sendCtrl({ soundEnabled: v })
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-6">
        <p className="text-zinc-400 text-sm text-center">
          Откройте панель по ссылке:<br />
          <code className="text-zinc-200">/panel/:sessionId</code>
        </p>
        <a
          href="/"
          className="text-blue-400 hover:text-blue-300 text-sm underline"
        >
          На главную
        </a>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto min-h-screen bg-zinc-900 flex flex-col text-zinc-100">
      <Header sessionId={sessionId} viewerConnected={viewerConnected} />
      <Counters timerMs={timerMs} passes={passes} sets={sets} onReset={handleReset} />
      <PlayButton
        isPlaying={isPlaying}
        disabled={false}
        onClick={handlePlayToggle}
      />
      <SpeedSlider
        speed={speed}
        soundEnabled={soundEnabled}
        onSpeedChange={handleSpeed}
        onSoundToggle={handleSound}
      />
      <Settings
        ballColor={ballColor}
        bgColor={bgColor}
        ballSize={ballSize}
        onBallColorChange={handleBallColor}
        onBgColorChange={handleBgColor}
        onBallSizeChange={handleBallSize}
      />
      <PreviewButton sessionId={sessionId} />
    </div>
  )
}
```

**Step 2: Test build**

```bash
cd packages/therapist-panel && npm run build
```

Expected: `packages/web-client/public/panel/` created with `index.html`, `assets/`.

**Step 3: Commit**

```bash
git add packages/therapist-panel/src/App.tsx
git commit -m "feat: therapist-panel App root with session routing"
```

---

## Task 5: Preview popup window

**Files:**
- Create: `packages/therapist-panel/preview.html`
- Create: `packages/therapist-panel/src/preview.tsx`

**Step 1: Create `packages/therapist-panel/preview.html`**

This is a separate Vite entry for the popup window.

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Превью клиента</title>
    <style>
      body { margin: 0; background: #000; overflow: hidden; }
      canvas { display: block; width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <canvas id="c"></canvas>
    <script type="module" src="/src/preview.tsx"></script>
  </body>
</html>
```

**Step 2: Update `vite.config.ts` to include preview as a second entry**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/panel/',
  build: {
    outDir: path.resolve(__dirname, '../web-client/public/panel'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        preview: path.resolve(__dirname, 'preview.html'),
      },
    },
  },
})
```

**Step 3: Create `packages/therapist-panel/src/preview.tsx`**

Simple canvas animation — receives ball state from main window via BroadcastChannel.

```ts
// Simple canvas preview — no React needed
const canvas = document.getElementById('c') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

// Get sessionId from ?s= param
const params = new URLSearchParams(location.search)
const sessionId = params.get('s') || ''

// Ball state
let bx = 0.5   // 0–1 normalized
let by = 0.5
let color = '#3b82f6'
let bgColor = '#000000'
let size = 20  // px radius

function resize() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}
resize()
window.addEventListener('resize', resize)

// Listen for ball state from main panel window
const bc = new BroadcastChannel('bb_preview')
bc.onmessage = (e) => {
  const d = e.data
  if (d.type === 'state') {
    if (d.x !== undefined) bx = d.x
    if (d.y !== undefined) by = d.y
    if (d.ballColor) color = d.ballColor
    if (d.backgroundColor) bgColor = d.backgroundColor
    if (d.ballSize) size = [12, 18, 24, 32, 42][d.ballSize - 1] ?? 24
  }
}

// Also subscribe to WS state_update for direct position
const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
if (sessionId) {
  const ws = new WebSocket(`${protocol}://${location.host}/?sessionId=${sessionId}&role=controller`)
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'state_update' && msg.payload) {
        const p = msg.payload
        if (p.x !== undefined) bx = p.x  // normalized 0-1 or absolute px
        if (p.y !== undefined) by = p.y
        if (p.ballColor) color = p.ballColor
        if (p.backgroundColor) bgColor = p.backgroundColor
      }
    } catch { /**/ }
  }
}

function draw() {
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, w, h)

  // bx/by: if > 1, treat as absolute px; if <= 1, treat as normalized
  const px = bx > 1 ? bx : bx * w
  const py = by > 1 ? by : by * h

  ctx.beginPath()
  ctx.arc(px, py, size, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  requestAnimationFrame(draw)
}
draw()
```

**Step 4: Build and verify**

```bash
cd packages/therapist-panel && npm run build
```

Expected: `public/panel/preview.html` exists in output.

**Step 5: Commit**

```bash
git add packages/therapist-panel/preview.html packages/therapist-panel/src/preview.tsx packages/therapist-panel/vite.config.ts
git commit -m "feat: therapist-panel preview popup (canvas + BroadcastChannel)"
```

---

## Task 6: Express route for `/panel/:sessionId`

**Files:**
- Modify: `packages/server-core/server/network/expressApp.js`

**Step 1: Find the static directories section (~line 375) and add `panel` to it**

After line:
```js
const staticDirectories = ['css', 'js', 'emdr-therapy']
```

Change to:
```js
const staticDirectories = ['css', 'js', 'emdr-therapy', 'panel']
```

**Step 2: Add SPA route for `/panel/:sessionId` after the `/c/:sessionId` route (~line 676)**

After:
```js
app.get('/c/:sessionId', (req, res) => {
  ...
})
```

Add:
```js
// Therapist panel (React SPA) — serve index.html for any /panel/* path
app.get('/panel/:sessionId', (req, res) => {
  setNoCacheHeaders(res)
  res.sendFile(path.join(publicPath, 'panel', 'index.html'))
})
```

**Step 3: Verify server starts**

```bash
cd /path/to/project && npm run dev
```

Then open `http://localhost:3000/panel/test123` — should serve the React app.

**Step 4: Commit**

```bash
git add packages/server-core/server/network/expressApp.js
git commit -m "feat: add /panel/:sessionId route to Express"
```

---

## Task 7: Add build script to root package.json

**Files:**
- Modify: `package.json`

**Step 1: Add panel build script**

In `package.json` `scripts` section, add:

```json
"build:panel": "cd packages/therapist-panel && npm run build",
"dev:panel": "cd packages/therapist-panel && npm run dev"
```

**Step 2: Add `packages/therapist-panel` to workspaces array**

```json
"workspaces": [
  "packages/server-core",
  "packages/web-client",
  "packages/therapist-panel"
]
```

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add therapist-panel to workspaces and build scripts"
```

---

## Task 8: Manual smoke test

**Step 1: Build the panel**

```bash
npm run build:panel
```

Expected: `packages/web-client/public/panel/index.html` exists.

**Step 2: Start dev server**

```bash
npm run dev
```

**Step 3: Create a test session**

```bash
curl -s -X POST http://localhost:3000/api/session | python3 -m json.tool
```

Note the `sessionId` from response.

**Step 4: Open panel in browser**

Navigate to `http://localhost:3000/panel/<sessionId>`.

Verify:
- Panel loads (dark background, session ID in header)
- Speed slider moves
- Settings section expands/collapses
- "Открыть превью" opens popup

**Step 5: Open viewer in another tab**

Navigate to `http://localhost:3000/s/<sessionId>`.

Verify:
- Header shows "● Клиент подключён"
- Start BLS button starts the ball moving in viewer
- Stop button stops it

**Step 6: Commit if all good**

```bash
git add .
git commit -m "feat: therapist panel complete"
```

---

## Notes

**State_update payload format** (from existing server, `SessionManager.js`):
Check what fields are actually broadcast — `x`, `y`, `isPlaying`, `speed`, `ballColor`, `backgroundColor`, `ballSize` are standard. The `passes`, `sets`, `timerMs` fields come from `bbCounters` on the existing controller — confirm these are in the WS broadcast by checking `StateBroadcaster.js` before Task 2.

**If `passes/sets/timerMs` are NOT in state_update:**
The counters may only exist client-side in the existing `controller.js`. In that case, implement a local counter in `App.tsx` that counts bounces from `bounce_sync` messages — 2 bounces = 1 pass, N passes = 1 set (based on auto-stop settings).

**ESLint:** The project uses a flat ESLint config. The `packages/therapist-panel/` directory may need to be excluded or have its own config. If lint fails on CI, add `packages/therapist-panel/` to the ignore list in `eslint.config.js`.
