/**
 * Новые функциональные улучшения для BilateralBound
 * Добавлены в v1.2.0
 */

/* exported applyPreset, createCustomPreset, exportSession, importSession */

class FeatureManager {
  constructor () {
    this.presets = this.loadPresets()
    this.sessionHistory = []
    this.sessions = this.loadSessions()
    this.currentSessionId = this.loadCurrentSessionId()
    this.initFeatures()
  }
  /**
   * Инициализация новых функций
   */
  initFeatures () {
    this.addPresetControls()
    this.addSessionManagerUI()
    this.addSessionExportImport()
    this.addHistoryControls()
    this.addKeyboardShortcuts()
    this.addThemeToggle()
    this.updateHeaderSessionName()
    console.log('✅ Новые функции инициализированы')
  }

  /**
   * Управление пресетами настроек
   */
  loadPresets () {
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
      console.warn('Не удалось загрузить сохранённые пресеты')
    }
    return defaultPresets
  }

  addPresetControls () {
    const container = document.getElementById('presetControls')
    if (!container) return

    // Очищаем контейнер
    container.innerHTML = ''

    const presetGrid = document.createElement('div')
    presetGrid.style.display = 'grid'
    presetGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))'
    presetGrid.style.gap = '8px'

    Object.entries(this.presets).forEach(([name, config]) => {
      const btn = document.createElement('button')
      btn.className = 'btn outline'
      btn.style.padding = '8px'
      btn.style.fontSize = '12px'
      btn.textContent = name
      btn.onclick = () => this.applyPreset(config)
      presetGrid.appendChild(btn)
    })

    container.appendChild(presetGrid)
  }

  /**
   * Применение предустановленных настроек
   */
  async applyPreset (preset) {
    try {
      // Применяем скорость
      if (preset.speed && window.components?.speed) {
        window.components.speed.setSpeed(preset.speed)
        await this.sendUpdate({ speed: preset.speed })
      }

      // Применяем направление
      if (preset.direction) {
        window.setDirection(preset.direction)
      }

      // Применяем цвета
      if (preset.colorBall) {
        window.setBallColor(preset.colorBall)
      }
      if (preset.colorBg) {
        window.setBackgroundColor(preset.colorBg)
      }

      // Применяем размер
      if (preset.size) {
        window.setBallSize(preset.size)
      }

      // Показываем уведомление
      this.showNotification(`Пресет "${Object.keys(this.presets).find(key => this.presets[key] === preset)}" применён`, 'success')
    } catch {
      this.showNotification('Ошибка применения пресета', 'error')
    }
  }

  /**
   * Сохраняет текущее состояние как кастомный пресет
   */
  createCustomPreset () {
    const name = prompt('Название нового пресета:')
    if (!name || name.trim() === '') return

    const preset = {
      speed: window.components?.speed?.getSpeed() || 40,
      colorBall: document.querySelector('.color-btn.active')?.style.backgroundColor || '#60a5fa',
      colorBg: document.body.style.backgroundColor || '#020617',
      size: document.querySelector('.size-btn.active')?.dataset.size || 20,
      direction: window.currentDirectionMode || 'horizontal'
    }

    this.presets[name.trim()] = preset
    this.savePresets()
    this.addPresetControls()
    this.showNotification(`Пресет "${name}" сохранён`, 'success')
  }

  savePresets () {
    try {
      localStorage.setItem('bb_presets', JSON.stringify(this.presets))
    } catch {
      console.warn('Не удалось сохранить пресеты')
    }
  }

  /**
   * Управление экспортом/импортом сессий
   */
  addSessionExportImport () {
    const container = document.getElementById('sessionControls')
    if (!container) return

    // Кнопка экспорта
    const exportBtn = document.createElement('button')
    exportBtn.className = 'btn outline'
    exportBtn.innerHTML = '📤 Экспорт сессии'
    exportBtn.onclick = () => this.exportSession()

    // Кнопка импорта
    const importInput = document.createElement('input')
    importInput.type = 'file'
    importInput.accept = '.json'
    importInput.style.display = 'none'
    importInput.onchange = (e) => this.importSession(e.target.files[0])

    const importBtn = document.createElement('button')
    importBtn.className = 'btn outline'
    importBtn.innerHTML = '📥 Импорт сессии'
    importBtn.onclick = () => importInput.click()

    container.appendChild(exportBtn)
    container.appendChild(importBtn)
    container.appendChild(importInput)
  }

  /**
   * Экспорт текущей сессии в JSON файл
   */
  exportSession () {
    const sessionData = {
      timestamp: new Date().toISOString(),
      sessionId: window.__current?.sessionId,
      settings: {
        speed: window.components?.speed?.getSpeed() || 40,
        direction: window.currentDirectionMode || 'horizontal',
        ballColor: document.querySelector('.color-btn.active')?.style.backgroundColor || '#60a5fa',
        bgColor: document.body.style.backgroundColor || '#020617',
        ballSize: document.querySelector('.size-btn.active')?.dataset.size || 20,
        isPlaying: window.isPlaying || false
      },
      viewerConnected: window.__current?.viewerConnected || false,
      viewerScreenSize: window.__current?.viewerScreenSize || null,
      counters: {
        timer: window.bbCounters?.timerMs || 0,
        passes: window.bbCounters?.passes || 0,
        sets: window.bbCounters?.sets || 0
      }
    }

    const dataStr = JSON.stringify(sessionData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)

    const link = document.createElement('a')
    link.href = url
    link.download = `bilateralbound-session-${new Date().toISOString().split('T')[0]}.json`
    link.click()

    URL.revokeObjectURL(url)
    this.showNotification('Сессия экспортирована', 'success')
  }

  /**
   * Импорт сессии из JSON файла
   */
  async importSession (file) {
    if (!file) return

    try {
      const text = await file.text()
      const sessionData = JSON.parse(text)

      // Применяем импортированные настройки
      if (sessionData.settings) {
        const settings = sessionData.settings

        // Применяем скорость
        if (settings.speed && window.components?.speed) {
          window.components.speed.setSpeed(settings.speed)
          await this.sendUpdate({ speed: settings.speed })
        }

        // Применяем направление
        if (settings.direction) {
          window.setDirection(settings.direction)
        }

        // Применяем цвета
        if (settings.ballColor) {
          window.setBallColor(settings.ballColor)
        }
        if (settings.bgColor) {
          window.setBackgroundColor(settings.bgColor)
        }

        // Применяем размер
        if (settings.ballSize) {
          window.setBallSize(settings.ballSize)
        }

        // Применяем состояние игры
        if (settings.isPlaying && !window.isPlaying) {
          window.togglePlayPause()
        } else if (!settings.isPlaying && window.isPlaying) {
          window.togglePlayPause()
        }
      }

      // Восстанавливаем счётчики
      if (sessionData.counters && window.bbCounters) {
        window.bbCounters.timerMs = sessionData.counters.timer || 0
        window.bbCounters.passes = sessionData.counters.passes || 0
        window.bbCounters.sets = sessionData.counters.sets || 0
        window.bbCounters.render()
      }

      this.showNotification('Сессия импортирована', 'success')
    } catch (error) {
      this.showNotification('Ошибка импорта сессии', 'error')
      console.error('Import error:', error)
    }
  }

  /**
   * Управление историей сессий
   */
  addHistoryControls () {
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
  captureCurrentSettings () {
    return {
      speed: window.components?.speed?.getSpeed() || 40,
      direction: window.currentDirectionMode || 'horizontal',
      ballColor: document.querySelector('.color-btn.active')?.style.backgroundColor || '#60a5fa',
      bgColor: document.body.style.backgroundColor || '#020617',
      ballSize: document.querySelector('.size-btn.active')?.dataset.size || 20
    }
  }

  /**
   * Горячие клавиши
   */
  addKeyboardShortcuts () {
    document.addEventListener('keydown', (e) => {
      // Игнорируем если фокус в input
      if (e.target.tagName === 'INPUT') return

      // Ctrl+Z - отменить последнее изменение
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        this.undoLastChange().catch(console.error)
      }

      // Ctrl+S - сохранить пресет
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        this.createCustomPreset()
      }

      // Пробел - старт/стоп
      if (e.key === ' ') {
        e.preventDefault()
        togglePlayPause()
      }

      // Стрелки - управление направлением
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        this.handleArrowKeys(e.key)
      }
    })
  }

  /**
   * Обработка стрелок клавиатуры
   */
  handleArrowKeys (key) {
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
  async undoLastChange () {
    if (this.sessionHistory.length < 2) {
      this.showNotification('Нет изменений для отмены', 'warning')
      return
    }

    this.sessionHistory.pop()
    const previousState = this.sessionHistory[this.sessionHistory.length - 1]

    await this.applyState(previousState)
    this.showNotification('Изменение отменено', 'success')
  }

  /**
   * Применяет сохраненное состояние
   */
  async applyState (state) {
    if (state.speed && window.components?.speed) {
      window.components.speed.setSpeed(state.speed)
      await this.sendUpdate({ speed: state.speed })
    }

    if (state.direction) {
      window.setDirection(state.direction)
    }

    if (state.ballColor) {
      window.setBallColor(state.ballColor)
    }

    if (state.bgColor) {
      window.setBackgroundColor(state.bgColor)
    }

    if (state.ballSize) {
      window.setBallSize(state.ballSize)
    }
  }

  /**
   * Переключатель темы
   */
  addThemeToggle () {
    // Основная кнопка темы
    const toggleBtn = document.getElementById('themeToggle')
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleTheme())
    }

    // Кнопка темы в превью (если существует)
    const previewToggleBtn = document.getElementById('previewThemeToggle')
    if (previewToggleBtn) {
      previewToggleBtn.addEventListener('click', () => this.toggleTheme())
    }

    // Загружаем сохраненную тему
    this.loadTheme()
  }

  toggleTheme () {
    const body = document.body
    const isDark = body.classList.contains('light-theme')

    if (isDark) {
      body.classList.remove('light-theme')
      localStorage.setItem('bb_theme', 'dark')
      this.showNotification('Тёмная тема активирована', 'success')
    } else {
      body.classList.add('light-theme')
      localStorage.setItem('bb_theme', 'light')
      this.showNotification('Светлая тема активирована', 'success')
    }
  }

  loadTheme () {
    const savedTheme = localStorage.getItem('bb_theme') || 'dark'
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme')
    }
  }

  /**
   * Менеджер локальных сессий (с именем)
   */
  loadSessions () {
    try {
      const raw = localStorage.getItem('bb_sessions')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
      // миграция из старого формата объекта
      if (parsed && typeof parsed === 'object' && parsed.sessions && Array.isArray(parsed.sessions)) {
        return parsed.sessions
      }
    } catch {
      console.warn('Не удалось загрузить сохранённые сессии')
    }
    return []
  }

  saveSessions () {
    try {
      localStorage.setItem('bb_sessions', JSON.stringify(this.sessions))
    } catch {
      console.warn('Не удалось сохранить сессии')
    }
  }

  loadCurrentSessionId () {
    try {
      return localStorage.getItem('bb_current_session') || null
    } catch {
      return null
    }
  }

  persistCurrentSessionId (id) {
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

  addSessionManagerUI () {
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

  renderSessionsList () {
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

    this.sessions
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .forEach((s) => {
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
      })

    listWrap.appendChild(ul)
  }

  buildCurrentSessionData () {
    // Похоже на exportSession, но не создаёт файл
    return {
      timestamp: new Date().toISOString(),
      sessionId: window.__current?.sessionId || null,
      settings: {
        speed: window.components?.speed?.getSpeed() || 40,
        direction: window.currentDirectionMode || 'horizontal',
        ballColor: document.querySelector('.color-btn.active')?.style.backgroundColor || '#60a5fa',
        bgColor: document.body.style.backgroundColor || '#020617',
        ballSize: document.querySelector('.size-btn.active')?.dataset.size || 20,
        isPlaying: window.isPlaying || false
      },
      viewerConnected: window.__current?.viewerConnected || false,
      viewerScreenSize: window.__current?.viewerScreenSize || null,
      counters: {
        timer: window.bbCounters?.timerMs || 0,
        passes: window.bbCounters?.passes || 0,
        sets: window.bbCounters?.sets || 0
      }
    }
  }

  async applySessionData (sessionData) {
    try {
      const settings = sessionData?.settings || {}
      if (settings.speed && window.components?.speed) {
        window.components.speed.setSpeed(settings.speed)
        await this.sendUpdate({ speed: settings.speed })
      }
      if (settings.direction) window.setDirection(settings.direction)
      if (settings.ballColor) window.setBallColor(settings.ballColor)
      if (settings.bgColor) window.setBackgroundColor(settings.bgColor)
      if (settings.ballSize) window.setBallSize(settings.ballSize)

      // isPlaying
      if (typeof settings.isPlaying === 'boolean') {
        if (settings.isPlaying && !window.isPlaying) window.togglePlayPause()
        if (!settings.isPlaying && window.isPlaying) window.togglePlayPause()
      }

      // counters
      if (sessionData.counters && window.bbCounters) {
        window.bbCounters.timerMs = sessionData.counters.timer || 0
        window.bbCounters.passes = sessionData.counters.passes || 0
        window.bbCounters.sets = sessionData.counters.sets || 0
        window.bbCounters.render?.()
      }
    } catch (e) {
      console.error('applySessionData error', e)
      this.showNotification('Ошибка применения сессии', 'error')
    }
  }

  saveNamedSession (nameRaw) {
    const name = (nameRaw || '').trim() || 'Сессия'
    const now = new Date().toISOString()

    // если существует с таким именем — обновим его
    let session = this.sessions.find(s => s.name === name)
    if (session) {
      session.data = this.buildCurrentSessionData()
      session.updatedAt = now
      this.persistCurrentSessionId(session.id)
    } else {
      // создаём новую
      const id = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      session = {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        data: this.buildCurrentSessionData()
      }
      this.sessions.push(session)
      this.persistCurrentSessionId(id)
    }

    this.saveSessions()
    this.renderSessionsList()
    this.updateHeaderSessionName()
    this.showNotification(`Сессия "${name}" сохранена`, 'success')
  }

  updateCurrentSession (nameRaw) {
    if (!this.currentSessionId) {
      this.showNotification('Нет выбранной сессии для обновления', 'warning')
      return
    }
    const session = this.sessions.find(s => s.id === this.currentSessionId)
    if (!session) {
      this.showNotification('Текущая сессия не найдена', 'error')
      return
    }
    const name = (nameRaw || session.name || 'Сессия').trim()
    session.name = name
    session.data = this.buildCurrentSessionData()
    session.updatedAt = new Date().toISOString()
    this.saveSessions()
    this.renderSessionsList()
    this.updateHeaderSessionName()
    this.showNotification('Сессия обновлена', 'success')
  }

  async loadSessionById (id) {
    const session = this.sessions.find(s => s.id === id)
    if (!session) return
    await this.applySessionData(session.data)
    this.persistCurrentSessionId(id)
    const input = document.getElementById('bbSessionNameInput')
    if (input) input.value = session.name
    this.updateHeaderSessionName()
    this.renderSessionsList()
    this.showNotification(`Загружена сессия "${session.name}"`, 'success')
  }

  renameSessionById (id) {
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

  deleteSessionById (id) {
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
    this.showNotification(`Сессия "${removed?.name || ''}" удалена`, 'success')
  }

  updateHeaderSessionName () {
    try {
      const el = document.getElementById('sessionInfo')
      if (!el) return
      const current = this.sessions.find(s => s.id === this.currentSessionId)
      const nameTxt = current?.name ? `Название: ${current.name}` : 'Название: —'
      const createdTxt = current?.createdAt ? ` • Создана: ${new Date(current.createdAt).toLocaleString()}` : ''
      el.textContent = `${nameTxt}${createdTxt}`
    } catch {
      // ignore
    }
  }

  /**
   * Утилиты
   */
  async sendUpdate (data) {
    if (window.wsClient && window.wsClient.send) {
      await window.wsClient.send('WS_MSG.controllerUpdate', data)
    }
  }

  showNotification (message, type = 'info') {
    if (type === 'success' && window.showSuccessNotification) {
      window.showSuccessNotification(message)
    } else if (type === 'error' && window.showErrorNotification) {
      window.showErrorNotification('Ошибка', message)
    } else if (type === 'warning' && window.showWarningNotification) {
      window.showWarningNotification('Внимание', message)
    } else if (window.showInfoNotification) {
      window.showInfoNotification('Информация', message)
    } else {
      // Fallback for old notification system
      const notification = document.createElement('div')
      notification.className = 'theme-notification'
      notification.style.background = type === 'success' ? '#10b981' : '#3b82f6'
      notification.textContent = message
      document.body.appendChild(notification)

      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in forwards'
        setTimeout(() => notification.remove(), 300)
      }, 3000)
    }
  }
}

// Экспортируем функции для глобального использования
window.applyPreset = (preset) => window.featureManager?.applyPreset(preset)
window.createCustomPreset = () => window.featureManager?.createCustomPreset()
window.exportSession = () => window.featureManager?.exportSession()
window.importSession = (file) => window.featureManager?.importSession(file)

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  window.featureManager = new FeatureManager()
})
