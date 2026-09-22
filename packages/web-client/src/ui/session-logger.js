/* global globalThis */
'use strict'

/**
 * Local Session Logger & History Manager for EMDR Bilateral Controller.
 * Tracks session durations, completed passes and sets, and bilateral patterns used.
 * Stores records securely in the therapist's local browser (localStorage).
 */

const STORAGE_KEY = 'bb_session_history_logs'
const ACTIVE_SESSION_KEY = 'bb_active_session_log'

// Pattern icons and names lookup
const PRESET_ICONS = {
  slowCalming: '🌊',
  fastIntensive: '⚡',
  standardProcessing: '🎯',
  infinityFlow: '∞',
  diagonalProcessing: '↖↘',
  verticalActivation: '↕️',
  couplesTherapy: '🤝',
  dynamic: '🌀'
}

const DIRECTION_ICONS = {
  horizontal: '↔️',
  vertical: '↕️',
  diagRL: '↖↘',
  diagRLL: '↙↗',
  random: '🎲',
  infinity: '∞',
  brainspotting: '⊕'
}

class SessionLogger {
  constructor() {
    this.logs = this._loadLogs()
    this.activeSession = this._loadActiveSession()
    this.isTracking = false
    this._tickTimer = null
    this._lastTickTime = 0
    this._searchQuery = ''
    this._modalEl = null
  }

  init() {
    // Listen for playback events
    if (typeof globalThis !== 'undefined') {
      globalThis.addEventListener('bb_metrika_session_started', () => this.start())
      globalThis.addEventListener('bb_metrika_session_stopped', () => this.stop())
      globalThis.addEventListener('i18nLanguageChanged', () => this._onLanguageChanged())
      globalThis.addEventListener('beforeunload', () => this._persistActiveSession())
    }

    // Build or attach DOM elements
    this._injectHeaderButton()
    this._injectModal()
    this._injectSettingsTab()
    this._injectQuickControllerBar()
    this.updateBadge()

    // If session is already running when logger initializes, resume tracking
    if (typeof globalThis !== 'undefined' && globalThis.isPlaying) {
      this.start()
    }

    // Expose clinical notes saver
    globalThis.saveClinicalNote = (btnEl) => {
      const sud = document.getElementById('sudSlider')?.value || 0
      const voc = document.getElementById('vocSlider')?.value || 1
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const noteStr = `[${timestamp}] SUD: ${sud}/10 | VOC: ${voc}/7`

      const currentNotes = this.activeSession.notes || ''
      this.activeSession.notes = currentNotes ? currentNotes + '\n' + noteStr : noteStr
      this._persistActiveSession()

      // Visual feedback
      if (btnEl) {
        const ogText = btnEl.textContent
        btnEl.textContent = '\u2705 Saved!'
        btnEl.classList.add('success')
        setTimeout(() => {
          btnEl.textContent = ogText
          btnEl.classList.remove('success')
        }, 2000)
      }
    }
  }

  // --- Session Lifecycle Tracking ---

  start() {
    if (this.isTracking) return
    this.isTracking = true
    this._lastTickTime = performance.now()

    if (!this.activeSession.startedAt) {
      this.activeSession.startedAt = new Date().toISOString()
    }
    this.activeSession.updatedAt = new Date().toISOString()

    // Ensure initial pattern is captured
    if (!this.activeSession.currentPattern) {
      this._captureCurrentStateAsPattern()
    }

    // Accumulate time every 500ms
    if (this._tickTimer) clearInterval(this._tickTimer)
    this._tickTimer = setInterval(() => this._onTick(), 500)

    this._updateLiveUI()
  }

  stop() {
    if (!this.isTracking) return
    this._onTick()
    this.isTracking = false

    if (this._tickTimer) {
      clearInterval(this._tickTimer)
      this._tickTimer = null
    }

    this.activeSession.updatedAt = new Date().toISOString()

    // Sync total sets and passes from bbCounters if available
    if (globalThis.bbCounters) {
      this.activeSession.totalSets = Math.max(
        this.activeSession.totalSets || 0,
        globalThis.bbCounters.sets || 0
      )
      this.activeSession.totalPasses = Math.max(
        this.activeSession.totalPasses || 0,
        globalThis.bbCounters.passes || 0
      )
    }

    this._persistActiveSession()

    // Auto-save to logs history if active duration is at least 5s or passes > 0
    if (this.activeSession.activeDurationMs >= 5000 || this.activeSession.totalPasses > 0) {
      this._autoSyncToLogs()
    }

    this._updateLiveUI()
  }

  _onTick() {
    const now = performance.now()
    if (!this._lastTickTime) {
      this._lastTickTime = now
      return
    }

    const deltaMs = Math.max(0, Math.min(2000, now - this._lastTickTime))
    this._lastTickTime = now

    this.activeSession.activeDurationMs = (this.activeSession.activeDurationMs || 0) + deltaMs

    if (this.activeSession.currentPattern) {
      this.activeSession.currentPattern.durationMs =
        (this.activeSession.currentPattern.durationMs || 0) + deltaMs
    }

    // Sync passes from bbCounters
    if (globalThis.bbCounters) {
      const currentPasses = globalThis.bbCounters.passes || 0
      const currentSets = globalThis.bbCounters.sets || 0
      if (currentPasses > (this.activeSession.totalPasses || 0)) {
        this.activeSession.totalPasses = currentPasses
      }
      if (currentSets > (this.activeSession.totalSets || 0)) {
        this.activeSession.totalSets = currentSets
      }
    }

    this._updateLiveUI()
  }

  onPass() {
    this.activeSession.totalPasses = (this.activeSession.totalPasses || 0) + 1
    if (this.activeSession.currentPattern) {
      this.activeSession.currentPattern.passes =
        (this.activeSession.currentPattern.passes || 0) + 1
    }
    this._updateLiveUI()
  }

