import React from 'react'
import Header from './components/Header'
import Counters from './components/Counters'
import PlayButton from './components/PlayButton'
import SpeedSlider from './components/SpeedSlider'
import Settings from './components/Settings'
import PreviewButton from './components/PreviewButton'
import { useStorage, appendSessionLog } from './hooks/useStorage'
import { useWebSocket } from './hooks/useWebSocket'

function getSessionId(): string | null {
  // URL: /panel/:sessionId — extract the third segment
  const parts = location.pathname.split('/')
  const id = parts[2]
  return id && id.length >= 3 ? id : null
}

export default function App() {
  const sessionId = getSessionId()

  const [speed, setSpeedStored] = useStorage('speed', 1.0)
  const [ballColor, setBallColorStored] = useStorage('ballColor', '#3b82f6')
  const [bgColor, setBgColorStored] = useStorage('bgColor', '#000000')
  const [ballSize, setBallSizeStored] = useStorage('ballSize', 3)
  const [soundEnabled, setSoundStored] = useStorage('sound', false)

  const {
    viewerConnected,
    isPlaying,
    passes,
    sets,
    timerMs,
    setPlaying,
    resetCounters,
    sendUpdate,
  } = useWebSocket(sessionId)

  function buildPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      speed,
      ballColor,
      backgroundColor: bgColor,
      ballSize,
      soundEnabled,
      ...overrides,
    }
  }

  function handlePlayToggle() {
    const next = !isPlaying
    setPlaying(next)
    sendUpdate(buildPayload({ isPlaying: next }))
    if (!next && passes > 0) {
      appendSessionLog({ date: new Date().toISOString(), passes, sets })
    }
  }

  function handleReset() {
    resetCounters()
    sendUpdate(buildPayload({ isPlaying: false }))
  }

  function handleSpeed(v: number) {
    setSpeedStored(v)
    sendUpdate(buildPayload({ speed: v }))
  }

  function handleBallColor(v: string) {
    setBallColorStored(v)
    sendUpdate(buildPayload({ ballColor: v }))
  }

  function handleBgColor(v: string) {
    setBgColorStored(v)
    sendUpdate(buildPayload({ backgroundColor: v }))
  }

  function handleBallSize(v: number) {
    setBallSizeStored(v)
    sendUpdate(buildPayload({ ballSize: v }))
  }

  function handleSound(v: boolean) {
    setSoundStored(v)
    sendUpdate(buildPayload({ soundEnabled: v }))
  }

  if (!sessionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 bg-zinc-900">
        <p className="text-zinc-400 text-sm text-center">
          Откройте панель по ссылке:<br />
          <code className="text-zinc-200">/panel/:sessionId</code>
        </p>
        <a href="/" className="text-blue-400 hover:text-blue-300 text-sm underline">
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
