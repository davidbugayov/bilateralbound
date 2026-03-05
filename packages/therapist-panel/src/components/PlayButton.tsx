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
        {isPlaying ? '⏹ Остановить BLS' : '▶ Начать BLS'}
      </button>
    </div>
  )
}
