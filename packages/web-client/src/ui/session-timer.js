/* global globalThis */
'use strict'

/**
 * SessionTimer - Visual Clinical Session Duration Tracker for EMDR Therapists.
 * Provides high-visibility elapsed/remaining time, target presets (30m, 45m, 50m, 60m, 90m, ∞),
 * SVG radial progress gauge, bilateral vs dialogue ratio tracking, milestone warnings (Phase 7 Closure),
 * and persistent wall-clock synchronization.
 *
 * @module ui/session-timer
 */

const STORAGE_PREFIX = 'bb_session_timer_'
const CIRCLE_CIRCUMFERENCE = 263.89 // 2 * Math.PI * 42

class SessionTimer {
  constructor() {
    this.sessionId = ''
    this.isRunning = false
    this.elapsedMs = 0
    this.activeBilateralMs = 0
    this.targetMinutes = 50 // Standard EMDR therapy hour
    this.displayMode = 'elapsed' // 'elapsed' | 'countdown'
    this.autoStart = true
    this.soundAlerts = true
    this.fiveMinWarningFired = false
    this.targetReachedFired = false

    this._intervalId = null
    this._lastTickTs = 0
    this._startWallTime = null

    // DOM References
    this.$card = null
    this.$displayTime = null
    this.$modeSubtitle = null
    this.$modeBadge = null
    this.$gaugeProgress = null
    this.$gaugePercent = null
    this.$gaugeTargetLabel = null
    this.$statusBadge = null
    this.$statusText = null
    this.$toggleBtn = null
    this.$toggleIcon = null
    this.$toggleText = null
    this.$resetBtn = null
    this.$addFiveBtn = null
    this.$soundToggle = null
    this.$autoStartCheckbox = null
    this.$ratioFill = null
    this.$bilateralTime = null
    this.$bilateralRatio = null
    this.$presetChips = []

    // Mirror widgets
    this.$headerWidget = null
    this.$headerDisplay = null
    this.$headerTarget = null
    this.$fsDisplay = null
    this.$fsText = null
    this.$fsTarget = null
  }

  /**
   * Initialize SessionTimer with session ID and DOM elements
   * @param {string} [sessionId] - Optional session identifier
   */
  init(sessionId) {
    this.sessionId = sessionId || this._resolveSessionId()
    this._loadState()
    this._initDom()
    this._bindEvents()
    this.render()

    // If timer was running before reload, resume it with elapsed wall-clock time
    if (this.isRunning) {
      this._resumeRunningTimer()
    }
  }

