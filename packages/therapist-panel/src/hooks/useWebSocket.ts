import { useEffect, useRef, useCallback, useState } from 'react'

export type BallState = {
  x: number
  y: number
  dx: number
  dy: number
  isPlaying: boolean
  ballColor: string
  backgroundColor: string
  ballSize: number
}

export type SessionState = {
  isPlaying: boolean
  viewerConnected: boolean
  passes: number
  sets: number
  timerMs: number
  ball: BallState | null
}

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Counters — client-side only
  const bounceCountRef = useRef(0) // total wall hits received
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPlayingRef = useRef(false)

  const [viewerConnected, setViewerConnected] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [passes, setPasses] = useState(0)
  const [sets, setSets] = useState(0)
  const [timerMs, setTimerMs] = useState(0)
  const [ball, setBall] = useState<BallState | null>(null)

  // BroadcastChannel to forward ball position to preview popup
  const bcRef = useRef<BroadcastChannel | null>(null)

  function startTimer() {
    if (timerIntervalRef.current) return
    timerIntervalRef.current = setInterval(() => {
      setTimerMs(t => t + 100)
    }, 100)
  }

  function stopTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  const handleMessage = useCallback((data: string) => {
    let msg: { type: string; payload?: Record<string, unknown> }
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }

    if (msg.type === 'state_update' || msg.type === 'initial_state') {
      const p = msg.payload as Partial<BallState> & { isPlaying?: boolean; viewerConnected?: boolean }

      const newBall: BallState = {
        x: (p.x as number) ?? 0,
        y: (p.y as number) ?? 0,
        dx: (p.dx as number) ?? 1,
        dy: (p.dy as number) ?? 0,
        isPlaying: (p.isPlaying as boolean) ?? false,
        ballColor: (p.ballColor as string) ?? '#3b82f6',
        backgroundColor: (p.backgroundColor as string) ?? '#000000',
        ballSize: (p.ballSize as number) ?? 3,
      }
      setBall(newBall)

      // Forward to preview popup
      bcRef.current?.postMessage({ type: 'ball', ...newBall })

      if (p.viewerConnected !== undefined) {
        setViewerConnected(p.viewerConnected as boolean)
      }

      // Sync isPlaying from server (only on initial_state to avoid conflicts)
      if (msg.type === 'initial_state' && p.isPlaying !== undefined) {
        const playing = p.isPlaying as boolean
        setIsPlaying(playing)
        isPlayingRef.current = playing
        if (playing) startTimer()
        else stopTimer()
      }
    }

    if (msg.type === 'viewer_status') {
      const p = msg.payload as { connected?: boolean; viewerConnected?: boolean }
      setViewerConnected(p.viewerConnected ?? p.connected ?? false)
    }

    if (msg.type === 'bounce_sync') {
      // Each bounce_sync = 1 wall hit; 2 hits = 1 pass
      bounceCountRef.current += 1
      setPasses(Math.floor(bounceCountRef.current / 2))
    }
  }, [])

  const connect = useCallback(() => {
    if (!sessionId) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${location.host}/?sessionId=${sessionId}&role=controller`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => handleMessage(e.data)
    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => {
      ws.close()
    }
  }, [sessionId, handleMessage])

  useEffect(() => {
    bcRef.current = new BroadcastChannel('bb_preview')
    return () => {
      bcRef.current?.close()
    }
  }, [])

  useEffect(() => {
    connect()
    const hb = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
    return () => {
      clearInterval(hb)
      stopTimer()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Toggle play/pause — call this from App when user clicks Start/Stop
  const setPlaying = useCallback((playing: boolean) => {
    setIsPlaying(playing)
    isPlayingRef.current = playing
    if (playing) startTimer()
    else stopTimer()
  }, [])

  // Reset counters — call from App when user clicks Reset
  const resetCounters = useCallback(() => {
    const currentPasses = Math.floor(bounceCountRef.current / 2)
    if (currentPasses > 0) {
      setSets(s => s + 1)
    }
    bounceCountRef.current = 0
    setPasses(0)
    setTimerMs(0)
  }, [])

  // Send controller update via REST
  const sendUpdate = useCallback(async (payload: Record<string, unknown>) => {
    if (!sessionId) return
    try {
      await fetch(`/api/session/${sessionId}/controller/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch { /* ignore network errors */ }
  }, [sessionId])

  return {
    viewerConnected,
    isPlaying,
    passes,
    sets,
    timerMs,
    ball,
    setPlaying,
    resetCounters,
    sendUpdate,
  }
}
