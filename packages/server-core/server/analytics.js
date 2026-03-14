/* jshint node: true, esversion: 11, strict: true */
'use strict'
const fs = require('node:fs')

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
    this.errors4xxPaths = {} // path -> count, top 50 kept
    this.completedSessionDurations = [] // last 200 durations in ms
    this.languageStats = {}
    this.totalPairedSessions = 0 // sessions where both viewer + controller connected
    this.totalPairTimeMs = 0 // cumulative ms from controller connect → viewer connect
    this.pairedWithTimeCount = 0 // how many paired sessions have timing data
    // In-memory session tracking
    // sessionId -> { startTs, viewerConnected, controllerConnected, hasPair, controllerTs, viewerTs }
    this._sessionMeta = new Map()
    // Physics tick jitter tracking (last 120 intervals, ~2 seconds at 60Hz)
    this._physicsTickIntervals = []
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
        this.errors4xxPaths = data.errors4xxPaths || {}
        this.completedSessionDurations = data.completedSessionDurations || []
        this.languageStats = data.languageStats || {}
        this.totalPairedSessions = data.totalPairedSessions || 0
        this.totalPairTimeMs = data.totalPairTimeMs || 0
        this.pairedWithTimeCount = data.pairedWithTimeCount || 0
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
        errors4xxPaths: this.errors4xxPaths,
        completedSessionDurations: this.completedSessionDurations.slice(-200),
        languageStats: this.languageStats,
        totalPairedSessions: this.totalPairedSessions,
        totalPairTimeMs: this.totalPairTimeMs,
        pairedWithTimeCount: this.pairedWithTimeCount,
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
      hasPair: false,
      controllerTs: null,
      viewerTs: null
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
      meta.viewerTs = Date.now()
      if (meta.controllerConnected && !meta.hasPair) {
        meta.hasPair = true
        this.totalPairedSessions++
        // Track time from controller connect to viewer connect
        if (meta.controllerTs) {
          this.totalPairTimeMs += meta.viewerTs - meta.controllerTs
          this.pairedWithTimeCount++
        }
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
      meta.controllerTs = Date.now()
      if (meta.viewerConnected && !meta.hasPair) {
        meta.hasPair = true
        this.totalPairedSessions++
        // Viewer connected before controller (rare) — track time too
        if (meta.viewerTs) {
          this.totalPairTimeMs += meta.controllerTs - meta.viewerTs
          this.pairedWithTimeCount++
        }
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

  recordHttpError(statusCode, path) {
    if (statusCode >= 500) {
      this.errors5xx++
    } else if (statusCode >= 400) {
      this.errors4xx++
      if (path) {
        this.errors4xxPaths[path] = (this.errors4xxPaths[path] || 0) + 1
        // Keep only top 50 paths to cap memory
        const entries = Object.entries(this.errors4xxPaths)
        if (entries.length > 50) {
          entries.sort((a, b) => b[1] - a[1])
          this.errors4xxPaths = Object.fromEntries(entries.slice(0, 50))
        }
      }
    }
    this._persist()
  }

  recordPhysicsTick(actualIntervalMs) {
    this._physicsTickIntervals.push(actualIntervalMs)
    if (this._physicsTickIntervals.length > 120)
      this._physicsTickIntervals.shift()
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

    const ticks = this._physicsTickIntervals
    const TARGET_TICK_MS = 1000 / 60
    const avgTickMs = ticks.length
      ? Math.round((ticks.reduce((a, b) => a + b, 0) / ticks.length) * 10) / 10
      : 0
    const maxTickMs = ticks.length
      ? Math.round(Math.max(...ticks) * 10) / 10
      : 0
    const jitterMs = ticks.length
      ? Math.round(
          Math.max(...ticks.map((t) => Math.abs(t - TARGET_TICK_MS))) * 10
        ) / 10
      : 0

    const avgPairTimeMs =
      this.pairedWithTimeCount > 0
        ? Math.round(this.totalPairTimeMs / this.pairedWithTimeCount)
        : 0

    const sorted4xxPaths = Object.entries(this.errors4xxPaths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
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
        pairRate:
          this.totalSessionsCreated > 0
            ? `${Math.round((this.totalPairedSessions / this.totalSessionsCreated) * 100)}%`
            : '0%',
        avgTimeToViewerMs: avgPairTimeMs,
        avgTimeToViewerHuman: this._formatDuration(avgPairTimeMs),
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
        errors5xx: this.errors5xx,
        errors4xxPaths: sorted4xxPaths
      },
      physics: {
        avgTickMs,
        maxTickMs,
        jitterMs,
        sampleCount: ticks.length
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