  onSet() {
    this.activeSession.totalSets = (this.activeSession.totalSets || 0) + 1
    this._updateLiveUI()
  }

  // --- Pattern Choice Recording ---

  recordPreset(presetId, presetData) {
    const name = presetData?.name || this._getLocalizedPresetName(presetId) || presetId
    const dir = presetData?.direction || 'horizontal'
    const speed = typeof presetData?.speed === 'number' ? presetData.speed : 45
    const icon = PRESET_ICONS[presetId] || DIRECTION_ICONS[dir] || '🎯'

    this._switchActivePattern({
      presetId,
      name,
      direction: dir,
      directionIcon: icon,
      speed,
      colorBall: presetData?.colorBall,
      colorBg: presetData?.colorBg,
      soundType: presetData?.soundType
    })
  }

  recordDirection(directionMode) {
    const dir = directionMode || 'horizontal'
    const icon = DIRECTION_ICONS[dir] || '↔️'
    const name = this._getLocalizedDirectionName(dir)
    const currentSpeed = this._getCurrentSpeed()

    this._switchActivePattern({
      presetId: null,
      name,
      direction: dir,
      directionIcon: icon,
      speed: currentSpeed
    })
  }

  recordSpeed(speedVal) {
    if (!this.activeSession.currentPattern) {
      this._captureCurrentStateAsPattern()
    } else {
      this.activeSession.currentPattern.speed = speedVal
    }
    this._updateLiveUI()
  }

  _switchActivePattern(newPattern) {
    const nowIso = new Date().toISOString()
    const current = this.activeSession.currentPattern

    // If existing pattern had meaningful duration or passes, archive it
    if (current && (current.durationMs >= 1000 || current.passes > 0)) {
      current.endedAt = nowIso
      // Avoid duplicate consecutive identical patterns
      const lastArchived = this.activeSession.patterns[this.activeSession.patterns.length - 1]
      if (
        !lastArchived ||
        lastArchived.name !== current.name ||
        lastArchived.direction !== current.direction ||
        Math.abs(lastArchived.speed - current.speed) > 10
      ) {
        this.activeSession.patterns.push(Object.assign({}, current))
      } else {
        lastArchived.durationMs += current.durationMs
        lastArchived.passes += current.passes
      }
    }

    // Set new pattern
    this.activeSession.currentPattern = {
      id: 'pat_' + Date.now(),
      presetId: newPattern.presetId || null,
      name: newPattern.name || 'Bilateral Stimulation',
      direction: newPattern.direction || 'horizontal',
      directionIcon: newPattern.directionIcon || '↔️',
      speed: typeof newPattern.speed === 'number' ? newPattern.speed : this._getCurrentSpeed(),
      colorBall: newPattern.colorBall || this._getCurrentBallColor(),
      colorBg: newPattern.colorBg || this._getCurrentBgColor(),
      soundType: newPattern.soundType || this._getCurrentSoundType(),
      startedAt: nowIso,
      durationMs: 0,
      passes: 0
    }

    this._persistActiveSession()
    this._updateLiveUI()
  }

  _captureCurrentStateAsPattern() {
    const dir = globalThis.currentDirectionMode || 'horizontal'
    const speed = this._getCurrentSpeed()
    const name = this._getLocalizedDirectionName(dir)
    const icon = DIRECTION_ICONS[dir] || '↔️'

    this.activeSession.currentPattern = {
      id: 'pat_' + Date.now(),
      presetId: null,
      name,
      direction: dir,
      directionIcon: icon,
      speed,
      colorBall: this._getCurrentBallColor(),
      colorBg: this._getCurrentBgColor(),
      soundType: this._getCurrentSoundType(),
      startedAt: new Date().toISOString(),
      durationMs: 0,
      passes: 0
    }
  }

  // --- Session Storage & Management ---

  saveActiveSession(customTitle, notes) {
    // Flush current pattern into patterns list
    if (this.activeSession.currentPattern) {
      const current = this.activeSession.currentPattern
      if (current.durationMs >= 1000 || current.passes > 0 || this.activeSession.patterns.length === 0) {
        current.endedAt = new Date().toISOString()
        this.activeSession.patterns.push(Object.assign({}, current))
      }
    }

    this.activeSession.endedAt = new Date().toISOString()
    this.activeSession.updatedAt = new Date().toISOString()

    if (customTitle && customTitle.trim()) {
      this.activeSession.title = customTitle.trim()
    }
    if (typeof notes === 'string') {
      this.activeSession.notes = notes.trim()
    }

    // Format title if still generic
    if (!this.activeSession.title) {
      const dateStr = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
      this.activeSession.title = `Session • ${dateStr}`
    }

    // Upsert into this.logs
    const existingIndex = this.logs.findIndex((l) => l.id === this.activeSession.id)
    if (existingIndex >= 0) {
      this.logs[existingIndex] = Object.assign({}, this.activeSession)
    } else {
      this.logs.unshift(Object.assign({}, this.activeSession))
    }

    this._saveLogs()

    // Reset active session for next run
    this.activeSession = this._createEmptySession()
    this._persistActiveSession()

    this.updateBadge()
    this.renderModalContent()
    this._showToast(this._t('controller.sessionLog.logSaved', 'Session saved to local log'))
  }

  startNewSession() {
    // If active session has active duration or passes, auto-save it first
    if (this.activeSession.activeDurationMs >= 3000 || this.activeSession.totalPasses > 0) {
      this.saveActiveSession()
    } else {
      this.activeSession = this._createEmptySession()
      this._persistActiveSession()
    }
    this.updateBadge()
    this.renderModalContent()
  }