  _resolveSessionId() {
    try {
      if (typeof globalThis !== 'undefined') {
        if (globalThis.__current?.sessionId) return globalThis.__current.sessionId
        if (typeof globalThis.getSessionIdFromUrl === 'function') {
          const sid = globalThis.getSessionIdFromUrl()
          if (sid) return sid
        }
        if (typeof window !== 'undefined' && window.location) {
          const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/)
          if (match && match[1]) return match[1]
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return 'default'
  }

  _initDom() {
    if (typeof document === 'undefined') return

    this.$card = document.getElementById('sessionTimerCard')
    this.$displayTime = document.getElementById('stDisplayTime')
    this.$modeSubtitle = document.getElementById('stModeSubtitle')
    this.$modeBadge = document.getElementById('stModeBadge')
    this.$gaugeProgress = document.getElementById('stGaugeProgress')
    this.$gaugePercent = document.getElementById('stGaugePercent')
    this.$gaugeTargetLabel = document.getElementById('stGaugeTargetLabel')
    this.$statusBadge = document.getElementById('stStatusBadge')
    this.$statusText = document.getElementById('stStatusText')
    this.$toggleBtn = document.getElementById('stToggleBtn')
    this.$toggleIcon = document.getElementById('stToggleIcon')
    this.$toggleText = document.getElementById('stToggleText')
    this.$resetBtn = document.getElementById('stResetBtn')
    this.$addFiveBtn = document.getElementById('stAddFiveBtn')
    this.$soundToggle = document.getElementById('stSoundToggle')
    this.$autoStartCheckbox = document.getElementById('stAutoStartCheckbox')
    this.$ratioFill = document.getElementById('stRatioFill')
    this.$bilateralTime = document.getElementById('stBilateralTime')
    this.$bilateralRatio = document.getElementById('stBilateralRatio')

    this.$presetChips = Array.from(document.querySelectorAll('.st-preset-chip'))

    // Mirror widgets
    this.$headerWidget = document.getElementById('headerSessionTimer')
    this.$headerDisplay = document.getElementById('headerTimerDisplay')
    this.$headerTarget = document.getElementById('headerTimerTarget')
    this.$fsDisplay = document.getElementById('fsSessionTimerDisplay')
    this.$fsText = document.getElementById('fsSessionTimerText')
    this.$fsTarget = document.getElementById('fsSessionTimerTarget')
  }

  _bindEvents() {
    if (typeof document === 'undefined') return

    // Toggle Play/Pause
    if (this.$toggleBtn) {
      this.$toggleBtn.addEventListener('click', () => this.toggle())
    }

    // Reset
    if (this.$resetBtn) {
      this.$resetBtn.addEventListener('click', () => {
        if (this.elapsedMs > 5000) {
          const confirmMsg = this._t(
            'controller.sessionTimer.resetConfirm',
            'Reset session timer to 0:00?'
          )
          if (!window.confirm(confirmMsg)) return
        }
        this.reset()
      })
    }

    // Add +5 min
    if (this.$addFiveBtn) {
      this.$addFiveBtn.addEventListener('click', () => this.addMinutes(5))
    }

    // Click on digital time display toggles elapsed / countdown mode
    const toggleDisplayBtn = document.getElementById('stTimeBtnToggle')
    if (toggleDisplayBtn) {
      toggleDisplayBtn.addEventListener('click', () => this.toggleDisplayMode())
    }

    // Sound toggle button
    if (this.$soundToggle) {
      this.$soundToggle.addEventListener('click', () => {
        this.setSoundAlerts(!this.soundAlerts)
      })
    }

    // Auto-start checkbox
    if (this.$autoStartCheckbox) {
      this.$autoStartCheckbox.checked = this.autoStart
      this.$autoStartCheckbox.addEventListener('change', (e) => {
        this.setAutoStart(e.target.checked)
      })
    }

    // Target duration presets
    this.$presetChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-target'), 10)
        if (!isNaN(val)) {
          this.setTargetMinutes(val)
        }
      })
    })

    // Header widget click scrolls to or highlights timer card
    if (this.$headerWidget) {
      this.$headerWidget.addEventListener('click', () => {
        if (this.$card) {
          this.$card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          this.$card.classList.add('is-running')
          setTimeout(() => {
            if (!this.isRunning) this.$card.classList.remove('is-running')
          }, 1000)
        }
      })
    }

    // Global application event hooks
    if (typeof globalThis !== 'undefined') {
      // Auto-start when stimulation starts
      globalThis.addEventListener('bb_metrika_session_started', () => {
        this.onStimulationStarted()
      })

      // When language updates, re-render texts
      globalThis.addEventListener('i18nLanguageChanged', () => {
        this.render()
      })

      // Save before unload
      globalThis.addEventListener('beforeunload', () => {
        this._saveState()
      })
    }
  }

  // --- Core Lifecycle Methods ---

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this._lastTickTs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now()
    this._startWallTime = Date.now() - this.elapsedMs

    if (this._intervalId) clearInterval(this._intervalId)
    this._intervalId = setInterval(() => this._tick(), 250)
    if (this._intervalId && typeof this._intervalId.unref === 'function') {
      this._intervalId.unref()
    }

    this._saveState()
    this.render()

    if (typeof globalThis !== 'undefined') {
      try {
        globalThis.dispatchEvent(new CustomEvent('bb_session_timer_started', {
          detail: { sessionId: this.sessionId, elapsedMs: this.elapsedMs }
        }))
      } catch (_e) {
        // Silently ignore custom event error if unsupported
      }
    }
  }

  pause() {
    if (!this.isRunning) return
    this._accumulateTick()
    this.isRunning = false
    this._lastTickTs = 0

    if (this._intervalId) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }

    this._saveState()
    this.render()

    if (typeof globalThis !== 'undefined') {
      try {
        globalThis.dispatchEvent(new CustomEvent('bb_session_timer_paused', {
          detail: { sessionId: this.sessionId, elapsedMs: this.elapsedMs }
        }))
      } catch (_e) {
        // Silently ignore custom event error if unsupported
      }
    }
  }

  toggle() {
    if (this.isRunning) {
      this.pause()
    } else {
      this.start()
    }
  }

  reset() {
    this.pause()
    this.elapsedMs = 0
    this.activeBilateralMs = 0
    this.fiveMinWarningFired = false
    this.targetReachedFired = false
    this._startWallTime = null

    this._saveState()
    this.render()

    if (typeof globalThis !== 'undefined') {
      try {
        globalThis.dispatchEvent(new CustomEvent('bb_session_timer_reset', {
          detail: { sessionId: this.sessionId }
        }))
      } catch (_e) {
        // Silently ignore custom event error if unsupported
      }
    }
  }

  setTargetMinutes(minutes) {
    this.targetMinutes = Math.max(0, minutes)
    // If extending past current time, reset warnings
    const targetMs = this.targetMinutes * 60 * 1000
    if (this.targetMinutes === 0 || this.elapsedMs < targetMs - 5 * 60 * 1000) {
      this.fiveMinWarningFired = false
      this.targetReachedFired = false
    } else if (this.elapsedMs < targetMs) {
      this.targetReachedFired = false
    }

    this._saveState()
    this.render()
  }

  addMinutes(minutes) {
    if (this.targetMinutes === 0) {
      this.setTargetMinutes(30)
    } else {
      this.setTargetMinutes(this.targetMinutes + minutes)
    }
  }

  toggleDisplayMode() {
    this.displayMode = this.displayMode === 'elapsed' ? 'countdown' : 'elapsed'
    this._saveState()
    this.render()
  }

  setAutoStart(enabled) {
    this.autoStart = Boolean(enabled)
    this._saveState()
    if (this.$autoStartCheckbox) {
      this.$autoStartCheckbox.checked = this.autoStart
    }
  }

  setSoundAlerts(enabled) {
    this.soundAlerts = Boolean(enabled)
    this._saveState()
    this.render()
  }

  /**
   * Called when bilateral stimulation begins (Play / Spacebar)
   */
  onStimulationStarted() {
    if (this.autoStart && !this.isRunning && this.elapsedMs === 0) {
      this.start()
    }
  }

  // --- Internal Tick & Milestones ---

  _tick() {
    this._accumulateTick()
    this._checkMilestones()
    this.render()
  }

  _accumulateTick(overrideDelta) {
    if (!this.isRunning) return
    if (typeof overrideDelta === 'number' && overrideDelta > 0) {
      this.elapsedMs += overrideDelta
      return
    }

    const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now()

    if (typeof this._lastTickTs === 'number' && this._lastTickTs > 0) {
      const delta = Math.max(0, now - this._lastTickTs)
      this.elapsedMs += delta

      // Track active bilateral stimulation duration when ball is in motion
      const isStimulationActive =
        typeof globalThis !== 'undefined' &&
        (globalThis.isPlaying ||
          (globalThis.bbCounters && globalThis.bbCounters.running))
      if (isStimulationActive) {
        this.activeBilateralMs += delta
      }
    }
    this._lastTickTs = now
  }

  _checkMilestones() {
    if (this.targetMinutes <= 0) return

    const targetMs = this.targetMinutes * 60 * 1000
    const warningMs = targetMs - 5 * 60 * 1000 // 5 minutes remaining

    // 1. 5-minute warning milestone (Phase 7: Closure)
    if (!this.fiveMinWarningFired && this.targetMinutes >= 15 && this.elapsedMs >= warningMs && this.elapsedMs < targetMs) {
      this.fiveMinWarningFired = true
      this._onFiveMinWarning()
    }

    // 2. Target duration reached milestone
    if (!this.targetReachedFired && this.elapsedMs >= targetMs) {
      this.targetReachedFired = true
      this._onTargetReached()
    }
  }

  _onFiveMinWarning() {
    if (this.soundAlerts) {
      this.playHarmonicChime(523.25, 0.4) // C5 soft warning bell
    }
    const msg = this._t(
      'controller.sessionTimer.warningToast',
      '5 minutes remaining in session. Prepare client for closure & grounding.'
    )
    this._showNotification(msg)
  }

  _onTargetReached() {
    if (this.soundAlerts) {
      this.playHarmonicChime(659.25, 0.6) // E5 soft completion bell
    }
    const msg = this._t(
      'controller.sessionTimer.targetReachedToast',
      'EMDR session target duration reached. Begin Phase 7: Closure.'
    )
    this._showNotification(msg)
  }

  _resumeRunningTimer() {
    if (this._startWallTime) {
      const recalculated = Date.now() - this._startWallTime
      if (recalculated > this.elapsedMs) {
        this.elapsedMs = recalculated
      }
    }
    this.start()
  }

  // --- Rendering UI ---

  render() {
    const targetMs = this.targetMinutes * 60 * 1000
    const hasTarget = this.targetMinutes > 0
    const remainingMs = hasTarget ? Math.max(0, targetMs - this.elapsedMs) : 0
    const progressRatio = hasTarget ? Math.min(1, this.elapsedMs / targetMs) : 0
    const isCompleted = hasTarget && this.elapsedMs >= targetMs
    const isWarning =
      hasTarget &&
      !isCompleted &&
      this.targetMinutes >= 15 &&
      this.elapsedMs >= targetMs - 5 * 60 * 1000

    // 1. Digital Time String
    let displayTimeMs = this.elapsedMs
    if (this.displayMode === 'countdown' && hasTarget) {
      displayTimeMs = remainingMs
    }
    const formattedDisplay = this.formatTime(displayTimeMs)

    if (this.$displayTime) {
      this.$displayTime.textContent = formattedDisplay
    }

    // 2. Mode Subtitle & Badge
    if (this.$modeSubtitle && this.$modeBadge) {
      if (this.displayMode === 'countdown' && hasTarget) {
        this.$modeBadge.textContent = this._t('controller.sessionTimer.remaining', 'Remaining')
        this.$modeSubtitle.innerHTML = `<span class="st-mode-badge">${this._t(
          'controller.sessionTimer.remaining',
          'Remaining'
        )}</span> <span class="st-mode-hint">${this._t(
          'controller.sessionTimer.elapsed',
          'Elapsed'
        )}: ${this.formatTime(this.elapsedMs)}</span>`
      } else {
        this.$modeBadge.textContent = this._t('controller.sessionTimer.elapsed', 'Elapsed')
        if (hasTarget) {
          const remStr = this.formatTime(remainingMs)
          this.$modeSubtitle.innerHTML = `<span class="st-mode-badge">${this._t(
            'controller.sessionTimer.elapsed',
            'Elapsed'
          )}</span> <span class="st-mode-hint">${remStr} ${this._t(
            'controller.sessionTimer.remaining',
            'remaining'
          )}</span>`
        } else {
          this.$modeSubtitle.innerHTML = `<span class="st-mode-badge">${this._t(
            'controller.sessionTimer.freeMode',
            'Count Up'
          )}</span>`
        }
      }
    }

    // 3. SVG Radial Gauge
    if (this.$gaugeProgress) {
      if (hasTarget) {
        const offset = CIRCLE_CIRCUMFERENCE * (1 - progressRatio)
        this.$gaugeProgress.style.strokeDashoffset = String(Math.max(0, offset))
      } else {
        // Continuous subtle pulse in free mode
        this.$gaugeProgress.style.strokeDashoffset = String(
          this.isRunning ? CIRCLE_CIRCUMFERENCE * 0.25 : CIRCLE_CIRCUMFERENCE
        )
      }
    }

    if (this.$gaugePercent) {
      if (hasTarget) {
        this.$gaugePercent.textContent = `${Math.round(progressRatio * 100)}%`
      } else {
        this.$gaugePercent.textContent = '∞'
      }
    }

    if (this.$gaugeTargetLabel) {
      if (hasTarget) {
        this.$gaugeTargetLabel.textContent = `${this.targetMinutes}m`
      } else {
        this.$gaugeTargetLabel.textContent = this._t('controller.sessionTimer.freeMode', 'Count Up')
      }
    }

    // 4. Status Badge & Card Classes
    if (this.$card) {
      this.$card.classList.toggle('is-running', this.isRunning)
      this.$card.classList.toggle('is-warning', isWarning)
      this.$card.classList.toggle('is-completed', isCompleted)
    }

    if (this.$statusBadge && this.$statusText) {
      this.$statusBadge.className = 'st-status-badge'
      if (isCompleted) {
        this.$statusBadge.classList.add('st-status--completed')
        this.$statusText.textContent = this._t('controller.sessionTimer.statusComplete', 'Complete')
      } else if (isWarning) {
        this.$statusBadge.classList.add('st-status--warning')
        this.$statusText.textContent = this._t('controller.sessionTimer.statusWarning', 'Closure (5m)')
      } else if (this.isRunning) {
        this.$statusBadge.classList.add('st-status--running')
        this.$statusText.textContent = this._t('controller.sessionTimer.statusActive', 'Active')
      } else if (this.elapsedMs > 0) {
        this.$statusBadge.classList.add('st-status--paused')
        this.$statusText.textContent = this._t('controller.sessionTimer.statusPaused', 'Paused')
      } else {
        this.$statusText.textContent = this._t('controller.sessionTimer.statusReady', 'Ready')
      }
    }

    // 5. Play / Pause Button
    if (this.$toggleBtn && this.$toggleIcon && this.$toggleText) {
      if (this.isRunning) {
        this.$toggleBtn.classList.add('is-pause')
        this.$toggleIcon.textContent = '❚❚'
        this.$toggleText.textContent = this._t('controller.sessionTimer.pause', 'Pause')
      } else {
        this.$toggleBtn.classList.remove('is-pause')
        this.$toggleIcon.textContent = '▶'
        this.$toggleText.textContent =
          this.elapsedMs > 0
            ? this._t('controller.sessionTimer.resume', 'Resume')
            : this._t('controller.sessionTimer.start', 'Start Timer')
      }
    }

    // 6. Sound Toggle Button
    if (this.$soundToggle) {
      this.$soundToggle.classList.toggle('is-active', this.soundAlerts)
      this.$soundToggle.textContent = this.soundAlerts ? '🔔' : '🔕'
      this.$soundToggle.title = this._t(
        'controller.sessionTimer.soundAlerts',
        'Sound cues (Closure & Target)'
      )
    }

    // 7. Preset Target Chips Active State
    this.$presetChips.forEach((btn) => {
      const val = parseInt(btn.getAttribute('data-target'), 10)
      btn.classList.toggle('is-active', val === this.targetMinutes)
    })

    // 8. Bilateral Stimulation Ratio Breakdown
    if (this.$ratioFill && this.$bilateralTime && this.$bilateralRatio) {
      const bilateralRatio =
        this.elapsedMs > 0
          ? Math.min(100, Math.round((this.activeBilateralMs / this.elapsedMs) * 100))
          : 0
      this.$ratioFill.style.width = `${bilateralRatio}%`
      this.$bilateralTime.textContent = this.formatTime(this.activeBilateralMs)
      this.$bilateralRatio.textContent = `${bilateralRatio}%`
    }

    // 9. Mirror Widgets (Header & Fullscreen)
    const shortFormatted = this.formatTime(this.elapsedMs)
    const targetLabel = hasTarget ? `/ ${this.targetMinutes}m` : ''

    if (this.$headerWidget && this.$headerDisplay) {
      this.$headerDisplay.textContent = shortFormatted
      if (this.$headerTarget) this.$headerTarget.textContent = targetLabel
      this.$headerWidget.classList.toggle('is-running', this.isRunning)
      this.$headerWidget.classList.toggle('is-warning', isWarning)
    }

    if (this.$fsDisplay && this.$fsText) {
      this.$fsText.textContent = shortFormatted
      if (this.$fsTarget) this.$fsTarget.textContent = targetLabel
    }
  }

  // --- Utilities & Audio Synthesis ---

  formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')

    if (hours > 0) {
      return `${hours}:${mm}:${ss}`
    }
    return `${mm}:${ss}`
  }

  playHarmonicChime(freq = 523.25, duration = 0.5) {
    try {
      if (typeof window === 'undefined') return
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      const ctx = new AudioCtx()
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      const now = ctx.currentTime
      const masterGain = ctx.createGain()
      masterGain.gain.setValueAtTime(0.001, now)
      masterGain.gain.exponentialRampToValueAtTime(0.3, now + 0.05)
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
      masterGain.connect(ctx.destination)

      // Fundamental tone
      const osc1 = ctx.createOscillator()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(freq, now)
      osc1.connect(masterGain)
      osc1.start(now)
      osc1.stop(now + duration)

      // Soft harmonic overtone (Octave + fifth for serene chime)
      const osc2 = ctx.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(freq * 1.5, now)
      const gain2 = ctx.createGain()
      gain2.gain.setValueAtTime(0.12, now)
      osc2.connect(gain2)
      gain2.connect(masterGain)
      osc2.start(now)
      osc2.stop(now + duration)

      setTimeout(() => {
        try {
          ctx.close()
        } catch (_e) {
          // Audio context close ignored
        }
      }, duration * 1000 + 200)
    } catch (_e) {
      /* Audio context blocked or unavailable */
    }
  }

  _showNotification(msg) {
    if (typeof globalThis !== 'undefined') {
      if (typeof globalThis.showSuccessToast === 'function') {
        globalThis.showSuccessToast(msg)
        return
      }
      if (typeof globalThis.showNotification === 'function') {
        globalThis.showNotification(msg)
        return
      }
    }
    console.log('[SessionTimer]', msg)
  }

  _t(key, fallback) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.i18n?.t === 'function') {
      const val = globalThis.i18n.t(key)
      if (val && val !== key) return val
    }
    return fallback
  }

  // --- Persistence ---

  _getStorageKey() {
    return `${STORAGE_PREFIX}${this.sessionId || 'default'}`
  }

  _saveState() {
    try {
      if (typeof localStorage === 'undefined') return
      const data = {
        sessionId: this.sessionId,
        isRunning: this.isRunning,
        elapsedMs: this.elapsedMs,
        activeBilateralMs: this.activeBilateralMs,
        targetMinutes: this.targetMinutes,
        displayMode: this.displayMode,
        autoStart: this.autoStart,
        soundAlerts: this.soundAlerts,
        fiveMinWarningFired: this.fiveMinWarningFired,
        targetReachedFired: this.targetReachedFired,
        savedAtWallTime: Date.now(),
        startWallTime: this._startWallTime
      }
      localStorage.setItem(this._getStorageKey(), JSON.stringify(data))
    } catch (_e) {
      /* quota exceeded or private mode */
    }
  }

  _loadState() {
    try {
      if (typeof localStorage === 'undefined') return
      const raw = localStorage.getItem(this._getStorageKey())
      if (!raw) return
      const data = JSON.parse(raw)
      if (!data || typeof data !== 'object') return

      if (typeof data.elapsedMs === 'number') this.elapsedMs = data.elapsedMs
      if (typeof data.activeBilateralMs === 'number') {
        this.activeBilateralMs = data.activeBilateralMs
      }
      if (typeof data.targetMinutes === 'number') {
        this.targetMinutes = data.targetMinutes
      }
      if (typeof data.displayMode === 'string') this.displayMode = data.displayMode
      if (typeof data.autoStart === 'boolean') this.autoStart = data.autoStart
      if (typeof data.soundAlerts === 'boolean') this.soundAlerts = data.soundAlerts
      if (typeof data.fiveMinWarningFired === 'boolean') {
        this.fiveMinWarningFired = data.fiveMinWarningFired
      }
      if (typeof data.targetReachedFired === 'boolean') {
        this.targetReachedFired = data.targetReachedFired
      }

      if (data.isRunning && data.savedAtWallTime) {
        // Compute elapsed time while tab was closed/reloading
        const wallDelta = Date.now() - data.savedAtWallTime
        // Only accept delta if within 24 hours
        if (wallDelta > 0 && wallDelta < 24 * 3600 * 1000) {
          this.elapsedMs += wallDelta
        }
        this.isRunning = true
        this._startWallTime = data.startWallTime || (Date.now() - this.elapsedMs)
      } else {
        this.isRunning = false
      }
    } catch (_e) {
      /* ignore invalid JSON */
    }
  }
}

// Global instance
const sessionTimer = new SessionTimer()

if (typeof globalThis !== 'undefined') {
  globalThis.SessionTimer = SessionTimer
  globalThis.sessionTimer = sessionTimer
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sessionTimer.init())
  } else {
    sessionTimer.init()
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SessionTimer,
    sessionTimer
  }
}
