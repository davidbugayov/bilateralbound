/* jshint esversion: 11 */
'use strict'
/**
 * Генерирует уникальный идентификатор сессии
 * @returns {string} Уникальный ID сессии
 */
/* global debugWarn, debugError, globalThis, crypto, togglePlayPause, setDirection, document, Blob, URL, localStorage, prompt, WS_MSG */

function _generateId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID()
  }
  if (crypto?.getRandomValues) {
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    return `${Date.now()}_${array[0].toString(36)}_${array[1].toString(36)}`
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
class ControllerSettingsManager {
  constructor() {
    this.presets = this.loadPresets()
    this.activePresetId = null
    this.sessionHistory = []
    this.sessions = this.loadSessions()
    this.currentSessionId = this.loadCurrentSessionId()
    this.initFeatures()
    this.setupI18nListeners()
  }
  /**
   * Слушатели для смены языка и готовности i18n
   */
  setupI18nListeners() {
    globalThis.addEventListener('i18nLanguageChanged', () => {
      this.renderAllPresetsUI()
    })
    globalThis.addEventListener('i18nReady', () => {
      this.renderAllPresetsUI()
    })
  }
  /**
   * Инициализация новых функций
   */
  initFeatures() {
    this.renderAllPresetsUI()
    this.addSessionManagerUI()
    this.addSessionExportImport()
    this.addHistoryControls()
    this.addKeyboardShortcuts()
    this.updateHeaderSessionName()
  }
  /**
   * Отрисовка всех представлений пресетов (меню в шапке, быстрые кнопки, карточки)
   */
  renderAllPresetsUI() {
    this.initPresetsMenu()
    this.initQuickPresetsBar()
    this.addPresetControls()
    if (this.activePresetId) {
      this._updateActivePresetUI(this.activePresetId)
    }
  }
  /**
   * Управление пресетами настроек
   */
  loadPresets() {
    const defaultPresets = {
      slowCalming: {
        id: 'slowCalming',
        i18nKey: 'controller.presets.slowCalming',
        fallbackName: 'Slow Calming',
        descKey: 'controller.presetDescriptions.slowCalming',
        fallbackDesc:
          'Slow bilateral pace (18%) for calming, grounding & stabilization',
        speed: 18,
        direction: 'horizontal',
        colorBall: '#38bdf8',
        colorBg: '#020617',
        size: 24,
        soundType: 'soft',
        soundEnabled: true,
        icon: '🌊',
        tag: '18% • Calming'
      },
      fastIntensive: {
        id: 'fastIntensive',
        i18nKey: 'controller.presets.fastIntensive',
        fallbackName: 'Fast Intensive',
        descKey: 'controller.presetDescriptions.fastIntensive',
        fallbackDesc:
          'Rapid bilateral passes (78%) to tax working memory & accelerate desensitization',
        speed: 78,
        direction: 'horizontal',
        colorBall: '#f59e0b',
        colorBg: '#000000',
        size: 32,
        soundType: 'tone',
        soundEnabled: true,
        icon: '⚡',
        tag: '78% • Intensive'
      },
      standardProcessing: {
        id: 'standardProcessing',
        i18nKey: 'controller.presets.standardProcessing',
        fallbackName: 'Standard Processing',
        descKey: 'controller.presetDescriptions.standardProcessing',
        fallbackDesc:
          'Classic moderate EMDR bilateral stimulation (45%) for standard reprocessing',
        speed: 45,
        direction: 'horizontal',
        colorBall: '#60a5fa',
        colorBg: '#020617',
        size: 28,
        soundType: 'soft',
        soundEnabled: true,
        icon: '🎯',
        tag: '45% • Standard'
      },
      infinityFlow: {
        id: 'infinityFlow',
        i18nKey: 'controller.presets.infinityFlow',
        fallbackName: 'Infinity Flow',
        descKey: 'controller.presetDescriptions.infinityFlow',
        fallbackDesc:
          'Continuous figure-8 pattern (42%) without edge bounces for deep somatic flow',
        speed: 42,
        direction: 'infinity',
        colorBall: '#10b981',
        colorBg: '#052e16',
        size: 28,
        soundType: 'soft',
        soundEnabled: true,
        icon: '∞',
        tag: '42% • Figure-8'
      },
      diagonalProcessing: {
        id: 'diagonalProcessing',
        i18nKey: 'controller.presets.diagonalProcessing',
        fallbackName: 'Diagonal Tracking',
        descKey: 'controller.presetDescriptions.diagonalProcessing',
        fallbackDesc:
          'Alternating cross-hemispheric diagonal bilateral tracking (45%)',
        speed: 45,
        direction: 'diagRL',
        colorBall: '#a855f7',
        colorBg: '#1e1138',
        size: 26,
        soundType: 'click',
        soundEnabled: true,
        icon: '↖↘',
        tag: '45% • Diagonal'
      },
      verticalActivation: {
        id: 'verticalActivation',
        i18nKey: 'controller.presets.verticalActivation',
        fallbackName: 'Vertical Focus',
        descKey: 'controller.presetDescriptions.verticalActivation',
        fallbackDesc:
          'Vertical eye movement (60%) for bodily alertness and somatic recalibration',
        speed: 60,
        direction: 'vertical',
        colorBall: '#ef4444',
        colorBg: '#180808',
        size: 30,
        soundType: 'tick',
        soundEnabled: true,
        icon: '↕️',
        tag: '60% • Vertical'
      },
      couplesTherapy: {
        id: 'couplesTherapy',
        i18nKey: 'controller.presets.couplesTherapy',
        fallbackName: 'Couples Therapy',
        descKey: 'controller.presetDescriptions.couplesTherapy',
        fallbackDesc:
          'Synchronized bilateral path for relational EMDR (40%)',
        speed: 40,
        direction: 'diagRL',
        colorBall: '#10b981',
        colorBg: '#052e16',
        size: 25,
        soundType: 'soft',
        soundEnabled: true,
        icon: '🤝',
        tag: '40% • Relational'
      },
      dynamic: {
        id: 'dynamic',
        i18nKey: 'controller.presets.dynamic',
        fallbackName: 'Dynamic',
        descKey: 'controller.presetDescriptions.dynamic',
        fallbackDesc:
          'Dynamic alternating trajectory for active processing (60%)',
        speed: 60,
        direction: 'diagRLL',
        colorBall: '#f59e0b',
        colorBg: '#2b1b0e',
        size: 35,
        soundType: 'soft',
        soundEnabled: true,
        icon: '🌀',
        tag: '60% • Dynamic'
      }
    }
    try {
      const raw = localStorage.getItem('bb_presets')
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved && typeof saved === 'object') {
          return { ...defaultPresets, ...saved }
        }
      }
    } catch (err) {
      debugWarn('Не удалось загрузить сохранённые пресеты:', err)
    }
    return defaultPresets
  }
  /**
   * Инициализация выпадающего меню пресетов в шапке контроллера
   */
  initPresetsMenu() {
    const btn = document.getElementById('presetsMenuBtn')
    const menu = document.getElementById('presetsDropdownMenu')
    const list = document.getElementById('presetsDropdownList')
    if (!btn || !menu || !list) return

    // Рендерим пункты меню
    while (list.firstChild) list.firstChild.remove()
    for (const [id, config] of Object.entries(this.presets)) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'preset-menu-item'
      item.dataset.presetId = id
      item.setAttribute('role', 'menuitem')

      const iconWrap = document.createElement('span')
      iconWrap.className = 'pmenu-icon-wrap'
      iconWrap.setAttribute('aria-hidden', 'true')
      iconWrap.textContent = config.icon || '🎯'

      const body = document.createElement('div')
      body.className = 'pmenu-body'

      const topRow = document.createElement('div')
      topRow.className = 'pmenu-top-row'

      const title = document.createElement('span')
      title.className = 'pmenu-title'
      if (config.i18nKey) {
        title.dataset.i18n = config.i18nKey
        title.textContent =
          globalThis.i18n?.t(config.i18nKey) || config.fallbackName || id
      } else {
        title.textContent = config.fallbackName || id
      }

      const tag = document.createElement('span')
      tag.className = 'pmenu-tag'
      tag.textContent = config.tag || `${config.speed}%`

      topRow.appendChild(title)
      topRow.appendChild(tag)

      const desc = document.createElement('span')
      desc.className = 'pmenu-desc'
      if (config.descKey) {
        desc.dataset.i18n = config.descKey
        desc.textContent =
          globalThis.i18n?.t(config.descKey) || config.fallbackDesc || ''
      } else {
        desc.textContent = config.fallbackDesc || ''
      }

      body.appendChild(topRow)
      body.appendChild(desc)

      const check = document.createElement('span')
      check.className = 'pmenu-check'
      check.setAttribute('aria-hidden', 'true')
      check.textContent = '✓'

      item.appendChild(iconWrap)
      item.appendChild(body)
      item.appendChild(check)

      item.onclick = (e) => {
        e.stopPropagation()
        this.applyPreset(config, id)
        this.closePresetsMenu()
      }

      list.appendChild(item)
    }

    // Слушатели открытия/закрытия
    if (!this._presetsMenuInitialized) {
      this._presetsMenuInitialized = true
      btn.onclick = (e) => {
        e.stopPropagation()
        this.togglePresetsMenu()
      }
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#headerPresetsWrapper')) {
          this.closePresetsMenu()
        }
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closePresetsMenu()
        }
      })
    }
  }
  togglePresetsMenu() {
    const btn = document.getElementById('presetsMenuBtn')
    const menu = document.getElementById('presetsDropdownMenu')
    if (!btn || !menu) return
    const isHidden = menu.classList.contains('hidden')
    if (isHidden) {
      menu.classList.remove('hidden')
      btn.setAttribute('aria-expanded', 'true')
    } else {
      menu.classList.add('hidden')
      btn.setAttribute('aria-expanded', 'false')
    }
  }
  closePresetsMenu() {
    const btn = document.getElementById('presetsMenuBtn')
    const menu = document.getElementById('presetsDropdownMenu')
    if (btn && menu && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden')
      btn.setAttribute('aria-expanded', 'false')
    }
  }
  /**
   * Инициализация панели быстрых пресетов над блоком Direction
   */
  initQuickPresetsBar() {
    const pillsContainer = document.getElementById('presetsQuickPills')
    if (!pillsContainer) return
    while (pillsContainer.firstChild) pillsContainer.firstChild.remove()

    // Главные паттерны для мгновенного переключения в 1 клик
    const quickPresetIds = [
      'slowCalming',
      'fastIntensive',
      'standardProcessing',
      'infinityFlow',
      'diagonalProcessing',
      'verticalActivation'
    ]

    for (const id of quickPresetIds) {
      const config = this.presets[id]
      if (!config) continue

      const pill = document.createElement('button')
      pill.type = 'button'
      pill.className = 'preset-pill'
      pill.dataset.presetId = id
      const titleText =
        (config.descKey && globalThis.i18n?.t(config.descKey)) ||
        config.fallbackDesc ||
        id
      pill.setAttribute('title', titleText)

      const left = document.createElement('div')
      left.className = 'preset-pill-left'

      const icon = document.createElement('span')
      icon.className = 'preset-pill-icon'
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = config.icon || '🎯'

      const name = document.createElement('span')
      name.className = 'preset-pill-name'
      if (config.i18nKey) {
        name.dataset.i18n = config.i18nKey
        name.textContent =
          globalThis.i18n?.t(config.i18nKey) || config.fallbackName || id
      } else {
        name.textContent = config.fallbackName || id
      }

      left.appendChild(icon)
      left.appendChild(name)

      const tag = document.createElement('span')
      tag.className = 'preset-pill-tag'
      tag.textContent = `${config.speed}%`

      pill.appendChild(left)
      pill.appendChild(tag)

      pill.onclick = () => this.applyPreset(config, id)
      pillsContainer.appendChild(pill)
    }
  }
  /**
   * Карточки пресетов в нижней секции настроек
   */
  addPresetControls() {
    const container = document.getElementById('presetControls')
    if (!container) return
    while (container.firstChild) container.firstChild.remove()

    const dirSymbolMap = {
      horizontal: '↔️',
      vertical: '↕️',
      infinity: '∞',
      diagRL: '↖↘',
      diagLR: '↗↙',
      diagRLL: '🌀'
    }

    for (const [id, config] of Object.entries(this.presets)) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'preset-card'
      btn.dataset.presetId = id

      const icon = document.createElement('span')
      icon.className = 'preset-icon'
      icon.textContent = config.icon || '🎯'
      icon.setAttribute('aria-hidden', 'true')

      const name = document.createElement('span')
      name.className = 'preset-name'
      if (config.i18nKey) {
        name.dataset.i18n = config.i18nKey
        name.textContent =
          globalThis.i18n?.t(config.i18nKey) || config.fallbackName || id
      } else {
        name.textContent = config.fallbackName || id
      }

      const tag = document.createElement('span')
      tag.className = 'preset-card-tag'
      tag.textContent = config.tag || `${config.speed}%`

      const desc = document.createElement('span')
      desc.className = 'preset-card-desc'
      if (config.descKey) {
        desc.dataset.i18n = config.descKey
        desc.textContent =
          globalThis.i18n?.t(config.descKey) || config.fallbackDesc || ''
      } else {
        desc.textContent = config.fallbackDesc || ''
      }

      const dots = document.createElement('div')
      dots.className = 'preset-preview-dots'

      const ballDot = document.createElement('span')
      ballDot.className = 'preset-preview-ball'
      ballDot.style.backgroundColor = config.colorBall || '#60a5fa'

      const dirSpan = document.createElement('span')
      dirSpan.className = 'preset-preview-dir'
      dirSpan.textContent = dirSymbolMap[config.direction] || '↔️'

      dots.appendChild(ballDot)
      dots.appendChild(dirSpan)

      btn.appendChild(icon)
      btn.appendChild(name)
      btn.appendChild(tag)
      btn.appendChild(desc)
      btn.appendChild(dots)

      btn.onclick = () => this.applyPreset(config, id)
      container.appendChild(btn)
    }

    if (globalThis.i18n?.applyTranslations) {
      globalThis.i18n.applyTranslations()
    }
    if (globalThis.reinitializeViewerConnectionWarnings) {
      globalThis.reinitializeViewerConnectionWarnings()
    }
  }
  /**
   * Применение предустановленных настроек
   */
  async applyPreset(preset, presetId = null) {
    try {
      if (!preset) return
      if (!presetId) {
        presetId =
          preset.id ||
          Object.entries(this.presets).find(([, v]) => v === preset)?.[0] ||
          null
      }
      this.activePresetId = presetId
      await this._applyPresetSettings(preset)
      this._updateActivePresetUI(presetId)
      this._showPresetAppliedNotification(preset)
      try {
        if (globalThis.sessionLogger?.recordPreset) {
          globalThis.sessionLogger.recordPreset(presetId, preset)
        }
      } catch (e) {
        void e
      }
    } catch (error) {
      debugError('Apply preset error:', error)
      globalThis.notificationSystem?.error('Error', 'Failed to apply preset')
    }
  }
  /**
   * Обновление активного состояния во всех компонентах интерфейса
   * @private
   */
  _updateActivePresetUI(activeId) {
    if (!activeId) return
    document
      .querySelectorAll('#presetsDropdownList .preset-menu-item')
      .forEach((item) => {
        item.classList.toggle('active', item.dataset.presetId === activeId)
      })
    document
      .querySelectorAll('#presetsQuickPills .preset-pill')
      .forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.presetId === activeId)
      })
    document
      .querySelectorAll('#presetControls .preset-card')
      .forEach((card) => {
        card.classList.toggle('active', card.dataset.presetId === activeId)
      })
  }
  /**
   * Применяет настройки пресета
   * @private
   */
  async _applyPresetSettings(preset) {
    await this._applyCommonSettings(preset)
  }
  /**
   * Показывает уведомление об применении пресета
   * @private
   */
  _showPresetAppliedNotification(preset) {
    const presetEntry = Object.entries(this.presets).find(
      ([, v]) => v === preset
    )
    let presetName = ''
    if (presetEntry) {
      if (presetEntry[1].i18nKey) {
        presetName =
          globalThis.i18n?.t(presetEntry[1].i18nKey) ||
          presetEntry[1].fallbackName
      } else {
        presetName = presetEntry[1].fallbackName || presetEntry[0]
      }
    }
    const i18n = globalThis.i18n
    const appliedKey = 'controller.presetApplied'
    const appliedLabel =
      i18n?.isReady && i18n.t(appliedKey) !== appliedKey
        ? i18n.t(appliedKey)
        : 'Preset applied'
    globalThis.successToast?.success(`${presetName} — ${appliedLabel}`)
  }
  /**
   * Сохраняет текущее состояние как кастомный пресет
   */
  createCustomPreset() {
    const name = prompt(
      globalThis.i18n?.t('controller.presetNamePrompt') || 'New preset name:'
    )
    if (!name || name.trim() === '') return
    const trimmed = name.trim()
    const colorBtn = document.querySelector('.color-btn.active')
    const currentSpeed = globalThis.components?.speed?.getSpeed?.() ?? 40
    const currentDir = globalThis.currentDirectionMode || 'horizontal'
    this.presets[trimmed] = {
      id: trimmed,
      fallbackName: trimmed,
      fallbackDesc: `Custom preset (${currentSpeed}%)`,
      speed: currentSpeed,
      colorBall: colorBtn?.style?.backgroundColor ?? '#60a5fa',
      colorBg: document.body.style.backgroundColor || '#020617',
      size: document.querySelector('.size-btn.active')?.dataset?.size ?? 40,
      direction: currentDir,
      icon: '✨',
      tag: `${currentSpeed}%`
    }
    this.savePresets()
    this.renderAllPresetsUI()
    globalThis.successToast?.success(
      `"${trimmed}" — ${globalThis.i18n?.t('controller.sessionManagement.presetSaved') || 'Preset saved'}`
    )
  }
  savePresets() {
    try {
      localStorage.setItem('bb_presets', JSON.stringify(this.presets))
    } catch (err) {
      debugWarn('Не удалось сохранить пресеты:', err)
    }
  }
  /**
   * Управление экспортом/импортом сессий
   */
  addSessionExportImport() {
    const container = document.getElementById('sessionControls')
    if (!container) return
    const buttonContainer = document.createElement('div')
    buttonContainer.style.display = 'grid'
    buttonContainer.style.gridTemplateColumns = '1fr 1fr'
    buttonContainer.style.gap = '10px'
    buttonContainer.style.marginTop = '12px'
    const exportBtn = document.createElement('button')
    exportBtn.className = 'btn outline'
    exportBtn.textContent =
      globalThis.i18n?.t('controller.sessionManagement.exportButton') ||
      '📤 Export session'
    exportBtn.style.width = '100%'
    exportBtn.onclick = () => this.exportSession()
    const importInput = document.createElement('input')
    importInput.type = 'file'
    importInput.accept = '.json'
    importInput.style.display = 'none'
    importInput.onchange = (e) => this.importSession(e.target.files[0])
    const importBtn = document.createElement('button')
    importBtn.className = 'btn outline'
    importBtn.textContent =
      globalThis.i18n?.t('controller.sessionManagement.importButton') ||
      '📥 Import session'
    importBtn.style.width = '100%'
    importBtn.onclick = () => importInput.click()
    buttonContainer.appendChild(exportBtn)
    buttonContainer.appendChild(importBtn)
    container.appendChild(buttonContainer)
    container.appendChild(importInput)
  }
  /**
   * Экспорт текущей сессии в JSON файл
   */
  exportSession() {
    const sessionData = this._getCurrentSessionData()
    const dataStr = JSON.stringify(sessionData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bilateralbound-session-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
    globalThis.successToast?.success(
      globalThis.i18n?.t('controller.sessionManagement.sessionExported') ||
        'Session exported'
    )
  }
  /**
   * Импорт сессии из JSON файла
   */
  async importSession(file) {
    if (!file) return
    try {
      const text = await file.text()
      const sessionData = JSON.parse(text)
      if (sessionData.settings) {
        await this.applySettings(sessionData.settings)
      }
      if (sessionData.counters) {
        this.applyCounters(sessionData.counters)
      }
      globalThis.successToast?.success(
        globalThis.i18n?.t('controller.sessionManagement.sessionImported') ||
          'Session imported'
      )
    } catch (error) {
      debugError('Import error:', error)
      globalThis.notificationSystem?.error('Error', 'Failed to import session')
    }
  }
  async applySettings(settings) {
    await this._applyCommonSettings(settings)
    this.applyPlayStateSetting(settings.isPlaying)
  }
  async _applyCommonSettings(settings) {
    if (!settings) return
    const ballColor = settings.ballColor || settings.colorBall
    const bgColor = settings.bgColor || settings.colorBg
    const ballSize = settings.ballSize || settings.size
    await this._applySpeedSetting(settings.speed)
    this._applyDirectionSetting(settings.direction)
    this._applyColorSettings(ballColor, bgColor)
    this._applySizeSetting(ballSize)
    if (
      typeof settings.soundEnabled === 'boolean' &&
      typeof globalThis.setSoundEnabled === 'function'
    ) {
      globalThis.setSoundEnabled(settings.soundEnabled)
    }
    if (settings.soundType && typeof globalThis.setSoundType === 'function') {
      globalThis.setSoundType(settings.soundType)
    }
  }
  async _applySpeedSetting(speed) {
    if (speed !== undefined && speed !== null && globalThis.components?.speed) {
      globalThis.components.speed.setSpeed(speed, true)
      if (globalThis.previewPhysicsEngine?.setSpeed) {
        globalThis.previewPhysicsEngine.setSpeed(speed)
      }
      await this.sendUpdate({ speed: speed })
    }
  }
  _applyDirectionSetting(direction) {
    if (direction) {
      globalThis.setDirection(direction)
    }
  }
  _applyColorSettings(ballColor, bgColor) {
    if (ballColor) {
      globalThis.setBallColor(ballColor)
    }
    if (bgColor) {
      globalThis.setBackgroundColor(bgColor)
    }
  }
  _applySizeSetting(ballSize) {
    if (ballSize) {
      globalThis.setBallSize(ballSize)
    }
  }
  applyPlayStateSetting(isPlaying) {
    if (isPlaying !== globalThis.isPlaying) {
      globalThis.togglePlayPause()
    }
  }
  applyCounters(counters) {
    if (globalThis.bbCounters) {
      globalThis.bbCounters.timerMs = counters.timer || 0
      globalThis.bbCounters.passes = counters.passes || 0
      globalThis.bbCounters.sets = counters.sets || 0
      globalThis.bbCounters.render?.()
    }
  }
  /**
   * Управление историей сессий
   */
  addHistoryControls() {
    this.sessionHistory.push({
      timestamp: Date.now(),
      settings: this.captureCurrentSettings()
    })
    if (this.sessionHistory.length > 10) {
      this.sessionHistory.shift()
    }
  }
  /**
   * Захват текущих настроек
   */
  captureCurrentSettings() {
    const colorBtn = document.querySelector('.color-btn.active')
    return {
      speed: globalThis.components?.speed?.getSpeed() ?? 40,
      direction: globalThis.currentDirectionMode || 'horizontal',
      ballColor: colorBtn?.style?.backgroundColor ?? '#60a5fa',
      bgColor: document.body.style.backgroundColor || '#020617',
      ballSize: document.querySelector('.size-btn.active')?.dataset?.size ?? 40
    }
  }
  /**
   * Горячие клавиши
   */
  addKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => this.handleKeyPress(e))
  }
  handleKeyPress(event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA')
      return
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'z':
          event.preventDefault()
          this.undoLastChange().catch(debugError)
          break
        case 's':
          event.preventDefault()
          this.createCustomPreset()
          break
      }
      return
    }
    switch (event.key) {
      case ' ':
        event.preventDefault()
        if (typeof togglePlayPause === 'function') {
          togglePlayPause()
        }
        break
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        event.preventDefault()
        this.handleArrowKeys(event.key)
        break
    }
  }
  /**
   * Обработка стрелок клавиатуры
   */
  handleArrowKeys(key) {
    const directionMap = {
      ArrowUp: 'vertical',
      ArrowDown: 'vertical',
      ArrowLeft: 'horizontal',
      ArrowRight: 'horizontal'
    }
    setDirection(directionMap[key])
  }
  /**
   * Отмена последнего изменения
   */
  async undoLastChange() {
    if (this.sessionHistory.length < 2) {
      globalThis.notificationSystem?.warning('', 'No changes to undo')
      return
    }
    this.sessionHistory.pop()
    const previousState = this.sessionHistory.at(-1)
    await this.applyState(previousState)
    globalThis.successToast?.success(
      globalThis.i18n?.t('controller.sessionManagement.changeUndone') ||
        'Change undone'
    )
  }
  /**
   * Применяет сохраненное состояние
   */
  async applyState(state) {
    await this._applyCommonSettings(state)
  }
  /**
   * Менеджер локальных сессий (с именем)
   */
  loadSessions() {
    try {
      const raw = localStorage.getItem('bb_sessions')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.sessions &&
        Array.isArray(parsed.sessions)
      ) {
        return parsed.sessions
      }
    } catch (err) {
      debugWarn('Не удалось загрузить сохранённые сессии:', err)
    }
    return []
  }
  saveSessions() {
    try {
      localStorage.setItem('bb_sessions', JSON.stringify(this.sessions))
    } catch (err) {
      debugWarn('Не удалось сохранить сессии:', err)
    }
  }
  loadCurrentSessionId() {
    try {
      return localStorage.getItem('bb_current_session') || null
    } catch (err) {
      debugWarn('Error loading current session ID:', err)
      return null
    }
  }
  persistCurrentSessionId(id) {
    try {
      if (id) {
        localStorage.setItem('bb_current_session', id)
      } else {
        localStorage.removeItem('bb_current_session')
      }
    } catch (err) {
      debugWarn('Error persisting session ID:', err)
    }
    this.currentSessionId = id || null
  }
  addSessionManagerUI() {
    const container = document.getElementById('sessionControls')
    if (!container) return
    container.innerHTML = ''
    const nameRow = document.createElement('div')
    nameRow.style.display = 'flex'
    nameRow.style.gap = '8px'
    nameRow.style.marginBottom = '8px'
    const saveBtn = document.createElement('button')
    saveBtn.className = 'btn'
    saveBtn.textContent =
      globalThis.i18n?.t('controller.sessionManagement.saveButton') ||
      '💾 Save'
    saveBtn.onclick = () => this.saveNamedSession('Session')
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'btn outline'
    deleteBtn.textContent =
      globalThis.i18n?.t('controller.sessionManagement.deleteButton') ||
      '🗑 Delete'
    deleteBtn.disabled = !this.currentSessionId
    deleteBtn.onclick = () => this.deleteSessionById(this.currentSessionId)
    nameRow.appendChild(saveBtn)
    nameRow.appendChild(deleteBtn)
    const listWrap = document.createElement('div')
    listWrap.id = 'bbSessionsList'
    listWrap.style.marginTop = '8px'
    container.appendChild(nameRow)
    container.appendChild(listWrap)
    this.renderSessionsList()
  }
  renderSessionsList() {
    const listWrap = document.getElementById('bbSessionsList')
    if (!listWrap) return
    listWrap.innerHTML = ''
    if (!this.sessions.length) {
      const empty = document.createElement('div')
      empty.style.color = '#9ca3af'
      empty.style.fontSize = '12px'
      empty.textContent =
        globalThis.i18n?.t('controller.sessionManagement.noSessions') ||
        'No saved sessions'
      listWrap.appendChild(empty)
      return
    }
    const ul = document.createElement('div')
    ul.style.display = 'flex'
    ul.style.flexDirection = 'column'
    ul.style.gap = '6px'
    for (const s of this.sessions
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))) {
      const item = document.createElement('div')
      item.style.display = 'flex'
      item.style.alignItems = 'center'
      item.style.justifyContent = 'space-between'
      item.style.background = '#0b1220'
      item.style.border = '1px solid #1f2937'
      item.style.borderRadius = '8px'
      item.style.padding = '8px 10px'
      const info = document.createElement('div')
      info.style.display = 'flex'
      info.style.flexDirection = 'column'
      const title = document.createElement('div')
      title.style.color = '#e5e7eb'
      title.style.fontWeight = '600'
      title.textContent = s.name || 'Untitled'
      const meta = document.createElement('div')
      meta.style.color = '#9ca3af'
      meta.style.fontSize = '11px'
      meta.textContent = `${globalThis.i18n?.t('controller.sessionManagement.updated') || 'Updated'}: ${new Date(s.updatedAt).toLocaleString()}`
      info.appendChild(title)
      info.appendChild(meta)
      const actions = document.createElement('div')
      actions.style.display = 'flex'
      actions.style.gap = '6px'
      const loadBtn = document.createElement('button')
      loadBtn.className = 'btn'
      loadBtn.textContent =
        globalThis.i18n?.t('controller.sessionManagement.loadButton') || 'Load'
      loadBtn.onclick = () => this.loadSessionById(s.id)
      const renameBtn = document.createElement('button')
      renameBtn.className = 'btn outline'
      renameBtn.textContent =
        globalThis.i18n?.t('controller.sessionManagement.renameButton') ||
        '✎ Rename'
      renameBtn.onclick = () => this.renameSessionById(s.id)
      const delBtn = document.createElement('button')
      delBtn.className = 'btn outline'
      delBtn.textContent = '🗑'
      delBtn.onclick = () => this.deleteSessionById(s.id)
      actions.appendChild(loadBtn)
      actions.appendChild(renameBtn)
      actions.appendChild(delBtn)
      item.appendChild(info)
      item.appendChild(actions)
      ul.appendChild(item)
    }
    listWrap.appendChild(ul)
  }
  _getCurrentSessionData() {
    const colorBtn = document.querySelector('.color-btn.active')
    return {
      timestamp: new Date().toISOString(),
      sessionId: globalThis.__current?.sessionId ?? null,
      settings: {
        speed: globalThis.components?.speed?.getSpeed() ?? 40,
        direction: globalThis.currentDirectionMode || 'horizontal',
        ballColor: colorBtn?.style?.backgroundColor ?? '#60a5fa',
        bgColor: document.body.style.backgroundColor || '#020617',
        ballSize:
          document.querySelector('.size-btn.active')?.dataset?.size ?? 40,
        isPlaying: globalThis.isPlaying || false
      },
      viewerConnected: globalThis.__current?.viewerConnected ?? false,
      viewerScreenSize: globalThis.__current?.viewerScreenSize ?? null,
      counters: {
        timer: globalThis.bbCounters?.timerMs ?? 0,
        passes: globalThis.bbCounters?.passes ?? 0,
        sets: globalThis.bbCounters?.sets ?? 0
      }
    }
  }
  async applySessionData(sessionData) {
    try {
      await this._applySessionSettings(sessionData?.settings || {})
      this._applySessionCounters(sessionData?.counters)
    } catch (e) {
      debugError('applySessionData error', e)
      globalThis.notificationSystem?.error('Error', 'Failed to apply session')
    }
  }
  /**
   * Применяет настройки сессии
   * @private
   */
  async _applySessionSettings(settings) {
    if (!settings) return
    await this._applyCommonSettings(settings)
    this._applySessionPlayState(settings.isPlaying)
  }
  /**
   * Применяет состояние воспроизведения сессии
   * @private
   */
  _applySessionPlayState(isPlaying) {
    if (typeof isPlaying === 'boolean' && isPlaying !== globalThis.isPlaying) {
      globalThis.togglePlayPause()
    }
  }
  /**
   * Применяет счётчики сессии
   * @private
   */
  _applySessionCounters(counters) {
    if (!counters || !globalThis.bbCounters) return
    globalThis.bbCounters.timerMs = counters.timer || 0
    globalThis.bbCounters.passes = counters.passes || 0
    globalThis.bbCounters.sets = counters.sets || 0
    globalThis.bbCounters.render?.()
  }
  saveNamedSession(nameRaw) {
    const name = (nameRaw || '').trim() || 'Session'
    const existingSession = this.sessions.find((s) => s.name === name)
    if (existingSession) {
      this._updateExistingSession(existingSession)
    } else {
      this._createNewSession(name)
    }
    this.saveSessions()
    this.renderSessionsList()
    this.updateHeaderSessionName()
    globalThis.successToast?.success(
      `"${name}" — ${globalThis.i18n?.t('controller.sessionManagement.sessionSaved') || 'Session saved'}`
    )
  }
  async loadSessionById(id) {
    const session = this.sessions.find((s) => s.id === id)
    if (!session) return
    await this.applySessionData(session.data)
    this.persistCurrentSessionId(id)
    const input = document.getElementById('bbSessionNameInput')
    if (input) input.value = session.name
    this.updateHeaderSessionName()
    this.renderSessionsList()
    globalThis.successToast?.success(
      `"${session.name}" — ${globalThis.i18n?.t('controller.sessionManagement.sessionLoaded') || 'Session loaded'}`
    )
  }
  renameSessionById(id) {
    const session = this.sessions.find((s) => s.id === id)
    if (!session) return
    const newName = prompt(
      globalThis.i18n?.t('controller.renameSessionPrompt') ||
        'New session name:',
      session.name
    )
    if (!newName) return
    session.name = newName.trim() || session.name
    session.updatedAt = new Date().toISOString()
    this.saveSessions()
    if (this.currentSessionId === id) this.updateHeaderSessionName()
    const input = document.getElementById('bbSessionNameInput')
    if (this.currentSessionId === id && input) input.value = session.name
    this.renderSessionsList()
  }
  deleteSessionById(id) {
    const idx = this.sessions.findIndex((s) => s.id === id)
    if (idx === -1) return
    const [removed] = this.sessions.splice(idx, 1)
    if (this.currentSessionId === id) {
      this.persistCurrentSessionId(null)
      const input = document.getElementById('bbSessionNameInput')
      if (input) input.value = ''
    }
    this.saveSessions()
    this.renderSessionsList()
    this.updateHeaderSessionName()
    globalThis.successToast?.success(
      `"${removed?.name || ''}" — ${globalThis.i18n?.t('controller.sessionManagement.sessionDeleted') || 'Session deleted'}`
    )
  }
  _updateExistingSession(session) {
    session.data = this._getCurrentSessionData()
    session.updatedAt = new Date().toISOString()
    this.persistCurrentSessionId(session.id)
  }
  _createNewSession(name) {
    const now = new Date().toISOString()
    const id = _generateId()
    const session = {
      id,
      name,
      createdAt: now,
      updatedAt: now,
      data: this._getCurrentSessionData()
    }
    this.sessions.push(session)
    this.persistCurrentSessionId(id)
  }
  updateHeaderSessionName() {
    try {
      const el = document.getElementById('sessionInfo')
      if (!el) return
      const current = this.sessions.find((s) => s.id === this.currentSessionId)

      // Update sessionTimestamp span without destroying HTML structure
      const timestampEl = document.getElementById('sessionTimestamp')
      if (timestampEl) {
        const i18n = globalThis.i18n
        const label =
          i18n?.isReady &&
          i18n.t('controller.sessionCreated') !== 'controller.sessionCreated'
            ? i18n.t('controller.sessionCreated')
            : 'Created: '
        const dateStr = current?.createdAt
          ? new Date(current.createdAt).toLocaleString()
          : new Date().toLocaleString()
        timestampEl.textContent = `${label}${dateStr}`
      }

      // Update name in sessionInfo but keep sessionTimestamp span intact
      const nameTxt = current?.name || ''
      if (nameTxt) {
        // Only add name display if it doesn't exist
        let nameEl = document.getElementById('sessionName')
        if (!nameEl) {
          nameEl = document.createElement('span')
          nameEl.id = 'sessionName'
          nameEl.className = 'session-info-item'
          nameEl.style.display = 'inline'
          nameEl.style.marginRight = '8px'
          el.insertBefore(nameEl, timestampEl)
        }
        nameEl.textContent = `${current.name}`
      } else {
        // Remove name if it exists
        const nameEl = document.getElementById('sessionName')
        if (nameEl) nameEl.remove()
      }
    } catch (err) {
      debugWarn('Error updating session display:', err)
    }
  }
  /**
   * Утилиты
   */
  async sendUpdate(data) {
    await globalThis.wsClient?.send?.(WS_MSG.controllerUpdate, data)
  }
}
globalThis.ControllerSettingsManager = ControllerSettingsManager
globalThis.applyPreset = (preset, presetId) =>
  globalThis.controllerSettingsManager?.applyPreset?.(preset, presetId)
globalThis.applyPresetById = (presetId) => {
  const m = globalThis.controllerSettingsManager
  if (m && m.presets && m.presets[presetId]) {
    m.applyPreset(m.presets[presetId], presetId)
    return true
  }
  return false
}
globalThis.createCustomPreset = () =>
  globalThis.controllerSettingsManager?.createCustomPreset?.()
globalThis.exportSession = () =>
  globalThis.controllerSettingsManager?.exportSession?.()
globalThis.importSession = (file) =>
  globalThis.controllerSettingsManager?.importSession?.(file)
// Initialize when DOM is ready
function initControllerSettings() {
  if (!globalThis.controllerSettingsManager) {
    globalThis.controllerSettingsManager =
      new globalThis.ControllerSettingsManager()
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initControllerSettings)
} else {
  initControllerSettings()
}