  deleteLog(logId) {
    this.logs = this.logs.filter((l) => l.id !== logId)
    this._saveLogs()
    this.updateBadge()
    this.renderModalContent()
    this._showToast(this._t('controller.sessionLog.logDeleted', 'Session log deleted'))
  }

  clearAllLogs() {
    const confirmMsg = this._t(
      'controller.sessionLog.clearConfirm',
      'Are you sure you want to clear all local session logs? This cannot be undone.'
    )
    if (!confirm(confirmMsg)) return

    this.logs = []
    this._saveLogs()
    this.updateBadge()
    this.renderModalContent()
    this._showToast(this._t('controller.sessionLog.logsCleared', 'All session logs cleared'))
  }

  updateLogNotes(logId, notes) {
    const log = this.logs.find((l) => l.id === logId)
    if (log) {
      log.notes = notes
      log.updatedAt = new Date().toISOString()
      this._saveLogs()
    }
  }

  updateLogTitle(logId, title) {
    const log = this.logs.find((l) => l.id === logId)
    if (log && title) {
      log.title = title.trim()
      log.updatedAt = new Date().toISOString()
      this._saveLogs()
    }
  }

  reapplyPattern(logId, patternIndex = 0) {
    const log = this.logs.find((l) => l.id === logId)
    if (!log) return

    const patterns = this._getAllPatternsForLog(log)
    const targetPattern = patterns[patternIndex] || patterns[0]
    if (!targetPattern) return

    // Apply speed
    if (typeof targetPattern.speed === 'number') {
      try {
        if (globalThis.components?.speed?.setSpeed) {
          globalThis.components.speed.setSpeed(targetPattern.speed)
        } else if (typeof globalThis.setSpeed === 'function') {
          globalThis.setSpeed(targetPattern.speed)
        }
      } catch (e) {
        void e
      }
    }

    // Apply direction
    if (targetPattern.direction && typeof globalThis.setDirection === 'function') {
      try {
        globalThis.setDirection(targetPattern.direction)
      } catch (e) {
        void e
      }
    }

    // Apply preset if identified
    if (targetPattern.presetId && typeof globalThis.applyPresetById === 'function') {
      try {
        globalThis.applyPresetById(targetPattern.presetId)
      } catch (e) {
        void e
      }
    }

    this._showToast(
      this._t('controller.sessionLog.patternApplied', 'Pattern settings applied to controller')
    )
    this.closeModal()
  }

  // --- Copy & Export ---

