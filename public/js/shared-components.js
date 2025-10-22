'use strict'
/**
 * SharedComponents - переиспользуемые компоненты для BilateralBound
 * Содержит общую логику для controller и viewer
 */
class SharedComponents {
  constructor() {
    this.components = new Map()
    this.eventListeners = new Map()
  }
  /**
   * Создает переиспользуемый компонент управления скоростью
   */
  createSpeedControl(container, options = {}) {
    const defaultOptions = {
      min: 0,
      max: 100,
      defaultValue: 40,
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
      // Создает HTML для контроля скорости
      render() {
        const speedControl = document.createElement('div')
        speedControl.className = 'speed-control'
        if (defaultOptions.simple) {
          speedControl.innerHTML = `
    <div class="speed-info">
    <h3>Скорость</h3>
    ${defaultOptions.showValue ? '<div class="speed-display"><span class="speed-value">40</span><span class="speed-unit">%</span></div>' : ''}
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
    <h3>Скорость движения</h3>
    ${defaultOptions.showValue ? '<div class="speed-display"><span class="speed-value">40</span><span class="speed-unit">%</span></div>' : ''}
    </div>
    <div class="speed-indicator">
    <div class="speed-bar">
    <div class="speed-fill" style="width: 40%"></div>
    </div>
    </div>
    </div>
    <div class="speed-controls">
    <div class="speed-presets">
    <button class="speed-preset slow" data-speed="20">🐌<span>Медленно</span></button>
    <button class="speed-preset normal active" data-speed="40">⚡<span>Нормально</span></button>
    <button class="speed-preset fast" data-speed="80">🚀<span>Быстро</span></button>
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
    <span class="mark" style="left: 0%">0</span>
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
      // Настраивает ссылки на элементы
      setupElements() {
        this.elements.range = container.querySelector('.speed-range')
        this.elements.value = container.querySelector('.speed-value')
        this.elements.display = container.querySelector('.speed-display')
        this.elements.fill = container.querySelector('.speed-fill')
        this.elements.presets = container.querySelectorAll('.speed-preset')
        this.elements.unit = container.querySelector('.speed-unit')
      },
      // Настраивает обработчики событий
      setupEventListeners() {
        if (this.elements.range) {
          this.elements.range.addEventListener('input', e => {
            this.setSpeed(parseInt(e.target.value))
          })
        }
        // Обработчики для пресетов скорости (в простом режиме отсутствуют)
        if (this.elements.presets && this.elements.presets.length) {
          this.elements.presets.forEach(preset => {
            preset.addEventListener('click', () => {
              const speed = parseInt(preset.dataset.speed)
              this.setSpeed(speed)
              this.updateActivePreset(speed)
            })
          })
        }
      },
      // Обновляет активный пресет
      updateActivePreset(speed) {
        if (!this.elements.presets || !this.elements.presets.length) return
        // Снимаем активное состояние со всех
        this.elements.presets.forEach(preset => {
          preset.classList.remove('active')
        })
        // Определяем активный пресет на основе скорости
        let activePreset = null
        if (speed <= 30) activePreset = 'slow'
        else if (speed <= 60) activePreset = 'normal'
        else activePreset = 'fast'
        // Устанавливаем активное состояние
        const activeElement = container.querySelector(`.speed-preset.${activePreset}`)
        if (activeElement) {
          activeElement.classList.add('active')
        }
      },
      // Устанавливает скорость
      setSpeed(speed) {
        this.currentSpeed = Math.max(this.options.min, Math.min(this.options.max, speed))
        if (this.elements.range) {
          this.elements.range.value = this.currentSpeed
        }

        if (this.elements.value) {
          this.elements.value.textContent = this.currentSpeed
        }
        // Обновляем индикатор заполнения
        if (this.elements.fill) {
          this.elements.fill.style.width = `${this.currentSpeed}%`
        }
        // Обновляем активный пресет
        this.updateActivePreset(this.currentSpeed)
        // Вызываем callback
        if (this.options.onSpeedChange) {
          this.options.onSpeedChange(this.currentSpeed)
        }
      },
      // Получает текущую скорость
      getSpeed() {
        return this.currentSpeed
      },
      // Сбрасывает скорость
      reset() {
        this.setSpeed(this.options.defaultValue)
      }
    }

    return component.render()
  }
  /**
   * Создает переиспользуемый компонент управления цветом
   */
  createColorControl(container, options = {}) {
    const defaultOptions = {
      colors: ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
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
      // Создает HTML для контроля цвета
      render() {
        const colorControl = document.createElement('div')
        colorControl.className = 'color-control'
        colorControl.innerHTML = `
    <h3>${defaultOptions.title}</h3>
    <div class="color-palette">
    ${defaultOptions.colors
      .map(
        color => `
    <button class="color-btn" 
    data-color="${color}" 
    style="background-color: ${color}"
    title="${color}">
    </button>
    `
      )
      .join('')}
    </div>
    `
        container.appendChild(colorControl)
        this.setupEventListeners()
        // Устанавливаем дефолтный цвет как активный
        this.setColor(this.currentColor)
        return this
      },
      // Настраивает обработчики событий
      setupEventListeners() {
        const buttons = container.querySelectorAll('.color-btn')
        buttons.forEach(button => {
          button.addEventListener('click', () => {
            const color = button.dataset.color
            this.setColor(color)
          })
        })
      },
      // Устанавливает цвет
      setColor(color) {
        this.currentColor = color
        // Обновляем активную кнопку
        const buttons = container.querySelectorAll('.color-btn')
        buttons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.color === color)
        })
        // Вызываем callback
        if (this.options.onColorChange) {
          this.options.onColorChange(color)
        }
      },
      // Получает текущий цвет
      getColor() {
        return this.currentColor
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
      // Создает HTML для контроля размера
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
        // Устанавливаем дефолтный размер как активный
        this.setSize(this.currentSize)
        return this
      },
      // Настраивает обработчики событий
      setupEventListeners() {
        const buttons = container.querySelectorAll('.size-btn')
        buttons.forEach(button => {
          button.addEventListener('click', () => {
            const size = parseInt(button.dataset.size)
            this.setSize(size)
          })
        })
      },
      // Устанавливает размер
      setSize(size) {
        this.currentSize = size
        // Обновляем активную кнопку
        const buttons = container.querySelectorAll('.size-btn')
        buttons.forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.size) === size)
        })
        // Вызываем callback
        if (this.options.onSizeChange) {
          this.options.onSizeChange(size)
        }
      },
      // Получает текущий размер
      getSize() {
        return this.currentSize
      }
    }

    return component.render()
  }
  /**
   * Создает переиспользуемый компонент статуса
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
      // Создает HTML для индикатора статуса
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
      // Настраивает ссылки на элементы
      setupElements() {
        this.elements.container = container.querySelector('.status-indicator')
        this.elements.icon = container.querySelector('.status-icon')
        this.elements.text = container.querySelector('.status-text')
      },
      // Устанавливает статус
      setStatus(status, message = '') {
        this.currentStatus = status
        const statusMap = {
          idle: { icon: '⏳', class: 'idle' },
          loading: { icon: '🔄', class: 'loading' },
          success: { icon: '✅', class: 'success' },
          error: { icon: '❌', class: 'error' },
          warning: { icon: '⚠️', class: 'warning' }
        }

        const statusInfo = statusMap[status] || statusMap.idle
        if (this.elements.icon) {
          this.elements.icon.textContent = statusInfo.icon
        }

        if (this.elements.text) {
          this.elements.text.textContent = message || status
        }
        // Обновляем CSS классы
        this.elements.container.className = `status-indicator ${statusInfo.class}`
        // Автоматически скрываем если включено
        if (this.options.autoHide && status !== 'loading') {
          setTimeout(() => {
            this.hide()
          }, this.options.hideDelay)
        }
      },
      // Показывает индикатор
      show() {
        this.elements.container.style.display = 'block'
      },
      // Скрывает индикатор
      hide() {
        this.elements.container.style.display = 'none'
      },
      // Получает текущий статус
      getStatus() {
        return this.currentStatus
      }
    }

    return component.render()
  }
}
// Создаем глобальный экземпляр
const sharedComponents = new SharedComponents()
// Экспортируем для использования
if (typeof globalThis !== 'undefined') {
  globalThis.SharedComponents = SharedComponents
  globalThis.sharedComponents = sharedComponents
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SharedComponents, sharedComponents }
}
