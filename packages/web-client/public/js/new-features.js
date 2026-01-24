
/**
 * Генерирует уникальный идентификатор сессии
 * @returns {string} Уникальный ID сессии
 */

/* global debugWarn, debugError */

function _generateId() {
  // Используем криптографически стойкий метод генерации случайных чисел
  if (crypto?.randomUUID) {
    return crypto.randomUUID()
  }
  if (crypto?.getRandomValues) {
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    return `${Date.now()}_${array[0].toString(36)}_${array[1].toString(36)}`
  }
  // Fallback для старых браузеров без crypto API
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

class FeatureManager {
  constructor() {
    this.presets = this.loadPresets()
    this.sessionHistory = []
    this.sessions = this.loadSessions()
    this.currentSessionId = this.loadCurrentSessionId()
    this.initFeatures()
  }

  /**
   * Инициализация новых функций
   */
  initFeatures() {
    this.addPresetControls()
    this.addSessionManagerUI()
    this.addSessionExportImport()
    this.addHistoryControls()
    this.addKeyboardShortcuts()
    this.updateHeaderSessionName()
  }

  /**
   * Управление пресетами настроек
   */
  loadPresets() {
    const defaultPresets = {
      Релаксация: {
        speed: 20,
        direction: 'horizontal',
        colorBall: '#60a5fa',
        colorBg: '#020617',
        size: 20
      },
      Активация: {
        speed: 80,
        direction: 'vertical',
        colorBall: '#ef4444',
        colorBg: '#000000',
        size: 30
      },
      'Супружеская терапия': {
        speed: 40,
        direction: 'diagRL',
        colorBall: '#10b981',
        colorBg: '#052e16',
        size: 25
      },
      Динамическая: {
        speed: 60,
        direction: 'diagRLL',
        colorBall: '#f59e0b',
        colorBg: '#2b1b0e',
        size: 35
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
    } catch {
      debugWarn('Не удалось загрузить сохранённые пресеты')
    }

    return defaultPresets
  }

  addPresetControls() {
    const container = document.getElementById('presetControls')
    if (!container) return
    // Очищаем контейнер
    container.innerHTML = ''
    const presetGrid = document.createElement('div')
    presetGrid.style.display = 'grid'
    presetGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))'
    presetGrid.style.gap = '8px'
    for (const [name, config] of Object.entries(this.presets)) {
      const btn = document.createElement('button')
      btn.className = 'btn outline'
      btn.style.padding = '8px'
      btn.style.fontSize = '12px'
      btn.textContent = name
      btn.onclick = () => this.applyPreset(config)
      presetGrid.appendChild(btn)
    }
    container.appendChild(presetGrid)
  }

  /**
   * Применение предустановленных настроек
   */
  async applyPreset(preset) {
    try {
      await this._applyPresetSettings(preset)
      this._showPresetAppliedNotification(preset)
    } catch (error) {
      debugError('Apply preset error:', error)
      globalThis.notificationSystem?.error('Ошибка', 'Ошибка применения пресета')
    }
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
    const presetName = Object.keys(this.presets).find(key => this.presets[key] === preset)
    globalThis.notificationSystem?.success('', `Пресет "${presetName}" применён`)
  }

  /**
   * Сохраняет текущее состояние как кастомный пресет
   */
  createCustomPreset() {
    const name = prompt('Название нового пресета:')
    if (!name || name.trim() === '') return
    const colorBtn = document.querySelector('.color-btn.active')

    this.presets[name.trim()] = {
      speed: globalThis.components?.speed?.getSpeed?.() ?? 40,
      colorBall: colorBtn?.style?.backgroundColor ?? '#60a5fa',
      colorBg: document.body.style.backgroundColor || '#020617',
      size: document.querySelector('.size-btn.active')?.dataset?.size ?? 20,
      direction: globalThis.currentDirectionMode || 'horizontal'
    }

    this.savePresets()
    this.addPresetControls()
    globalThis.notificationSystem?.success('', `Пресет "${name}" сохранён`)
  }

  savePresets() {
    try {
      localStorage.setItem('bb_presets', JSON.stringify(this.presets))
    } catch {
      debugWarn('Не удалось сохранить пресеты')
    }
  }

  /**
   * Управление экспортом/импортом сессий
   */
  addSessionExportImport() {
    const container = document.getElementById('sessionControls')
    if (!container) return
    // Создаем контейнер для горизонтального расположения кнопок
    const buttonContainer = document.createElement('div')
    buttonContainer.style.display = 'grid'
    buttonContainer.style.gridTemplateColumns = '1fr 1fr'
    buttonContainer.style.gap = '10px'
    buttonContainer.style.marginTop = '12px'
    // Кнопка экспорта
    const exportBtn = document.createElement('button')
    exportBtn.className = 'btn outline'
    exportBtn.innerHTML = '📤 Экспорт сессии'
    exportBtn.style.width = '100%'
    exportBtn.onclick = () => this.exportSession()
    // Кнопка импорта
    const importInput = document.createElement('input')
    importInput.type = 'file'
    importInput.accept = '.json'
    importInput.style.display = 'none'
    importInput.onchange = e => this.importSession(e.target.files[0])
    const importBtn = document.createElement('button')
    importBtn.className = 'btn outline'
    importBtn.innerHTML = '📥 Импорт сессии'
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
    globalThis.notificationSystem?.success('', 'Сессия экспортирована')
  }

  /**
   * Импорт сессии из JSON файла
   */
  async importSession(file) {
    if (!file) return
    try {
      const text = await file.text()
      const sessionData = JSON.parse(text)
      // Применяем импортированные настройки
      if (sessionData.settings) {
        await this.applySettings(sessionData.settings)
      }
      // Восстанавливаем счётчики
      if (sessionData.counters) {
        this.applyCounters(sessionData.counters)
      }

      globalThis.notificationSystem?.success('', 'Сессия импортирована')
    } catch (error) {
      debugError('Import error:', error)
      globalThis.notificationSystem?.error('Ошибка', 'Ошибка импорта сессии')
    }
  }

  async applySettings(settings) {
    await this._applyCommonSettings(settings)
    this.applyPlayStateSetting(settings.isPlaying)
  }

  async _applyCommonSettings(settings) {
    await this._applySpeedSetting(settings.speed)
    this._applyDirectionSetting(settings.direction)
    this._applyColorSettings(settings.ballColor, settings.bgColor)
    this._applySizeSetting(settings.ballSize)
  }

  async _applySpeedSetting(speed) {
    if (speed && globalThis.components?.speed) {
      globalThis.components.speed.setSpeed(speed)
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
    // Ограничиваем историю 10 записями
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
      ballSize: document.querySelector('.size-btn.active')?.dataset?.size ?? 20
    }
  }

  /**
   * Горячие клавиши
   */
  addKeyboardShortcuts() {
    document.addEventListener('keydown', e => this.handleKeyPress(e))
  }

  handleKeyPress(event) {
    // Игнорируем если фокус в input
    if (event.target.tagName === 'INPUT') return

    // Обработка комбинаций Ctrl
    if (event.ctrlKey) {
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

    // Обработка одиночных клавиш
    switch (event.key) {
      case ' ':
        event.preventDefault()
        togglePlayPause()
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
      globalThis.notificationSystem?.warning('', 'Нет изменений для отмены')
      return
    }

    this.sessionHistory.pop()
    const previousState = this.sessionHistory.at(-1)

    await this.applyState(previousState)
    globalThis.notificationSystem?.success('', 'Изменение отменено')
  }

  /**
   * Применяет сохраненное состояние
   */
  async applyState(state) {
    await this._applyCommonSettings(state)
  }

  /**
   * Переключатель темы - удалено, используется ThemeManager из common.js
   */

  /**
   * Менеджер локальных сессий (с именем)
   */
  loadSessions() {
    try {
      const raw = localStorage.getItem('bb_sessions')
      if (!raw) return []

      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
      // миграция из старого формата объекта
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.sessions &&
        Array.isArray(parsed.sessions)
      ) {
        return parsed.sessions
      }
    } catch {
      debugWarn('Не удалось загрузить сохранённые сессии')
    }

    return []
  }

  saveSessions() {
    try {
      localStorage.setItem('bb_sessions', JSON.stringify(this.sessions))
    } catch {
      debugWarn('Не удалось сохранить сессии')
    }
  }

  loadCurrentSessionId() {
    try {
      return localStorage.getItem('bb_current_session') || null
    } catch {
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
    } catch {
      // ignore
    }

    this.currentSessionId = id || null
  }

  addSessionManagerUI() {
    const container = document.getElementById('sessionControls')
    if (!container) return
    // Очищаем и строим UI
    container.innerHTML = ''
    const nameRow = document.createElement('div')
    nameRow.style.display = 'flex'
    nameRow.style.gap = '8px'
    nameRow.style.marginBottom = '8px'
    const saveBtn = document.createElement('button')
    saveBtn.className = 'btn'
    saveBtn.textContent = '💾 Сохранить'
    saveBtn.onclick = () => this.saveNamedSession('Сессия')
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'btn outline'
    deleteBtn.textContent = '🗑 Удалить'
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
      empty.textContent = 'Нет сохранённых сессий'
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
      title.textContent = s.name || 'Без названия'
      const meta = document.createElement('div')
      meta.style.color = '#9ca3af'
      meta.style.fontSize = '11px'
      meta.textContent = `Обновлено: ${new Date(s.updatedAt).toLocaleString()}`
      info.appendChild(title)
      info.appendChild(meta)
      const actions = document.createElement('div')
      actions.style.display = 'flex'
      actions.style.gap = '6px'
      const loadBtn = document.createElement('button')
      loadBtn.className = 'btn'
      loadBtn.textContent = 'Загрузить'
      loadBtn.onclick = () => this.loadSessionById(s.id)
      const renameBtn = document.createElement('button')
      renameBtn.className = 'btn outline'
      renameBtn.textContent = '✎ Имя'
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

  buildCurrentSessionData() {
    return this._getCurrentSessionData()
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
        ballSize: document.querySelector('.size-btn.active')?.dataset?.size ?? 20,
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
      globalThis.notificationSystem?.error('Ошибка', 'Ошибка применения сессии')
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
    const name = (nameRaw || '').trim() || 'Сессия'
    const existingSession = this.sessions.find(s => s.name === name)

    if (existingSession) {
      this._updateExistingSession(existingSession)
    } else {
      this._createNewSession(name)
    }

    this.saveSessions()
    this.renderSessionsList()
    this.updateHeaderSessionName()
    globalThis.notificationSystem?.success('', `Сессия "${name}" сохранена`)
  }

  async loadSessionById(id) {
    const session = this.sessions.find(s => s.id === id)
    if (!session) return
    await this.applySessionData(session.data)
    this.persistCurrentSessionId(id)
    const input = document.getElementById('bbSessionNameInput')
    if (input) input.value = session.name
    this.updateHeaderSessionName()
    this.renderSessionsList()
    globalThis.notificationSystem?.success('', `Загружена сессия "${session.name}"`)
  }

  renameSessionById(id) {
    const session = this.sessions.find(s => s.id === id)
    if (!session) return
    const newName = prompt('Новое название сессии:', session.name)
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
    const idx = this.sessions.findIndex(s => s.id === id)
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
    globalThis.notificationSystem?.success('', `Сессия "${removed?.name || ''}" удалена`)
  }

  _updateExistingSession(session) {
    session.data = this.buildCurrentSessionData()
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
      data: this.buildCurrentSessionData()
    }
    this.sessions.push(session)
    this.persistCurrentSessionId(id)
  }

  updateHeaderSessionName() {
    try {
      const el = document.getElementById('sessionInfo')
      if (!el) return
      const current = this.sessions.find(s => s.id === this.currentSessionId)
      const nameTxt = current?.name ? `Название: ${current.name}` : ''
      const createdTxt = current?.createdAt
        ? `${nameTxt ? ' • ' : ''}Создана: ${new Date(current.createdAt).toLocaleString()}`
        : ''
      el.textContent = `${nameTxt}${createdTxt}`
    } catch {
      // ignore
    }
  }

  /**
   * Утилиты
   */
  async sendUpdate(data) {
    await globalThis.wsClient?.send?.('WS_MSG.controllerUpdate', data)
  }
}
// Экспортируем функции для глобального использования
globalThis.applyPreset = preset => globalThis.featureManager?.applyPreset?.(preset)
globalThis.createCustomPreset = () => globalThis.featureManager?.createCustomPreset?.()
globalThis.exportSession = () => globalThis.featureManager?.exportSession?.()
globalThis.importSession = file => globalThis.featureManager?.importSession?.(file)
// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  globalThis.featureManager = new FeatureManager()
})
