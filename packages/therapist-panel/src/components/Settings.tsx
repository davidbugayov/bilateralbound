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
              aria-label="Цвет шара"
            />
            <span className="text-xs text-zinc-600 font-mono">{ballColor}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-400 w-24">Фон</label>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              aria-label="Цвет фона"
            />
            <span className="text-xs text-zinc-600 font-mono">{bgColor}</span>
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