  copyClinicalSummary(logId) {
    const log = this.logs.find((l) => l.id === logId) || this.activeSession
    const text = this._formatClinicalSummary(log)

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          this._showToast(
            this._t('controller.sessionLog.copied', 'Clinical summary copied to clipboard')
          )
        })
        .catch(() => this._fallbackCopyText(text))
    } else {
      this._fallbackCopyText(text)
    }
  }

  copyAllSummaries() {
    if (this.logs.length === 0) return
    const allText = this.logs.map((log) => this._formatClinicalSummary(log)).join('\n\n' + '='.repeat(40) + '\n\n')

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(allText)
        .then(() => {
          this._showToast(
            this._t('controller.sessionLog.copied', 'Clinical summaries copied to clipboard')
          )
        })
        .catch(() => this._fallbackCopyText(allText))
    } else {
      this._fallbackCopyText(allText)
    }
  }

  exportLogsJson() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      platform: 'BilateralBound EMDR Platform',
      totalSessions: this.logs.length,
      sessions: this.logs
    }

    const jsonStr = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateSlug = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `emdr-session-logs-${dateSlug}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  exportLogsCsv() {
    const headers = [
      'Session ID',
      'Date',
      'Title',
      'Active Duration (s)',
      'Formatted Duration',
      'Total Passes',
      'Total Sets',
      'Patterns Used',
      'Clinical Notes'
    ]

    const rows = this.logs.map((log) => {
      const patterns = this._getAllPatternsForLog(log)
      const patternSummary = patterns
        .map((p) => `${p.name} (${p.direction}, ${p.speed}%, ${this.formatDuration(p.durationMs)})`)
        .join('; ')

      const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`

      return [
        escapeCsv(log.id),
        escapeCsv(new Date(log.createdAt).toLocaleString()),
        escapeCsv(log.title),
        Math.round((log.activeDurationMs || 0) / 1000),
        escapeCsv(this.formatDuration(log.activeDurationMs)),
        log.totalPasses || 0,
        log.totalSets || 0,
        escapeCsv(patternSummary),
        escapeCsv(log.notes || '')
      ].join(',')
    })

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateSlug = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `emdr-session-logs-${dateSlug}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // --- UI Injections ---

  _injectHeaderButton() {
    if (document.getElementById('sessionLogBtn')) return

    const presetsWrapper = document.getElementById('headerPresetsWrapper')
    const settingsBtn = document.getElementById('settingsBtn')
    const header = document.querySelector('header')
    if (!header) return

    const btn = document.createElement('button')
    btn.id = 'sessionLogBtn'
    btn.className = 'header-log-btn'
    btn.type = 'button'
    btn.setAttribute('aria-haspopup', 'dialog')
    btn.setAttribute('aria-label', this._t('controller.sessionLog.headerButton', 'Session Log'))
    btn.title = this._t('controller.sessionLog.headerButton', 'Session Log')

    btn.innerHTML = `
      <span class="header-log-icon" aria-hidden="true">📋</span>
      <span class="header-log-text" data-i18n="controller.sessionLog.headerButton">${this._t(
        'controller.sessionLog.headerButton',
        'Session Log'
      )}</span>
      <span id="sessionLogCountBadge" class="session-log-badge">0</span>
    `

    btn.addEventListener('click', () => this.openModal())

    if (settingsBtn) {
      header.insertBefore(btn, settingsBtn)
    } else if (presetsWrapper) {
      presetsWrapper.parentNode.insertBefore(btn, presetsWrapper.nextSibling)
    } else {
      header.appendChild(btn)
    }
  }

  _injectQuickControllerBar() {
    if (document.getElementById('sessionLogQuickBar')) return

    const unifiedBlock = document.querySelector('.session-unified-block')
    if (!unifiedBlock) return

    const bar = document.createElement('div')
    bar.id = 'sessionLogQuickBar'
    bar.className = 'session-log-quick-bar'
    bar.innerHTML = `
      <button type="button" class="quick-log-btn" id="quickLogOpenBtn">
        <span class="quick-log-icon">📋</span>
        <span class="quick-log-title" data-i18n="controller.sessionLog.historyTitle">${this._t(
          'controller.sessionLog.historyTitle',
          'Session History'
        )}</span>
        <span class="quick-log-duration" id="quickLogLiveDuration">00:00</span>
      </button>
      <button type="button" class="quick-save-btn" id="quickLogSaveBtn" title="${this._t(
        'controller.sessionLog.saveCurrent',
        'Save Current to Log'
      )}">
        💾 <span data-i18n="controller.sessionLog.saveCurrent">${this._t(
          'controller.sessionLog.saveCurrent',
          'Save to Log'
        )}</span>
      </button>
    `

    bar.querySelector('#quickLogOpenBtn').addEventListener('click', () => this.openModal())
    bar.querySelector('#quickLogSaveBtn').addEventListener('click', () => {
      this.saveActiveSession()
    })

    unifiedBlock.appendChild(bar)
  }

  _injectSettingsTab() {
    const modal = document.getElementById('settingsModal')
    if (!modal) return

    const tabsContainer = modal.querySelector('.smodal__tabs')
    const panelsContainer = modal.querySelector('.smodal__panels')
    if (!tabsContainer || !panelsContainer) return

    // Check if tab already exists
    if (modal.querySelector('[data-tab="sessionHistory"]')) return

    // Add Tab
    const tabBtn = document.createElement('button')
    tabBtn.className = 'smodal__tab'
    tabBtn.setAttribute('role', 'tab')
    tabBtn.setAttribute('data-tab', 'sessionHistory')
    tabBtn.setAttribute('aria-selected', 'false')
    tabBtn.setAttribute('aria-controls', 'smodal-panel-sessionHistory')
    tabBtn.innerHTML = `
      <span aria-hidden="true">📋</span>
      <span data-i18n="controller.sessionLog.historyTitle">${this._t(
        'controller.sessionLog.historyTitle',
        'Session History'
      )}</span>
    `
    tabsContainer.appendChild(tabBtn)

    // Add Panel
    const panel = document.createElement('div')
    panel.id = 'smodal-panel-sessionHistory'
    panel.className = 'smodal__panel smodal__panel--hidden'
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', 'smodal-tab-sessionHistory')
    panel.innerHTML = `
      <div class="settings-history-embed" id="settingsHistoryEmbed">
        <div class="settings-history-top-actions">
          <button type="button" class="btn primary btn-sm" id="settingsHistoryViewFullBtn">
            📋 ${this._t('controller.sessionLog.title', 'Open Full Session History Modal')}
          </button>
        </div>
        <div id="settingsHistoryListEmbed" class="settings-history-list-embed"></div>
      </div>
    `

    panelsContainer.appendChild(panel)

    // Wire switch tab event
    tabBtn.addEventListener('click', () => {
      modal.querySelectorAll('.smodal__tab').forEach((t) => {
        const active = t.dataset.tab === 'sessionHistory'
        t.classList.toggle('active', active)
        t.setAttribute('aria-selected', String(active))
      })
      modal.querySelectorAll('.smodal__panel').forEach((p) => {
        p.classList.toggle('smodal__panel--hidden', p.id !== 'smodal-panel-sessionHistory')
      })
      this._renderSettingsTabEmbed()
    })

    panel.querySelector('#settingsHistoryViewFullBtn').addEventListener('click', () => {
      // Close settings modal and open session log modal
      modal.setAttribute('hidden', '')
      document.body.style.overflow = ''
      this.openModal()
    })
  }

  _injectModal() {
    if (document.getElementById('sessionLogModal')) return

    const modal = document.createElement('div')
    modal.id = 'sessionLogModal'
    modal.className = 'slog-modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-labelledby', 'slogModalTitle')
    modal.setAttribute('hidden', '')

    modal.innerHTML = `
      <div class="slog-modal__overlay" id="slogModalOverlay"></div>
      <div class="slog-modal__dialog">
        <div class="slog-modal__header">
          <div class="slog-modal__header-info">
            <h2 id="slogModalTitle" class="slog-modal__title">
              📋 <span data-i18n="controller.sessionLog.title">${this._t(
                'controller.sessionLog.title',
                'Clinical Session History & Log'
              )}</span>
            </h2>
            <p class="slog-modal__subtitle" data-i18n="controller.sessionLog.subtitle">${this._t(
              'controller.sessionLog.subtitle',
              'Review local session durations, completed sets, and chosen bilateral stimulation patterns'
            )}</p>
          </div>
          <button type="button" class="slog-modal__close-btn" id="slogModalCloseBtn" aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Real-time Active Session Live Banner -->
        <div class="slog-active-card" id="slogActiveCard"></div>

        <!-- Toolbar & Filter -->
        <div class="slog-toolbar">
          <div class="slog-search-wrapper">
            <span class="slog-search-icon">🔍</span>
            <input
              type="text"
              id="slogSearchInput"
              class="slog-search-input"
              placeholder="${this._t(
                'controller.sessionLog.searchPlaceholder',
                'Search by client, date, pattern, or notes...'
              )}"
              aria-label="Search session history"
            />
            <button type="button" id="slogClearSearchBtn" class="slog-clear-search-btn hidden">✕</button>
          </div>
          <div class="slog-actions">
            <button type="button" class="slog-btn slog-btn--outline" id="slogExportJsonBtn" title="Export as JSON file">
              📥 JSON
            </button>
            <button type="button" class="slog-btn slog-btn--outline" id="slogExportCsvBtn" title="Export as CSV spreadsheet">
              📊 CSV
            </button>
            <button type="button" class="slog-btn slog-btn--outline" id="slogCopyAllBtn" title="Copy all summaries to clipboard">
              📋 ${this._t('controller.sessionLog.copyAll', 'Copy All')}
            </button>
            <button type="button" class="slog-btn slog-btn--danger" id="slogClearAllBtn" title="Clear all history">
              🗑️
            </button>
          </div>
        </div>

        <!-- History Records Container -->
        <div class="slog-modal__body" id="slogModalBody" role="region" aria-label="Session records list">
          <div class="slog-records-list" id="slogRecordsList"></div>
        </div>
      </div>
    `

    document.body.appendChild(modal)
    this._modalEl = modal

    // Wire modal events
    modal.querySelector('#slogModalOverlay').addEventListener('click', () => this.closeModal())
    modal.querySelector('#slogModalCloseBtn').addEventListener('click', () => this.closeModal())
    modal.querySelector('#slogExportJsonBtn').addEventListener('click', () => this.exportLogsJson())
    modal.querySelector('#slogExportCsvBtn').addEventListener('click', () => this.exportLogsCsv())
    modal.querySelector('#slogCopyAllBtn').addEventListener('click', () => this.copyAllSummaries())
    modal.querySelector('#slogClearAllBtn').addEventListener('click', () => this.clearAllLogs())

    const searchInput = modal.querySelector('#slogSearchInput')
    const clearSearchBtn = modal.querySelector('#slogClearSearchBtn')

    searchInput.addEventListener('input', (e) => {
      this._searchQuery = e.target.value.toLowerCase().trim()
      clearSearchBtn.classList.toggle('hidden', !this._searchQuery)
      this.renderModalContent()
    })

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = ''
      this._searchQuery = ''
      clearSearchBtn.classList.add('hidden')
      this.renderModalContent()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hasAttribute('hidden')) {
        this.closeModal()
      }
    })
  }

  openModal() {
    if (!this._modalEl) this._injectModal()
    this._modalEl.removeAttribute('hidden')
    document.body.style.overflow = 'hidden'
    this.renderModalContent()
    const closeBtn = this._modalEl.querySelector('#slogModalCloseBtn')
    if (closeBtn) closeBtn.focus()
  }

  closeModal() {
    if (!this._modalEl) return
    this._modalEl.setAttribute('hidden', '')
    document.body.style.overflow = ''
    const openBtn = document.getElementById('sessionLogBtn')
    if (openBtn) openBtn.focus()
  }

  // --- Modal Rendering ---

  renderModalContent() {
    if (!this._modalEl) return

    this._renderActiveSessionCard()
    this._renderRecordsList()
  }

  _renderActiveSessionCard() {
    const cardEl = this._modalEl.querySelector('#slogActiveCard')
    if (!cardEl) return

    const isRunning = this.isTracking
    const durationFormatted = this.formatDuration(this.activeSession.activeDurationMs || 0)
    const passes = this.activeSession.totalPasses || 0
    const sets = this.activeSession.totalSets || 0
    const patterns = this._getAllPatternsForLog(this.activeSession)

    cardEl.innerHTML = `
      <div class="slog-active-header">
        <div class="slog-active-status">
          <span class="slog-pulse-dot ${isRunning ? 'active' : 'idle'}"></span>
          <span class="slog-active-label">${
            isRunning
              ? this._t('controller.sessionLog.activeSession', 'Active Session in Progress')
              : this._t('controller.sessionLog.currentSessionPaused', 'Current Session (Ready / Paused)')
          }</span>
        </div>
        <div class="slog-active-actions">
          <button type="button" class="slog-btn slog-btn--primary slog-btn--sm" id="slogActiveSaveBtn">
            💾 ${this._t('controller.sessionLog.saveCurrent', 'Save to History')}
          </button>
          <button type="button" class="slog-btn slog-btn--outline slog-btn--sm" id="slogActiveNewBtn">
            ➕ ${this._t('controller.sessionLog.newSession', 'New Session')}
          </button>
        </div>
      </div>

      <div class="slog-stats-strip">
        <div class="slog-stat-item">
          <span class="slog-stat-lbl">⏱️ ${this._t('controller.sessionLog.activeDuration', 'Stimulation')}</span>
          <span class="slog-stat-val" id="slogActiveLiveDuration">${durationFormatted}</span>
        </div>
        <div class="slog-stat-item">
          <span class="slog-stat-lbl">🎯 ${this._t('controller.sessionLog.sets', 'Sets')}</span>
          <span class="slog-stat-val" id="slogActiveLiveSets">${sets}</span>
        </div>
        <div class="slog-stat-item">
          <span class="slog-stat-lbl">↔️ ${this._t('controller.sessionLog.passes', 'Passes')}</span>
          <span class="slog-stat-val" id="slogActiveLivePasses">${passes}</span>
        </div>
        <div class="slog-stat-item slog-stat-item--patterns">
          <span class="slog-stat-lbl">🎨 ${this._t('controller.sessionLog.patternsUsed', 'Chosen Patterns')}</span>
          <div class="slog-patterns-flow">
            ${
              patterns.length > 0
                ? patterns
                    .map(
                      (p) => `
                <span class="slog-pattern-pill" title="${p.name} • ${p.speed}% • ${this.formatDuration(
                        p.durationMs
                      )}">
                  <span class="slog-pattern-icon">${p.directionIcon || '↔️'}</span>
                  <span class="slog-pattern-name">${this._escapeHtml(p.name)}</span>
                  <span class="slog-pattern-speed">${p.speed}%</span>
                </span>
              `
                    )
                    .join('<span class="slog-arrow">➔</span>')
                : `<span class="slog-pattern-empty">${this._t(
                    'controller.sessionLog.noPatterns',
                    'No patterns recorded yet'
                  )}</span>`
            }
          </div>
        </div>
      </div>
    `

    cardEl.querySelector('#slogActiveSaveBtn')?.addEventListener('click', () => {
      this.saveActiveSession()
    })
    cardEl.querySelector('#slogActiveNewBtn')?.addEventListener('click', () => {
      this.startNewSession()
    })
  }

  _renderRecordsList() {
    const listEl = this._modalEl.querySelector('#slogRecordsList')
    if (!listEl) return

    let filtered = this.logs
    if (this._searchQuery) {
      filtered = this.logs.filter((log) => {
        const titleMatch = (log.title || '').toLowerCase().includes(this._searchQuery)
        const notesMatch = (log.notes || '').toLowerCase().includes(this._searchQuery)
        const patternsMatch = (log.patterns || []).some(
          (p) =>
            (p.name || '').toLowerCase().includes(this._searchQuery) ||
            (p.direction || '').toLowerCase().includes(this._searchQuery)
        )
        const dateMatch = new Date(log.createdAt).toLocaleDateString().includes(this._searchQuery)
        return titleMatch || notesMatch || patternsMatch || dateMatch
      })
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="slog-empty-state">
          <div class="slog-empty-icon">📜</div>
          <h3 class="slog-empty-title">${
            this._searchQuery
              ? this._t('controller.sessionLog.noSearchResults', 'No matching session logs found')
              : this._t('controller.sessionLog.noLogs', 'No session history recorded yet')
          }</h3>
          <p class="slog-empty-desc">${
            this._searchQuery
              ? this._t('controller.sessionLog.tryDifferentSearch', 'Try a different search query')
              : this._t(
                  'controller.sessionLog.noLogsDesc',
                  'Start stimulation (Play / Space) to automatically record bilateral passes, active durations, and chosen patterns.'
                )
          }</p>
        </div>
      `
      return
    }

    listEl.innerHTML = filtered
      .map((log) => {
        const patterns = this._getAllPatternsForLog(log)
        const durationFormatted = this.formatDuration(log.activeDurationMs || 0)
        const dateStr = new Date(log.createdAt).toLocaleString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })

        return `
          <div class="slog-card" data-log-id="${log.id}">
            <div class="slog-card__header">
              <div class="slog-card__meta">
                <input
                  type="text"
                  class="slog-title-input"
                  value="${this._escapeHtml(log.title || 'Session')}"
                  data-log-id="${log.id}"
                  title="Click to rename session / client label"
                  aria-label="Session title"
                />
                <span class="slog-date-label">${dateStr}</span>
              </div>
              <div class="slog-card__badges">
                <span class="slog-badge slog-badge--duration">⏱️ ${durationFormatted}</span>
                <span class="slog-badge slog-badge--sets">🎯 ${log.totalSets || 0} sets</span>
                <span class="slog-badge slog-badge--passes">↔️ ${log.totalPasses || 0} passes</span>
              </div>
            </div>

            <!-- Patterns Breakdown -->
            <div class="slog-card__patterns">
              <span class="slog-patterns-heading">🎯 ${this._t(
                'controller.sessionLog.patternsUsed',
                'Chosen Patterns'
              )}:</span>
              <div class="slog-patterns-chain">
                ${
                  patterns.length > 0
                    ? patterns
                        .map(
                          (p, pIdx) => `
                    <button
                      type="button"
                      class="slog-pattern-tag"
                      data-log-id="${log.id}"
                      data-pattern-idx="${pIdx}"
                      title="${this._escapeHtml(p.name)} • ${p.speed}% speed • ${this.formatDuration(
                            p.durationMs
                          )} (Click to apply)"
                    >
                      <span class="slog-tag-icon">${p.directionIcon || '↔️'}</span>
                      <span class="slog-tag-name">${this._escapeHtml(p.name)}</span>
                      <span class="slog-tag-speed">${p.speed}%</span>
                      <span class="slog-tag-dur">${this.formatDuration(p.durationMs)}</span>
                    </button>
                  `
                        )
                        .join('<span class="slog-arrow">➔</span>')
                    : `<span class="slog-pattern-empty">${this._t(
                        'controller.sessionLog.noPatterns',
                        'Standard bilateral stimulation'
                      )}</span>`
                }
              </div>
            </div>

            <!-- Clinical Notes -->
            <div class="slog-card__notes-wrap">
              <label for="slogNotes_${log.id}" class="sr-only">Clinical Notes</label>
              <textarea
                id="slogNotes_${log.id}"
                class="slog-notes-input"
                data-log-id="${log.id}"
                rows="2"
                placeholder="${this._t(
                  'controller.sessionLog.notesPlaceholder',
                  'Add therapist clinical notes (target memory, SUD level, client response)...'
                )}"
              >${this._escapeHtml(log.notes || '')}</textarea>
            </div>

            <!-- Actions Footer -->
            <div class="slog-card__footer">
              <div class="slog-card__actions-left">
                <button
                  type="button"
                  class="slog-action-btn slog-action-btn--apply"
                  data-action="apply"
                  data-log-id="${log.id}"
                  title="${this._t('controller.sessionLog.reapplyPattern', 'Re-apply Patterns to Controller')}"
                >
                  🔄 ${this._t('controller.sessionLog.reapplyPattern', 'Re-apply Patterns')}
                </button>
                <button
                  type="button"
                  class="slog-action-btn slog-action-btn--copy"
                  data-action="copy"
                  data-log-id="${log.id}"
                  title="${this._t('controller.sessionLog.copySummary', 'Copy Clinical Summary Note')}"
                >
                  📋 ${this._t('controller.sessionLog.copySummary', 'Copy Clinical Note')}
                </button>
              </div>
              <div class="slog-card__actions-right">
                <button
                  type="button"
                  class="slog-action-btn slog-action-btn--delete"
                  data-action="delete"
                  data-log-id="${log.id}"
                  title="${this._t('controller.sessionLog.deleteLog', 'Delete this session record')}"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `
      })
      .join('')

    // Attach listeners on dynamically generated items
    listEl.querySelectorAll('.slog-title-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        this.updateLogTitle(e.target.dataset.logId, e.target.value)
      })
    })

    listEl.querySelectorAll('.slog-notes-input').forEach((textarea) => {
      textarea.addEventListener('change', (e) => {
        this.updateLogNotes(e.target.dataset.logId, e.target.value)
      })
    })

    listEl.querySelectorAll('[data-action="apply"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.reapplyPattern(btn.dataset.logId, 0)
      })
    })

    listEl.querySelectorAll('.slog-pattern-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.reapplyPattern(btn.dataset.logId, parseInt(btn.dataset.patternIdx, 10) || 0)
      })
    })

    listEl.querySelectorAll('[data-action="copy"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.copyClinicalSummary(btn.dataset.logId)
      })
    })

    listEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const confirmMsg = this._t(
          'controller.sessionLog.deleteConfirm',
          'Delete this session record?'
        )
        if (confirm(confirmMsg)) {
          this.deleteLog(btn.dataset.logId)
        }
      })
    })
  }

  _renderSettingsTabEmbed() {
    const container = document.getElementById('settingsHistoryListEmbed')
    if (!container) return

    if (this.logs.length === 0) {
      container.innerHTML = `
        <div class="slog-empty-state slog-empty-state--sm">
          <p class="slog-empty-desc">${this._t(
            'controller.sessionLog.noLogs',
            'No session history recorded yet'
          )}</p>
        </div>
      `
      return
    }

    container.innerHTML = this.logs
      .slice(0, 5)
      .map((log) => {
        const dateStr = new Date(log.createdAt).toLocaleDateString()
        const dur = this.formatDuration(log.activeDurationMs || 0)
        return `
          <div class="settings-history-row">
            <div class="settings-history-meta">
              <span class="settings-history-title">${this._escapeHtml(log.title || 'Session')}</span>
              <span class="settings-history-date">${dateStr}</span>
            </div>
            <div class="settings-history-stats">
              <span class="settings-history-badge">⏱️ ${dur}</span>
              <span class="settings-history-badge">🎯 ${log.totalSets || 0} sets</span>
            </div>
          </div>
        `
      })
      .join('')
  }

  _updateLiveUI() {
    const durationFormatted = this.formatDuration(this.activeSession.activeDurationMs || 0)

    // Update quick controller bar
    const quickDurationEl = document.getElementById('quickLogLiveDuration')
    if (quickDurationEl) {
      quickDurationEl.textContent = durationFormatted
    }

    // Update live banner inside modal if open
    const liveDurationModal = document.getElementById('slogActiveLiveDuration')
    if (liveDurationModal) {
      liveDurationModal.textContent = durationFormatted
    }
    const livePassesModal = document.getElementById('slogActiveLivePasses')
    if (livePassesModal) {
      livePassesModal.textContent = String(this.activeSession.totalPasses || 0)
    }
    const liveSetsModal = document.getElementById('slogActiveLiveSets')
    if (liveSetsModal) {
      liveSetsModal.textContent = String(this.activeSession.totalSets || 0)
    }
  }

  updateBadge() {
    const badge = document.getElementById('sessionLogCountBadge')
    if (badge) {
      const count = this.logs.length
      badge.textContent = String(count)
      badge.classList.toggle('has-logs', count > 0)
    }
  }

  // --- Clinical Summary Formatting ---

  _formatClinicalSummary(log) {
    const patterns = this._getAllPatternsForLog(log)
    const dateFormatted = new Date(log.createdAt || Date.now()).toLocaleString()
    const activeDur = this.formatDuration(log.activeDurationMs || 0)

    let text = '=== BILATERAL EMDR SESSION RECORD ===\n'
    text += `Date/Time: ${dateFormatted}\n`
    text += `Session Label: ${log.title || 'General Session'}\n`
    text += `Active Stimulation Duration: ${activeDur}\n`
    text += `Sets Completed: ${log.totalSets || 0}\n`
    text += `Total Bilateral Passes: ${log.totalPasses || 0}\n\n`

    text += 'Chosen Stimulation Patterns:\n'
    if (patterns.length > 0) {
      patterns.forEach((p, idx) => {
        const durStr = this.formatDuration(p.durationMs || 0)
        text += `  ${idx + 1}. ${p.name} (${p.directionIcon || ''} ${p.direction}, Speed: ${
          p.speed
        }%, Time: ${durStr}, Passes: ${p.passes || 0})\n`
      })
    } else {
      text += '  - Standard Bilateral Horizontal Stimulation\n'
    }

    if (log.notes && log.notes.trim()) {
      text += `\nTherapist Clinical Observations / Notes:\n${log.notes.trim()}\n`
    }
    text += '====================================='
    return text
  }

  formatDuration(ms) {
    const totalSec = Math.floor((ms || 0) / 1000)
    const minutes = Math.floor(totalSec / 60)
    const seconds = totalSec % 60
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const remMins = minutes % 60
      return `${hours}h ${remMins}m ${seconds}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  _getAllPatternsForLog(log) {
    const list = []
    if (Array.isArray(log.patterns)) {
      list.push(...log.patterns)
    }
    if (log.currentPattern && (log.currentPattern.durationMs > 0 || log.currentPattern.passes > 0)) {
      list.push(log.currentPattern)
    }
    return list
  }

  // --- Helpers & Storage ---

  _loadLogs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch (e) {
      void e
    }
    return []
  }

  _saveLogs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs))
    } catch (e) {
      void e
    }
  }

  _loadActiveSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return parsed
      }
    } catch (e) {
      void e
    }
    return this._createEmptySession()
  }

  _persistActiveSession() {
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(this.activeSession))
    } catch (e) {
      void e
    }
  }

  _autoSyncToLogs() {
    const existingIndex = this.logs.findIndex((l) => l.id === this.activeSession.id)
    if (existingIndex >= 0) {
      this.logs[existingIndex] = Object.assign({}, this.activeSession)
    } else {
      this.logs.unshift(Object.assign({}, this.activeSession))
    }
    this._saveLogs()
    this.updateBadge()
  }

  _createEmptySession() {
    return {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      activeDurationMs: 0,
      totalPasses: 0,
      totalSets: 0,
      patterns: [],
      currentPattern: null,
      notes: ''
    }
  }

  _getCurrentSpeed() {
    try {
      if (typeof globalThis.components?.speed?.getSpeed === 'function') {
        return globalThis.components.speed.getSpeed()
      }
    } catch (e) {
      void e
    }
    return 45
  }

  _getCurrentBallColor() {
    try {
      return (
        globalThis.__current?.colorBall ||
        globalThis.previewPhysicsEngine?.ball?.color ||
        '#60a5fa'
      )
    } catch (e) {
      void e
    }
    return '#60a5fa'
  }

  _getCurrentBgColor() {
    try {
      return globalThis.__current?.colorBg || '#020617'
    } catch (e) {
      void e
    }
    return '#020617'
  }

  _getCurrentSoundType() {
    try {
      return globalThis.AudioManager?.getSoundType?.() || 'soft'
    } catch (e) {
      void e
    }
    return 'soft'
  }

  _getLocalizedPresetName(presetId) {
    if (typeof globalThis.i18n?.t === 'function') {
      const key = `controller.presets.${presetId}.name`
      const val = globalThis.i18n.t(key)
      if (val && val !== key) return val
    }
    const fallbacks = {
      slowCalming: 'Slow Calming',
      fastIntensive: 'Fast Intensive',
      standardProcessing: 'Standard Processing',
      infinityFlow: 'Infinity Flow',
      diagonalProcessing: 'Diagonal Tracking',
      verticalActivation: 'Vertical Activation',
      couplesTherapy: 'Couples Therapy',
      dynamic: 'Dynamic Trajectory'
    }
    return fallbacks[presetId] || presetId
  }

  _getLocalizedDirectionName(dir) {
    if (typeof globalThis.i18n?.t === 'function') {
      const map = {
        horizontal: 'controller.horizontalFull',
        vertical: 'controller.verticalFull',
        diagRL: 'controller.diagLTRB',
        diagRLL: 'controller.diagLBRT',
        random: 'controller.randomFull',
        infinity: 'controller.infinityFull',
        brainspotting: 'controller.brainspottingFull'
      }
      const key = map[dir]
      if (key) {
        const val = globalThis.i18n.t(key)
        if (val && val !== key) return val
      }
    }
    const fallbacks = {
      horizontal: 'Horizontal Bilateral',
      vertical: 'Vertical Tracking',
      diagRL: 'Diagonal (↖→↘)',
      diagRLL: 'Diagonal (↙→↗)',
      random: 'Random Trajectory',
      infinity: 'Figure-8 (Infinity)',
      brainspotting: 'Brainspotting Focus'
    }
    return fallbacks[dir] || dir
  }

  _t(key, defaultVal) {
    if (typeof globalThis.i18n?.t === 'function') {
      const val = globalThis.i18n.t(key)
      if (val && val !== key) return val
    }
    return defaultVal
  }

  _onLanguageChanged() {
    this._injectHeaderButton()
    const btn = document.getElementById('sessionLogBtn')
    if (btn) {
      const label = this._t('controller.sessionLog.headerButton', 'Session Log')
      btn.setAttribute('aria-label', label)
      btn.title = label
      const textEl = btn.querySelector('.header-log-text')
      if (textEl) textEl.textContent = label
    }
    if (this._modalEl && !this._modalEl.hasAttribute('hidden')) {
      this.renderModalContent()
    }
  }

  _showToast(msg) {
    if (typeof globalThis.showSuccessToast === 'function') {
      globalThis.showSuccessToast(msg)
    } else {
      console.log('[SessionLogger]', msg)
    }
  }

  _fallbackCopyText(text) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      this._showToast(
        this._t('controller.sessionLog.copied', 'Clinical summary copied to clipboard')
      )
    } catch (e) {
      void e
    }
    document.body.removeChild(ta)
  }

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}

// Singleton instantiation
const sessionLogger = new SessionLogger()
if (typeof globalThis !== 'undefined') {
  globalThis.sessionLogger = sessionLogger
}

// Auto-init once DOM is loaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sessionLogger.init())
  } else {
    sessionLogger.init()
  }
}

module.exports = {
  SessionLogger,
  sessionLogger
}
