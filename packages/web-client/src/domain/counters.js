'use strict'
/**
 * Counters - Счётчики сессии (таймер, пассы, сеты)
 * @module domain/counters
 */
const bbCounters = {
  timerMs: 0,
  totalSessionMs: 0,
  passes: 0,
  sets: 0,
  running: false,
  status: 'ready', // 'ready' | 'running' | 'paused'
  lastTickTs: 0,
  lastElapsedMs: 0,
  $timer: null,
  $passes: null,
  $sets: null,
  $passesPerSecond: null,
  $speedInfo: null,
  _lastBounceTs: 0,
  bounceHits: 0,
  _passesHistory: [],
  _lastSpeedMeasurement: 0,
  _measurementInterval: null,
  _currentPassesPerSecond: 0,
  autoStopPasses: 0,
  autoStopSeconds: 0,
  onAutoStop: null,
  _autoStopFired: false,
  $countdownRow: null,
  $countdownPasses: null,
  $countdownSeconds: null,
  // Header session timer elements
  $headerSessionTimer: null,
  $headerTimer: null,
  $headerTimerBadge: null,
  $headerTimerTotal: null,
  $headerTimerDot: null,
  $headerResetBtn: null,
  // Controller timer elements
  $controllerTimerBadge: null,
  $controllerTotalTimer: null,
  $controllerResetBtn: null,
  // Fullscreen overlay timer element
  $fsTimer: null,
  initDom() {
    this.$timer = document.getElementById('bbTimer')
    this.$passes = document.getElementById('bbPasses')
    this.$sets = document.getElementById('bbSets')
    this.$passesPerSecond = document.getElementById('bbPassesPerSecond')
    this.$speedInfo = document.getElementById('speedInfo')
    this.$countdownRow = document.getElementById('autoStopCountdownRow')
    this.$countdownPasses = document.getElementById('autoStopCountdownPasses')
    this.$countdownSeconds = document.getElementById(
      'autoStopCountdownSeconds'
    )

    // Header timer elements
    this.$headerSessionTimer = document.getElementById('headerSessionTimer')
    this.$headerTimer = document.getElementById('headerTimer')
    this.$headerTimerBadge = document.getElementById('headerTimerBadge')
    this.$headerTimerTotal = document.getElementById('headerTimerTotal')
    this.$headerTimerDot = document.getElementById('headerTimerDot')
    this.$headerResetBtn = document.getElementById('headerResetTimerBtn')

    // Controller timer elements
    this.$controllerTimerBadge = document.getElementById('controllerTimerBadge')
    this.$controllerTotalTimer = document.getElementById('controllerTotalTimer')
    this.$controllerResetBtn = document.getElementById('bbResetBtn')

    // Fullscreen timer element
    this.$fsTimer = document.getElementById('fsTimer')

    if (this.$headerResetBtn) {
      this.$headerResetBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.resetTimer()
      })
    }

    if (this.$controllerResetBtn) {
      this.$controllerResetBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.resetTimer()
      })
    }

    const resetSessionBtn = document.querySelector('.session-reset-btn')
    if (resetSessionBtn) {
      // Handled via resetSession() in controller.js, which calls resetAll()
    }

    this.initSpeedMeasurement()
    this.render()
  },
  initSpeedMeasurement() {
    this._measurementInterval = setInterval(() => {
      this.updatePassesPerSecond()
    }, 2000)
  },
  updatePassesPerSecond() {
    if (!this.running) {
      this._currentPassesPerSecond = 0
      return
    }
    const now = performance.now()
    this._passesHistory = this._passesHistory.filter(
      (timestamp) => now - timestamp < 2000
    )
    const passesInLast2Seconds = this._passesHistory.length / 2
    this._currentPassesPerSecond = Math.round(passesInLast2Seconds * 10) / 10
    this.renderSpeedInfo()
  },
  addPassMeasurement() {
    this._passesHistory.push(performance.now())
    this.updatePassesPerSecond()
  },
  start() {
    this.running = true
    this.status = 'running'
    this.lastTickTs = performance.now()
    this._passesHistory = []
    this._autoStopFired = false
    this.render()
  },
  stop(incrementSet = false) {
    this.tick(performance.now())
    this.lastElapsedMs = this.timerMs
    this.running = false
    if (incrementSet) {
      this.sets += 1
      this.passes = 0
      this.bounceHits = 0
      this._lastBounceTs = 0
      this._passesHistory = []
      this.timerMs = 0
      this.status = 'ready'
      try {
        if (typeof globalThis !== 'undefined' && globalThis.sessionLogger?.onSet) {
          globalThis.sessionLogger.onSet()
        }
      } catch (e) {
        void e
      }
    } else {
      this.status = this.timerMs > 0 ? 'paused' : 'ready'
    }
    this.render()
  },
  resetTimer() {
    this.timerMs = 0
    this.lastElapsedMs = 0
    this.status = this.running ? 'running' : 'ready'
    this.render()
  },
  getElapsedSeconds() {
    return Math.floor((this.lastElapsedMs || this.timerMs || 0) / 1000)
  },
  resetAll() {
    this.lastElapsedMs = 0
    this.timerMs = 0
    this.totalSessionMs = 0
    this.passes = 0
    this.sets = 0
    this.bounceHits = 0
    this._lastBounceTs = 0
    this._passesHistory = []
    this._currentPassesPerSecond = 0
    this.status = this.running ? 'running' : 'ready'
    this.render()
  },
  onBounce() {
    if (!this.running) return
    const now = performance.now()
    if (now - this._lastBounceTs < 120) return
    this._lastBounceTs = now
    this.bounceHits += 1
    if (this.bounceHits % 2 === 0) {
      this.passes += 1
      this.addPassMeasurement()
      try {
        if (typeof globalThis !== 'undefined' && globalThis.sessionLogger?.onPass) {
          globalThis.sessionLogger.onPass()
        }
      } catch (e) {
        void e
      }
      if (this.autoStopPasses > 0 && this.passes >= this.autoStopPasses) {
        this.render()
        this._triggerAutoStop()
        return
      }
    }
    this.render()
  },
  tick(nowTs) {
    if (!this.running) return
    const dt = nowTs - this.lastTickTs
    if (dt > 0) {
      this.timerMs += dt
      this.totalSessionMs = (this.totalSessionMs || 0) + dt
      this.lastTickTs = nowTs
      if (
        this.autoStopSeconds > 0 &&
        !this._autoStopFired &&
        this.timerMs / 1000 >= this.autoStopSeconds
      ) {
        this._triggerAutoStop()
        return
      }
      if (!this?._lastRenderTs || nowTs - (this._lastRenderTs || 0) > 100) {
        this._lastRenderTs = nowTs
        this.render()
      }
    }
  },
  _triggerAutoStop() {
    if (this._autoStopFired) return
    this._autoStopFired = true
    this.render()
    this.onAutoStop?.()
  },
  formatTime(ms) {
    if (!ms || ms <= 0) return '0:00'
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
  },
  formatTimePadded(ms) {
    if (!ms || ms <= 0) return '00:00'
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },
  render() {
    const formattedExercise = this.formatTime(this.timerMs)
    const formattedExercisePadded = this.formatTimePadded(this.timerMs)
    const formattedTotal = this.formatTime(this.totalSessionMs)
    const formattedTotalPadded = this.formatTimePadded(this.totalSessionMs)

    if (this.$timer) this.$timer.textContent = formattedExercise
    if (this.$passes) this.$passes.textContent = String(this.passes)
    if (this.$sets) this.$sets.textContent = String(this.sets)

    // Update status text & class
    let statusText = 'READY'
    let statusClass = 'ready'
    if (this.running) {
      statusText = globalThis.i18n?.t('controller.timerRunning') || 'RUNNING'
      statusClass = 'running'
    } else if (this.timerMs > 0) {
      statusText = globalThis.i18n?.t('controller.timerPaused') || 'PAUSED'
      statusClass = 'paused'
    } else {
      statusText = globalThis.i18n?.t('controller.timerReady') || 'READY'
      statusClass = 'ready'
    }

    // Controller timer elements
    if (this.$controllerTimerBadge) {
      this.$controllerTimerBadge.textContent = statusText
      this.$controllerTimerBadge.className = `controller-timer-badge ${statusClass}`
    }
    if (this.$controllerTotalTimer) {
      this.$controllerTotalTimer.textContent = formattedTotal
    }

    // Header session timer elements
    if (this.$headerTimer) {
      this.$headerTimer.textContent = formattedExercisePadded
    }
    if (this.$headerTimerBadge) {
      this.$headerTimerBadge.textContent = statusText
      this.$headerTimerBadge.className = `header-timer-badge ${statusClass}`
    }
    if (this.$headerTimerTotal) {
      this.$headerTimerTotal.textContent = formattedTotalPadded
    }
    if (this.$headerTimerDot) {
      this.$headerTimerDot.className = `header-timer-status-dot ${statusClass}`
    }

    // Fullscreen timer element
    if (this.$fsTimer) {
      this.$fsTimer.textContent = formattedExercisePadded
    }

    this._renderCountdown()
    this.renderSpeedInfo()
  },
  _renderCountdown() {
    if (!this.$countdownRow) return
    const hasPasses = this.autoStopPasses > 0
    const hasSeconds = this.autoStopSeconds > 0
    const visible = (hasPasses || hasSeconds) && this.running
    this.$countdownRow.style.display = visible ? 'flex' : 'none'
    if (!visible) return
    if (this.$countdownPasses) {
      if (hasPasses) {
        const rem = Math.max(0, this.autoStopPasses - this.passes)
        const label =
          globalThis.i18n?.t('controller.autoStopPassesLabel') || 'пасов'
        this.$countdownPasses.textContent = `${rem} ${label}`
        this.$countdownPasses.style.display = ''
      } else {
        this.$countdownPasses.style.display = 'none'
      }
    }
    if (this.$countdownSeconds) {
      if (hasSeconds) {
        const rem = Math.max(
          0,
          this.autoStopSeconds - Math.floor(this.timerMs / 1000)
        )
        const label =
          globalThis.i18n?.t('controller.autoStopSecondsLabel') || 'сек'
        this.$countdownSeconds.textContent = `${rem} ${label}`
        this.$countdownSeconds.style.display = ''
      } else {
        this.$countdownSeconds.style.display = 'none'
      }
    }
  },
  renderSpeedInfo() {
    if (this.$passesPerSecond) {
      this.$passesPerSecond.textContent =
        this._currentPassesPerSecond.toString()
    }
    const speedComponent = globalThis.components?.speed
    if (speedComponent && this.$speedInfo) {
      const currentSpeed = speedComponent.getSpeed()
      let speedCategory = ''
      let speedColor = ''
      if (currentSpeed <= 15) {
        speedCategory =
          globalThis.i18n?.t('controller.speed.verySlow') || 'Very slow'
        speedColor = '#22c55e'
      } else if (currentSpeed <= 25) {
        speedCategory = globalThis.i18n?.t('controller.speed.slow') || 'Slow'
        speedColor = '#3b82f6'
      } else if (currentSpeed <= 35) {
        speedCategory =
          globalThis.i18n?.t('controller.speed.medium') || 'Medium'
        speedColor = '#8b5cf6'
      } else if (currentSpeed <= 50) {
        speedCategory = globalThis.i18n?.t('controller.speed.fast') || 'Fast'
        speedColor = '#f59e0b'
      } else {
        speedCategory =
          globalThis.i18n?.t('controller.speed.veryFast') || 'Very fast'
        speedColor = '#ef4444'
      }
      this.$speedInfo.textContent = speedCategory
      this.$speedInfo.style.color = speedColor
    }
  }
}
let __lastBounceTs = 0
let __lastVxSign = 0
let __lastVySign = 0
function _hasBounced(currentVelocity, lastSign, minSpeed) {
  const currentSign = Math.sign(currentVelocity)
  return (
    currentSign !== 0 &&
    lastSign !== 0 &&
    currentSign !== lastSign &&
    Math.abs(currentVelocity) > minSpeed
  )
}
function detectAndCountBounceFromServer(prev, curr) {
  if (!prev || !curr) return
  if (curr.paused) return
  const minSpeed = 50
  const now = performance.now()
  if (now - __lastBounceTs < 100) return
  const bounced =
    _hasBounced(curr.vx, __lastVxSign, minSpeed) ||
    _hasBounced(curr.vy, __lastVySign, minSpeed)
  if (bounced) {
    __lastBounceTs = now
    bbCounters.onBounce()
  }
  if (Math.abs(curr.vx) > minSpeed) __lastVxSign = Math.sign(curr.vx)
  if (Math.abs(curr.vy) > minSpeed) __lastVySign = Math.sign(curr.vy)
}
if (typeof globalThis !== 'undefined') {
  globalThis.bbCounters = bbCounters
  globalThis.detectAndCountBounceFromServer = detectAndCountBounceFromServer
}

module.exports = { bbCounters, detectAndCountBounceFromServer }
