/* jshint esversion: 11, -W033, -W104, -W119 */
/* global globalThis, Map, module */
'use strict'
/**
 * SharedComponents - переиспользуемые компоненты для BilateralBound
 * Содержит общую логику для controller и viewer
 */

class SharedComponents {
  constructor() {
    this.components = new Map()
  }
  /**
   * Создает переиспользуемый компонент управления скоростью
   */
  createSpeedControl(container, options = {}) {
    const defaultOptions = {
      min: 5, // Новое минимальное значение - медленная скорость
      max: 100, // Максимальное значение - быстрая скорость
      defaultValue: 30, // Установлено значение "Средне" (30)
      onSpeedChange: null,
      showValue: true,
      showLabels: true,
      simple: true,
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentSpeed: defaultOptions.defaultValue,
      elements: {},
      render() {
        const speedControl = document.createElement('div')
        speedControl.className = 'speed-control'
        if (defaultOptions.simple) {
          speedControl.innerHTML = `
  <div class="speed-info">
  ${defaultOptions.showValue ? `<div class="speed-display"><span class="speed-value">${globalThis.i18n?.t('controller.speedMedium') || 'Medium'}</span></div>` : ''}
  </div>
  <div class="speed-slider-container">
  <label for="speedRange" class="sr-only" data-i18n="controller.speedTitle">Speed</label>
  <input type="range"
  id="speedRange"
  class="speed-range"
  min="${defaultOptions.min}"
  max="${defaultOptions.max}"
  value="${defaultOptions.currentSpeed}"
  step="1">
  </div>
  `
        } else {
          speedControl.innerHTML = `
  <div class="speed-header">
  <div class="speed-icon">⚡</div>
  <div class="speed-info">
  ${defaultOptions.showValue ? `<div class="speed-display"><span class="speed-value">${globalThis.i18n?.t('controller.speedMedium') || 'Medium'}</span></div>` : ''}
  </div>
  <div class="speed-indicator">
  <div class="speed-bar">
  <div class="speed-fill" style="width: 40%"></div>
  </div>
  </div>
  </div>
  <div class="speed-controls">
  <div class="speed-presets">
  <button class="speed-preset slow" data-speed="20">🐌<span>${globalThis.i18n?.t('controller.speedSlow') || 'Slow'}</span></button>
  <button class="speed-preset normal active" data-speed="40">⚡<span>${globalThis.i18n?.t('controller.speedMedium') || 'Medium'}</span></button>
  <button class="speed-preset fast" data-speed="80">🚀<span>${globalThis.i18n?.t('controller.speedFast') || 'Fast'}</span></button>
  </div>
  <div class="speed-slider-container">
  <label for="speedRange" class="sr-only" data-i18n="controller.speedTitle">Speed</label>
  <div class="speed-track">
  <input type="range"
  id="speedRange"
  class="speed-range"
  min="${defaultOptions.min}"
  max="${defaultOptions.max}"
  value="${defaultOptions.currentSpeed}"
  step="1">
  <div class="speed-marks">
  <span class="mark" style="left: 0">0</span>
  <span class="mark" style="left: 25%">25</span>
  <span class="mark" style="left: 50%">50</span>
  <span class="mark" style="left: 75%">75</span>
  <span class="mark" style="left: 100%">100</span>
  </div>
  </div>
  </div>
  </div>
  `
        }
        container.appendChild(speedControl)
        this.setupElements()
        this.setupEventListeners()
        return this
      },
      setupElements() {
        this.elements.range = container.querySelector('.speed-range')
        this.elements.value = container.querySelector('.speed-value')
        this.elements.display = container.querySelector('.speed-display')
        this.elements.fill = container.querySelector('.speed-fill')
        this.elements.presets = container.querySelectorAll('.speed-preset')
      },
      setupEventListeners() {
        if (this.elements.range) {
          this.elements.range.addEventListener('input', (e) => {
            this.setSpeed(Number.parseInt(e.target.value, 10))
          })
        }
        if (this.elements?.presets?.length) {
          for (const preset of this.elements.presets) {
            preset.addEventListener('click', () => {
              const speed = Number.parseInt(preset.dataset.speed, 10)
              this.setSpeed(speed)
              this.updateActivePreset(speed)
            })
          }
        }
      },
      updateActivePreset(speed) {
        if (this.elements?.presets?.length === 0) {
          return
        }
        for (const preset of this.elements.presets) {
          preset.classList.remove('active')
        }
        let activePreset = null
        if (speed <= 30) {
          activePreset = 'slow'
        } else if (speed <= 60) {
          activePreset = 'normal'
        } else {
          activePreset = 'fast'
        }
        const activeElement = container.querySelector(
          `.speed-preset.${activePreset}`
        )
        if (activeElement) {
          activeElement.classList.add('active')
        }
      },
      setSpeed(speed, silent = false) {
        this.currentSpeed = Math.max(
          this.options.min,
          Math.min(this.options.max, speed)
        )
        if (this.elements.range) {
          this.elements.range.value = this.currentSpeed
        }
        // Get speed category and color based on current speed
        const { category, color } = this._getSpeedCategoryAndColor(
          this.currentSpeed
        )
        if (this.elements.value) {
          this.elements.value.textContent = category
          this.elements.value.style.color = color
        }
        if (this.elements.fill) {
          this.elements.fill.style.width = `${this.currentSpeed}%`
          this.elements.fill.style.background = color
        }
        this.updateActivePreset(this.currentSpeed)
        if (!silent && this.options.onSpeedChange) {
          this.options.onSpeedChange(this.currentSpeed)
        }
      },
      _getSpeedCategoryAndColor(speed) {
        const t = (key) => globalThis.i18n?.t(key) || key
        if (speed <= 15) {
          return { category: t('controller.speedVerySlow'), color: '#22c55e' }
        }
        if (speed <= 25) {
          return { category: t('controller.speedSlow'), color: '#3b82f6' }
        }
        if (speed <= 35) {
          return { category: t('controller.speedMedium'), color: '#8b5cf6' }
        }
        if (speed <= 50) {
          return { category: t('controller.speedFast'), color: '#f59e0b' }
        }
        return { category: t('controller.speedVeryFast'), color: '#ef4444' }
      },
      getSpeed() {
        return this.currentSpeed
      },
      reset() {
        this.setSpeed(this.options.defaultValue)
      }
    }
    component.render()
    // Refresh speed label on language change
    globalThis.addEventListener('i18nLanguageChanged', () => {
      component.setSpeed(component.currentSpeed, true)
    })
    return component
  }
  /**
   * Создает переиспользуемый компонент управления цветом
   */
  createColorControl(container, options = {}) {
    const defaultOptions = {
      colors: [
        '#60a5fa',
        '#ef4444',
        '#10b981',
        '#f59e0b',
        '#8b5cf6',
        '#ec4899'
      ],
      defaultValue: null, // Будет установлен в colors[0] если не указан
      onColorChange: null,
      title: '🎨 Цвет',
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentColor: defaultOptions.defaultValue || defaultOptions.colors[0],
      elements: {},
      render() {
        const colorControl = document.createElement('div')
        colorControl.className = 'color-control'
        colorControl.innerHTML = `
  <h3>${defaultOptions.title}</h3>
  <div class="color-palette">
  ${defaultOptions.colors
    .map(
      (color) => `
  <button class="color-btn"
  data-color="${color}"
  style="background-color: ${color}"
  title="${color}"
  aria-label="Color: ${color}">
  </button>
  `
    )
    .join('')}
  </div>
  `
        container.appendChild(colorControl)
        this.setupEventListeners()
        this.setColor(this.currentColor)
        return this
      },
      setupEventListeners() {
        const buttons = container.querySelectorAll('.color-btn')
        for (const button of buttons) {
          button.addEventListener('click', () => {
            const color = button.dataset.color
            this.setColor(color)
          })
        }
      },
      setColor(color) {
        this.currentColor = color
        const buttons = container.querySelectorAll('.color-btn')
        for (const btn of buttons) {
          btn.classList.toggle('active', btn.dataset.color === color)
        }
        this.options.onColorChange?.(color)
      }
    }
    return component.render()
  }
  /**
   * Создает переиспользуемый компонент управления размером
   */
  createSizeControl(container, options = {}) {
    const defaultOptions = {
      sizes: [20, 40, 80, 100],
      defaultValue: 20,
      onSizeChange: null,
      title: '📏 Размер',
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentSize: defaultOptions.defaultValue,
      elements: {},
      render() {
        const sizeControl = document.createElement('div')
        sizeControl.className = 'size-control'
        sizeControl.innerHTML = `
  <h3>${defaultOptions.title}</h3>
  <div class="size-palette">
  ${defaultOptions.sizes
    .map(
      (size, index) => `
  <button class="size-btn"
  data-size="${size}"
  title="${size}px"
  aria-label="Size: x${index + 1} (${size}px)">
  x${index + 1}
  </button>
  `
    )
    .join('')}
  </div>
  `
        container.appendChild(sizeControl)
        this.setupEventListeners()
        this.setSize(this.currentSize)
        return this
      },
      setupEventListeners() {
        const buttons = container.querySelectorAll('.size-btn')
        for (const button of buttons) {
          button.addEventListener('click', () => {
            const size = Number.parseInt(button.dataset.size, 10)
            this.setSize(size)
          })
        }
      },
      setSize(size) {
        this.currentSize = size
        const buttons = container.querySelectorAll('.size-btn')
        for (const btn of buttons) {
          btn.classList.toggle(
            'active',
            Number.parseInt(btn.dataset.size, 10) === size
          )
        }
        this.options.onSizeChange?.(size)
      }
    }
    return component.render()
  }
  /**
   * Создает переиспользуемый компонент статуса
   * @param {HTMLElement} container - Контейнер для компонента
   * @param {Object} options - Опции компонента
   * @returns {StatusIndicatorComponent} Объект компонента
   */
  createStatusIndicator(container, options = {}) {
    const defaultOptions = {
      title: 'Статус',
      showIcon: true,
      autoHide: false,
      hideDelay: 3000,
      ...options
    }
    const component = {
      container,
      options: defaultOptions,
      currentStatus: 'idle',
      elements: {},
      render() {
        const statusIndicator = document.createElement('div')
        statusIndicator.className = 'status-indicator'
        statusIndicator.innerHTML = `
  <div class="status-content">
  ${defaultOptions.showIcon ? '<span class="status-icon">⏳</span>' : ''}
  <span class="status-text">${defaultOptions.title}</span>
  </div>
  `
        container.appendChild(statusIndicator)
        this.setupElements()
        return this
      },
      setupElements() {
        this.elements.container = container.querySelector('.status-indicator')
        this.elements.icon = container.querySelector('.status-icon')
        this.elements.text = container.querySelector('.status-text')
      },
      setStatus(status, message) {
        this.currentStatus = status
        if (this.elements.text) {
          this.elements.text.textContent = message || ''
        }
        if (this.elements.icon) {
          const icons = {
            success: '✅',
            warning: '⚠️',
            error: '❌',
            waiting: '⏳',
            idle: '⏳'
          }
          this.elements.icon.textContent = icons[status] || '⏳'
        }
        if (this.elements.container) {
          this.elements.container.className =
            'status-indicator status-' + status
        }
      }
    }
    return component.render()
  }
}
const sharedComponents = new SharedComponents()
if (typeof globalThis !== 'undefined') {
  globalThis.SharedComponents = SharedComponents
  globalThis.sharedComponents = sharedComponents
}

module.exports = { SharedComponents, sharedComponents }
