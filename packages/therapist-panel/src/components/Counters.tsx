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
    <div className="p-3 flex flex-col gap-2 border-b border-zinc-700">
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
