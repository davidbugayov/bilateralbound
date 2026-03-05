import React from 'react'

type Props = {
  speed: number
  soundEnabled: boolean
  onSpeedChange: (v: number) => void
  onSoundToggle: (v: boolean) => void
}

export default function SpeedSlider({ speed, soundEnabled, onSpeedChange, onSoundToggle }: Props) {
  return (
    <div className="px-3 py-2 flex flex-col gap-2 border-b border-zinc-700">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400 w-16 shrink-0">Скорость</span>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="flex-1 accent-blue-500 cursor-pointer"
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
          aria-label={soundEnabled ? 'Выключить звук' : 'Включить звук'}
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
