/* jshint node: true, esversion: 11, strict: true */
'use strict'
const fs = require('node:fs')

class AnalyticsCollector {
  constructor(logger) {
    this.logger = logger
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
    this.totalPairTimeMs = 0 // cumulative ms from controller connect -> viewer connect
    this.pairedWithTimeCount = 0 // how many paired sessions have timing data
    // Timestamps of session creations for today/week/month breakdown (last 90 days kept)
    this.sessionTimestamps = []
    // In-memory session tracking
    // sessionId -> { startTs, viewerConnected, controllerConnected, hasPair, controllerTs, viewerTs }
    this._sessionMeta = new Map()
    // Session error tracking
    this.sessionErrors = 0
    this.recentSessionErrors = [] // last 50: { ts, sessionId, type }
    // Stale sessions: controller created but viewer never connected
    this.totalStaleSessions = 0
    // Physics tick jitter tracking (circular buffer, last 120 intervals)
    this._physicsTickIntervals = new Array(120).fill(0)
    this._physicsTickHead = 0
    this._physicsTickCount = 0
    // Persist every N requests to reduce I/O
    this._requestsSinceLastPersist = 0
    this._persistDirty = false
    this._persistTimer = null
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
        this.sessionErrors = data.sessionErrors || 0
        this.totalStaleSessions = data.totalStaleSessions || 0
        this.recentSessionErrors = data.recentSessionErrors || []
        this.sessionTimestamps = data.sessionTimestamps || []
      }
    } catch {
      /* ignore — fresh start */
    }
  }

  _persist() {
    this._persistDirty = true
    if (this._persistTimer) return
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null
      if (!this._persistDirty) return
      this._persistDirty = false
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
          sessionErrors: this.sessionErrors,
          totalStaleSessions: this.totalStaleSessions,
          recentSessionErrors: this.recentSessionErrors.slice(-50),
          sessionTimestamps: this._trimTimestamps(
            Date.now() - 90 * 24 * 3600 * 1000
          ),
          savedAt: Date.now()
        }
        fs.writeFileSync(this._persistPath, JSON.stringify(data), 'utf8')
      } catch {
        /* ignore */
      }
    }, 2000)
    if (this._persistTimer.unref) this._persistTimer.unref()
  }

  _trimTimestamps(cutoffMs) {
    this.sessionTimestamps = this.sessionTimestamps.filter(
      (ts) => ts >= cutoffMs
    )
    return this.sessionTimestamps
  }

  _countSessionsSince(sinceMs) {
    return this.sessionTimestamps.filter((ts) => ts >= sinceMs).length
  }

  recordSessionCreated(sessionId) {
    this.totalSessionsCreated++
    this.sessionTimestamps.push(Date.now())
    // Trim entries older than 90 days to cap memory
    if (this.sessionTimestamps.length > 5000) {
      this._trimTimestamps(Date.now() - 90 * 24 * 3600 * 1000)
    }
    // Cap _sessionMeta to prevent leak when sessions are LRU-evicted
    // without going through recordSessionEnded (e.g. _enforceSessionLimit)
    if (this._sessionMeta.size > 1200) {
      const oldestKey = this._sessionMeta.keys().next().value
      if (oldestKey) this._sessionMeta.delete(oldestKey)
    }
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
      // Track sessions where viewer never connected (stale/funnel drop)
      if (meta.controllerConnected && !meta.viewerConnected) {
        this.totalStaleSessions++
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

  recordSessionError(sessionId, type) {
    this.sessionErrors++
    this.recentSessionErrors.push({ ts: Date.now(), sessionId, type })
    if (this.recentSessionErrors.length > 50) this.recentSessionErrors.shift()
    this._persist()
  }

  recordPhysicsTick(actualIntervalMs) {
    this._physicsTickIntervals[this._physicsTickHead] = actualIntervalMs
    this._physicsTickHead = (this._physicsTickHead + 1) % 120
    if (this._physicsTickCount < 120) this._physicsTickCount++
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

  /**
   * Compute percentile from sorted array
   */
  _percentile(sorted, p) {
    if (sorted.length === 0) return 0
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }

  getStats(currentSessionCount = 0) {
    const now = Date.now()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const uptimeSec = Math.floor((now - this.startedAt) / 1000)
    const durations = this.completedSessionDurations
    const sortedDurations =
      durations.length > 0 ? [...durations].sort((a, b) => a - b) : []
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

    const ticks =
      this._physicsTickCount > 0
        ? this._physicsTickIntervals.slice(0, this._physicsTickCount)
        : []
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
        today: this._countSessionsSince(startOfToday.getTime()),
        last7days: this._countSessionsSince(now - 7 * 24 * 3600 * 1000),
        last30days: this._countSessionsSince(now - 30 * 24 * 3600 * 1000),
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
        p50DurationMs: this._percentile(sortedDurations, 50),
        p90DurationMs: this._percentile(sortedDurations, 90),
        p99DurationMs: this._percentile(sortedDurations, 99),
        avgDurationHuman: this._formatDuration(avgDurationMs),
        maxDurationHuman: this._formatDuration(maxDurationMs),
        p50DurationHuman: this._formatDuration(
          this._percentile(sortedDurations, 50)
        ),
        p90DurationHuman: this._formatDuration(
          this._percentile(sortedDurations, 90)
        ),
        staleSessions: this.totalStaleSessions,
        staleRate:
          this.totalSessionsCreated > 0
            ? `${Math.round((this.totalStaleSessions / this.totalSessionsCreated) * 100)}%`
            : '0%'
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
      languages: sortedLangs,
      sessionErrors: {
        total: this.sessionErrors,
        recent: this.recentSessionErrors.slice(-20)
      }
    }
  }

  _formatUptime(sec) {
    const d = Math.floor(sec / 86400)
    const h = Math.floor((sec % 86400) / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  _formatDuration(ms) {
    if (ms === 0) return 'n/a'
    const sec = Math.floor(ms / 1000)
    const min = Math.floor(sec / 60)
    const s = sec % 60
    if (min > 0) return `${min}m ${s}s`
    return `${sec}s`
  }
}

module.exports = AnalyticsCollector
