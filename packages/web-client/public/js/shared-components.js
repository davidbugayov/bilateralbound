'use strict'
/**
 * SharedComponents - переиспользуемые компоненты для BilateralBound
 * Содержит общую логику для controller и viewer
 */
/**
 * @typedef {Object} StatusIndicatorComponent
 * @property {function(string, string): void} setStatus - Устанавливает статус индикатора
 */
if (typeof SharedComponents === 'undefined') {
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
        max: 60, // Новое максимальное значение - быстрая скорость, но отслеживаемая глазами
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
    <input type="range"
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
    <div class="speed-track">
    <input type="range"
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
              this.setSpeed(Number.parseInt(e.target.value, 10));
            });
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
            `.speed-preset.${activePreset}`,
          );
          if (activeElement) {
            activeElement.classList.add('active')
          }
        },
        setSpeed(speed) {
          this.currentSpeed = Math.max(
            this.options.min,
            Math.min(this.options.max, speed),
          );
          if (this.elements.range) {
            this.elements.range.value = this.currentSpeed
          }
          let speedCategory = ''
          let speedColor = ''
          const t = (key) => globalThis.i18n?.t(key) || key;
          if (this.currentSpeed <= 15) {
            speedCategory = t('controller.speedVerySlow')
            speedColor = '#22c55e'
          } else if (this.currentSpeed <= 25) {
            speedCategory = t('controller.speedSlow')
            speedColor = '#3b82f6'
          } else if (this.currentSpeed <= 35) {
            speedCategory = t('controller.speedMedium')
            speedColor = '#8b5cf6'
          } else if (this.currentSpeed <= 50) {
            speedCategory = t('controller.speedFast')
            speedColor = '#f59e0b'
          } else {
            speedCategory = t('controller.speedVeryFast')
            speedColor = '#ef4444'
          }
          if (this.elements.value) {
            this.elements.value.textContent = speedCategory
            this.elements.value.style.color = speedColor
          }
          if (this.elements.fill) {
            this.elements.fill.style.width = `${this.currentSpeed}%`
            let fillColor = ''
            if (this.currentSpeed <= 15) {
              fillColor = '#22c55e'
            } else if (this.currentSpeed <= 25) {
              fillColor = '#3b82f6'
            } else if (this.currentSpeed <= 35) {
              fillColor = '#8b5cf6'
            } else if (this.currentSpeed <= 50) {
              fillColor = '#f59e0b'
            } else {
              fillColor = '#ef4444'
            }
            this.elements.fill.style.background = fillColor
          }
          this.updateActivePreset(this.currentSpeed)
          if (this.options.onSpeedChange) {
            this.options.onSpeedChange(this.currentSpeed)
          }
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
        component.setSpeed(component.currentSpeed)
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
          '#ec4899',
        ],
        defaultValue: null, // Будет установлен в colors[0] если не указан
        onColorChange: null,
        title: '🎨 Цвет',
        ...options,
      };
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
    title="${color}">
    </button>
    `,
      )
      .join('')}
    </div>
    `;
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
    title="${size}px">
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
              Number.parseInt(btn.dataset.size, 10) === size,
            );
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
     * @returns {StatusIndicatorComponent} Объект компонента с методом setStatus
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
          this.elements.container =
            container.querySelector('.status-indicator');
          this.elements.icon = container.querySelector('.status-icon')
          this.elements.text = container.querySelector('.status-text')
        },
        /**
         * Устанавливает статус индикатора
         * @param {string} status - Тип статуса ('success', 'error', 'warning', 'loading', 'waiting', 'idle')
         * @param {string} message - Текстовое сообщение статуса
         */
        setStatus(status, message) {
          this.currentStatus = status
          if (this.elements.text) {
            this.elements.text.textContent = message
          }
          if (this.elements.icon) {
            switch (status) {
              case 'success':
                this.elements.icon.textContent = '✅'
                break
              case 'error':
                this.elements.icon.textContent = '❌'
                break
              case 'warning':
                this.elements.icon.textContent = '⚠️'
                break
              case 'loading':
                this.elements.icon.textContent = '⏳'
                break
              case 'waiting':
                this.elements.icon.textContent = '⏳'
                break
              default:
                this.elements.icon.textContent = '⏳'
            }
          }
          if (this.elements.container) {
            this.elements.container.classList.remove(
              'status-success',
              'status-error',
              'status-warning',
              'status-loading',
              'status-waiting',
              'status-idle',
            );
            this.elements.container.classList.add(`status-${status}`)
          }
          if (this.options.autoHide && status === 'success') {
            setTimeout(() => {
              if (this.elements.container) {
                this.elements.container.style.display = 'none'
              }
            }, this.options.hideDelay)
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
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SharedComponents, sharedComponents }
  }
}
