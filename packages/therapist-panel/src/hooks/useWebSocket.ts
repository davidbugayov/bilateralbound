import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Counters — client-side only
  const bounceCountRef = useRef(0) // total wall hits received
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [viewerConnected, setViewerConnected] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [passes, setPasses] = useState(0)
  const [sets, setSets] = useState(0)
  const [timerMs, setTimerMs] = useState(0)

  // BroadcastChannel to forward ball position to preview popup
  const bcRef = useRef<BroadcastChannel | null>(null)

  const handleMessage = useCallback((data: string) => {
    let msg: { type: string; payload?: Record<string, unknown> }
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }

    if (msg.type === 'state_update' || msg.type === 'initial_state') {
      const p = msg.payload as Record<string, unknown>

      // Forward ball position to preview popup
      bcRef.current?.postMessage({ type: 'ball', ...p })

      if (typeof p.viewerConnected === 'boolean') {
        setViewerConnected(p.viewerConnected)
      }

      // Sync isPlaying from server only on initial_state to avoid overriding user's local toggle
      if (msg.type === 'initial_state' && typeof p.isPlaying === 'boolean') {
        const playing = p.isPlaying
        setIsPlaying(playing)
        if (playing) {
          if (!timerIntervalRef.current) {
            timerIntervalRef.current = setInterval(() => setTimerMs(t => t + 100), 100)
          }
        } else {
          clearInterval(timerIntervalRef.current ?? undefined)
          timerIntervalRef.current = null
        }
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
    if (typeof BroadcastChannel !== 'undefined') {
      bcRef.current = new BroadcastChannel('bb_preview')
    }
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
      clearInterval(timerIntervalRef.current ?? undefined)
      timerIntervalRef.current = null
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  // Toggle play/pause — call this from App when user clicks Start/Stop
  const setPlaying = useCallback((playing: boolean) => {
    setIsPlaying(playing)
    if (playing) {
      if (!timerIntervalRef.current) {
        timerIntervalRef.current = setInterval(() => setTimerMs(t => t + 100), 100)
      }
    } else {
      clearInterval(timerIntervalRef.current ?? undefined)
      timerIntervalRef.current = null
    }
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
    setPlaying,
    resetCounters,
    sendUpdate,
  }
}
