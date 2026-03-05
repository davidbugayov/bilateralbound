import { useState } from 'react'

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

export type SessionLogEntry = { date: string; passes: number; sets: number }

export function appendSessionLog(entry: SessionLogEntry) {
  const log: SessionLogEntry[] = get('session_log', [])
  log.push(entry)
  if (log.length > 100) log.splice(0, log.length - 100)
  set('session_log', log)
}
