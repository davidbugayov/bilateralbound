/**
 * Новые функциональные улучшения для BilateralBound
 * Добавлены в v1.2.0
 */

/* global WebSocketClient, PhysicsEngine */
/* exported applyPreset, createCustomPreset, exportSession, importSession */

class FeatureManager {
  constructor() {
    this.presets = this.loadPresets()
    this.sessionHistory = []
    this.initFeatures()
  }

  /**
   * Инициализация новых функций
   */
  initFeatures() {
    this.addPresetControls()
    this.addSessionExportImport()
    this.addHistoryControls()
    this.addKeyboardShortcuts()
    this.addThemeToggle()
    console.log('✅ Новые функции инициализированы')
  }

  /**
   * Управление пресетами настроек
   */
  loadPresets() {
    const defaultPresets = {
      'Релаксация': {
        speed: 20,
        direction: 'horizontal',
        colorBall: '#60a5fa',
        colorBg: '#020617',
        size: 20
      },
      'Активация': {
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
      'Динамическая': {
        speed: 60,
        direction: 'diagRLL',
        colorBall: '#f59e0b',
        colorBg: '#2b1b0e',
        size: 35
      }
    }
    return defaultPresets
  }

  addPresetControls() {
    const container = document.getElementById('presetControls')
    if (!container) return

    // Очищаем контейнер
    container.innerHTML = '<h3 style="color: #fbbf24; margin-bottom: 12px;">🎯 Быстрые пресеты</h3>'

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
  async applyPreset(preset) {
    try {
      // Применяем скорость
      if (preset.speed && window.components?.speed) {
        window.components.speed.setSpeed(preset.speed)
        await this.sendUpdate({ speed: preset.speed })
      }

      // Применяем направление
      if (preset.direction) {
        setDirection(preset.direction)
      }

      // Применяем цвета
      if (preset.colorBall) {
        setBallColor(preset.colorBall)
      }
      if (preset.colorBg) {
        setBackgroundColor(preset.colorBg)
      }

      // Применяем размер
      if (preset.size) {
        setBallSize(preset.size)
      }

      // Показываем уведомление
      this.showNotification(`Пресет "${Object.keys(this.presets).find(key => this.presets[key] === preset)}" применён`, 'success')
    } catch (error) {
      this.showNotification('Ошибка применения пресета', 'error')
    }
  }

  /**
   * Сохраняет текущее состояние как кастомный пресет
   */
  createCustomPreset() {
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

  savePresets() {
    try {
      localStorage.setItem('bb_presets', JSON.stringify(this.presets))
    } catch (error) {
      console.warn('Не удалось сохранить пресеты')
    }
  }

  /**
   * Управление экспортом/импортом сессий
   */
  addSessionExportImport() {
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
  exportSession() {
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
    const dataBlob = new Blob([dataStr], {type: 'application/json'})
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
  async importSession(file) {
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
          setDirection(settings.direction)
        }

        // Применяем цвета
        if (settings.ballColor) {
          setBallColor(settings.ballColor)
        }
        if (settings.bgColor) {
          setBackgroundColor(settings.bgColor)
        }

        // Применяем размер
        if (settings.ballSize) {
          setBallSize(settings.ballSize)
        }

        // Применяем состояние игры
        if (settings.isPlaying && !window.isPlaying) {
          togglePlayPause()
        } else if (!settings.isPlaying && window.isPlaying) {
          togglePlayPause()
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
  addKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Игнорируем если фокус в input
      if (e.target.tagName === 'INPUT') return

      // Ctrl+Z - отменить последнее изменение
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        this.undoLastChange()
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
  handleArrowKeys(key) {
    const directionMap = {
      'ArrowUp': 'vertical',
      'ArrowDown': 'vertical',
      'ArrowLeft': 'horizontal',
      'ArrowRight': 'horizontal'
    }
    setDirection(directionMap[key])
  }

  /**
   * Отмена последнего изменения
   */
  undoLastChange() {
    if (this.sessionHistory.length < 2) {
      this.showNotification('Нет изменений для отмены', 'warning')
      return
    }

    const lastState = this.sessionHistory.pop()
    const previousState = this.sessionHistory[this.sessionHistory.length - 1]

    this.applyState(previousState)
    this.showNotification('Изменение отменено', 'success')
  }

  /**
   * Применяет сохраненное состояние
   */
  async applyState(state) {
    if (state.speed && window.components?.speed) {
      window.components.speed.setSpeed(state.speed)
      await this.sendUpdate({ speed: state.speed })
    }

    if (state.direction) {
      setDirection(state.direction)
    }

    if (state.ballColor) {
      setBallColor(state.ballColor)
    }

    if (state.bgColor) {
      setBackgroundColor(state.bgColor)
    }

    if (state.ballSize) {
      setBallSize(state.ballSize)
    }
  }

  /**
   * Переключатель темы
   */
  addThemeToggle() {
    const toggleBtn = document.getElementById('themeToggle')
    if (!toggleBtn) return

    toggleBtn.addEventListener('click', () => this.toggleTheme())
    this.loadTheme()
  }

  toggleTheme() {
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

  loadTheme() {
    const savedTheme = localStorage.getItem('bb_theme') || 'dark'
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme')
    }
  }

  /**
   * Утилиты
   */
  async sendUpdate(data) {
    if (window.wsClient && window.wsClient.send) {
      window.wsClient.send('WS_MSG.controllerUpdate', data)
    }
  }

  showNotification(message, type = 'info') {
    // Используем существующую систему уведомлений
    if (window.showErrorNotification) {
      const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
      }
      window.showErrorNotification(message, colors[type])
    }
  }
}

// Экспортируем функции для глобального использования
window.applyPreset = (preset) => window.featureManager?.applyPreset(preset)
window.createCustomPreset = () => window.featureManager?.createCustomPreset()
window.exportSession = () => window.featureManager?.exportSession()
window.importSession = () => window.featureManager?.importSession(file)

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  window.featureManager = new FeatureManager()
})
