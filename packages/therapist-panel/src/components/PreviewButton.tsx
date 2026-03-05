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
