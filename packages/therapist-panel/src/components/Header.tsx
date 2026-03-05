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
