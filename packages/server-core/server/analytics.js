'use strict'
const fs = require('node:fs')
const path = require('node:path')

class Analytics {
  constructor() {
    this.startedAt = Date.now()
    // Counters (current session, reset on restart)
    this.currentWsViewers = 0
    this.currentWsControllers = 0
    // Persisted totals
    this.totalSessionsCreated = 0
    this.peakConcurrentSessions = 0
    this.totalViewerConnections = 0
    this.totalControllerConnections = 0
    this.totalHttpRequests = 0
    this.errors4xx = 0
    this.errors5xx = 0
    this.completedSessionDurations = [] // last 200 durations in ms
    this.languageStats = {}
    this.totalPairedSessions = 0 // sessions where both viewer + controller connected
    // In-memory session tracking
    this._sessionMeta = new Map() // sessionId -> { startTs, viewerConnected, controllerConnected, hasPair }
    // Persist every N requests to reduce I/O
    this._requestsSinceLastPersist = 0
    this._persistPath = this._resolvePersistPath()
    this._loadPersistedData()
  }

  _resolvePersistPath() {
    const port = process.env.NODE_PORT || process.env.PORT || '3000'
    return `/tmp/emdr-analytics-${port}.json`
  }

  _loadPersistedData() {
    try {
      if (fs.existsSync(this._persistPath)) {
        const data = JSON.parse(fs.readFileSync(this._persistPath, 'utf8'))
        this.totalSessionsCreated = data.totalSessionsCreated || 0
        this.peakConcurrentSessions = data.peakConcurrentSessions || 0
        this.totalViewerConnections = data.totalViewerConnections || 0
        this.totalControllerConnections = data.totalControllerConnections || 0
        this.totalHttpRequests = data.totalHttpRequests || 0
        this.errors4xx = data.errors4xx || 0
        this.errors5xx = data.errors5xx || 0
        this.completedSessionDurations = data.completedSessionDurations || []
        this.languageStats = data.languageStats || {}
        this.totalPairedSessions = data.totalPairedSessions || 0
      }
    } catch {
      /* ignore — fresh start */
    }
  }

  _persist() {
    try {
      const data = {
        totalSessionsCreated: this.totalSessionsCreated,
        peakConcurrentSessions: this.peakConcurrentSessions,
        totalViewerConnections: this.totalViewerConnections,
        totalControllerConnections: this.totalControllerConnections,
        totalHttpRequests: this.totalHttpRequests,
        errors4xx: this.errors4xx,
        errors5xx: this.errors5xx,
        completedSessionDurations: this.completedSessionDurations.slice(-200),
        languageStats: this.languageStats,
        totalPairedSessions: this.totalPairedSessions,
        savedAt: Date.now()
      }
      fs.writeFileSync(this._persistPath, JSON.stringify(data), 'utf8')
    } catch {
      /* ignore */
    }
  }

  recordSessionCreated(sessionId) {
    this.totalSessionsCreated++
    this._sessionMeta.set(sessionId, {
      startTs: Date.now(),
      viewerConnected: false,
      controllerConnected: false,
      hasPair: false
    })
    this._persist()
  }

  recordSessionEnded(sessionId) {
    const meta = this._sessionMeta.get(sessionId)
    if (meta) {
      const duration = Date.now() - meta.startTs
      this.completedSessionDurations.push(duration)
      if (this.completedSessionDurations.length > 200) {
        this.completedSessionDurations.shift()
      }
      this._sessionMeta.delete(sessionId)
      this._persist()
    }
  }

  recordViewerConnected(sessionId) {
    this.totalViewerConnections++
    this.currentWsViewers++
    const meta = this._sessionMeta.get(sessionId)
    if (meta && !meta.viewerConnected) {
      meta.viewerConnected = true
      if (meta.controllerConnected && !meta.hasPair) {
        meta.hasPair = true
        this.totalPairedSessions++
      }
    }
    this._persist()
  }

  recordViewerDisconnected() {
    this.currentWsViewers = Math.max(0, this.currentWsViewers - 1)
  }

  recordControllerConnected(sessionId) {
    this.totalControllerConnections++
    this.currentWsControllers++
    const meta = this._sessionMeta.get(sessionId)
    if (meta && !meta.controllerConnected) {
      meta.controllerConnected = true
      if (meta.viewerConnected && !meta.hasPair) {
        meta.hasPair = true
        this.totalPairedSessions++
      }
    }
    this._persist()
  }

  recordControllerDisconnected() {
    this.currentWsControllers = Math.max(0, this.currentWsControllers - 1)
  }

  recordHttpRequest() {
    this.totalHttpRequests++
    this._requestsSinceLastPersist++
    if (this._requestsSinceLastPersist >= 100) {
      this._requestsSinceLastPersist = 0
      this._persist()
    }
  }

  recordHttpError(statusCode) {
    if (statusCode >= 500) {
      this.errors5xx++
    } else if (statusCode >= 400) {
      this.errors4xx++
    }
    this._persist()
  }

  recordLanguage(lang) {
    if (!lang || typeof lang !== 'string') return
    this.languageStats[lang] = (this.languageStats[lang] || 0) + 1
    const total = Object.values(this.languageStats).reduce((a, b) => a + b, 0)
    if (total % 20 === 0) this._persist()
  }

  updatePeak(currentCount) {
    if (currentCount > this.peakConcurrentSessions) {
      this.peakConcurrentSessions = currentCount
      this._persist()
    }
  }

  getStats(currentSessionCount = 0) {
    const uptimeSec = Math.floor((Date.now() - this.startedAt) / 1000)
    const durations = this.completedSessionDurations
    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0
    const maxDurationMs = durations.length > 0 ? Math.max(...durations) : 0
    const sortedLangs = Object.entries(this.languageStats)
      .sort((a, b) => b[1] - a[1])
      .reduce((obj, [k, v]) => {
        obj[k] = v
        return obj
      }, {})

    return {
      server: {
        startedAt: new Date(this.startedAt).toISOString(),
        uptimeSec,
        uptimeHuman: this._formatUptime(uptimeSec)
      },
      sessions: {
        totalCreated: this.totalSessionsCreated,
        currentActive: currentSessionCount,
        peakConcurrent: this.peakConcurrentSessions,
        completedCount: durations.length,
        pairedSessions: this.totalPairedSessions,
        avgDurationMs,
        maxDurationMs,
        avgDurationHuman: this._formatDuration(avgDurationMs),
        maxDurationHuman: this._formatDuration(maxDurationMs)
      },
      connections: {
        totalViewers: this.totalViewerConnections,
        totalControllers: this.totalControllerConnections,
        currentWsViewers: this.currentWsViewers,
        currentWsControllers: this.currentWsControllers
      },
      http: {
        totalRequests: this.totalHttpRequests,
        errors4xx: this.errors4xx,
        errors5xx: this.errors5xx
      },
      languages: sortedLangs
    }
  }

  _formatUptime(sec) {
    const d = Math.floor(sec / 86400)
    const h = Math.floor((sec % 86400) / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (d > 0) return `${d}д ${h}ч ${m}м`
    if (h > 0) return `${h}ч ${m}м`
    if (m > 0) return `${m}м ${s}с`
    return `${s}с`
  }

  _formatDuration(ms) {
    if (ms === 0) return 'н/д'
    const sec = Math.floor(ms / 1000)
    const min = Math.floor(sec / 60)
    const s = sec % 60
    if (min > 0) return `${min}м ${s}с`
    return `${sec}с`
  }
}

module.exports = new Analytics()
