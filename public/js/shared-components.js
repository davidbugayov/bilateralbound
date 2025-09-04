/**
 * SharedComponents - переиспользуемые компоненты для BilateralBound
 * Содержит общую логику для controller и viewer
 */

class SharedComponents {
  constructor () {
    this.components = new Map()
    this.eventListeners = new Map()
  }

  /**
     * Создает переиспользуемый компонент управления направлением
     */
  createDirectionControls (container, options = {}) {
    const defaultOptions = {
      onDirectionChange: null,
      showLabels: true,
      style: 'grid', // 'grid' или 'horizontal'
      ...options
    }

    const component = {
      container,
      options: defaultOptions,
      currentDirection: { x: 0, y: 0 },
      buttons: new Map(),

      // Создает HTML для контролов
      render () {
        const directionControls = document.createElement('div')
        directionControls.className = 'direction-controls'

        if (defaultOptions.style === 'grid') {
          directionControls.innerHTML = `
                        <div class="direction-grid">
                            <button class="direction-btn" data-direction="up" title="Вверх">⬆️</button>
                            <button class="direction-btn" data-direction="left" title="Влево">⬅️</button>
                            <button class="direction-btn" data-direction="center" title="Стоп">⏹️</button>
                            <button class="direction-btn" data-direction="right" title="Вправо">➡️</button>
                            <button class="direction-btn" data-direction="down" title="Вниз">⬇️</button>
                        </div>
                    `
        } else {
          directionControls.innerHTML = `
                        <div class="direction-horizontal">
                            <button class="direction-btn" data-direction="left" title="Влево">⬅️</button>
                            <button class="direction-btn" data-direction="center" title="Стоп">⏹️</button>
                            <button class="direction-btn" data-direction="right" title="Вправо">➡️</button>
                        </div>
                    `
        }

        container.appendChild(directionControls)
        this.setupEventListeners()
        return this
      },

      // Настраивает обработчики событий
      setupEventListeners () {
        const buttons = container.querySelectorAll('.direction-btn')
        buttons.forEach(button => {
          const direction = button.dataset.direction
          this.buttons.set(direction, button)

          button.addEventListener('click', () => {
            this.setDirection(direction)
          })
        })
      },

      // Устанавливает направление
      setDirection (direction) {
        const directionMap = {
          up: { x: 0, y: -1 },
          down: { x: 0, y: 1 },
          left: { x: -1, y: 0 },
          right: { x: 1, y: 0 },
          center: { x: 0, y: 0 }
        }

        this.currentDirection = directionMap[direction] || { x: 0, y: 0 }

        // Обновляем активную кнопку
        this.buttons.forEach((btn, dir) => {
          btn.classList.toggle('active', dir === direction)
        })

        // Вызываем callback
        if (this.options.onDirectionChange) {
          this.options.onDirectionChange(this.currentDirection)
        }
      },

      // Получает текущее направление
      getDirection () {
        return { ...this.currentDirection }
      },

      // Сбрасывает направление
      reset () {
        this.setDirection('center')
      }
    }

    return component.render()
  }

  /**
     * Создает переиспользуемый компонент управления скоростью
     */
  createSpeedControl (container, options = {}) {
    const defaultOptions = {
      min: 0,
      max: 100,
      defaultValue: 40,
      onSpeedChange: null,
      showValue: true,
      showLabels: true,
      ...options
    }

    const component = {
      container,
      options: defaultOptions,
      currentSpeed: defaultOptions.defaultValue,
      elements: {},

      // Создает HTML для контроля скорости
      render () {
        const speedControl = document.createElement('div')
        speedControl.className = 'speed-control'

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

        container.appendChild(speedControl)
        this.setupElements()
        this.setupEventListeners()
        return this
      },

      // Настраивает ссылки на элементы
      setupElements () {
        this.elements.range = container.querySelector('.speed-range')
        this.elements.value = container.querySelector('.speed-value')
        this.elements.display = container.querySelector('.speed-display')
        this.elements.fill = container.querySelector('.speed-fill')
        this.elements.presets = container.querySelectorAll('.speed-preset')
        this.elements.unit = container.querySelector('.speed-unit')
      },

      // Настраивает обработчики событий
      setupEventListeners () {
        if (this.elements.range) {
          this.elements.range.addEventListener('input', (e) => {
            this.setSpeed(parseInt(e.target.value))
          })
        }

        // Обработчики для пресетов скорости
        if (this.elements.presets) {
          this.elements.presets.forEach(preset => {
            preset.addEventListener('click', (e) => {
              const speed = parseInt(preset.dataset.speed)
              this.setSpeed(speed)
              this.updateActivePreset(speed)
            })
          })
        }
      },

      // Обновляет активный пресет
      updateActivePreset (speed) {
        if (!this.elements.presets) return

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
      setSpeed (speed) {
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
      getSpeed () {
        return this.currentSpeed
      },

      // Сбрасывает скорость
      reset () {
        this.setSpeed(this.options.defaultValue)
      }
    }

    return component.render()
  }

  /**
     * Создает переиспользуемый компонент управления цветом
     */
  createColorControl (container, options = {}) {
    const defaultOptions = {
      colors: ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
      onColorChange: null,
      title: '🎨 Цвет',
      ...options
    }

    const component = {
      container,
      options: defaultOptions,
      currentColor: defaultOptions.colors[0],
      elements: {},

      // Создает HTML для контроля цвета
      render () {
        const colorControl = document.createElement('div')
        colorControl.className = 'color-control'

        colorControl.innerHTML = `
                    <h3>${defaultOptions.title}</h3>
                    <div class="color-palette">
                        ${defaultOptions.colors.map(color => `
                            <button class="color-btn" 
                                    data-color="${color}" 
                                    style="background-color: ${color}"
                                    title="${color}">
                            </button>
                        `).join('')}
                    </div>
                `

        container.appendChild(colorControl)
        this.setupEventListeners()
        return this
      },

      // Настраивает обработчики событий
      setupEventListeners () {
        const buttons = container.querySelectorAll('.color-btn')
        buttons.forEach(button => {
          button.addEventListener('click', () => {
            const color = button.dataset.color
            this.setColor(color)
          })
        })
      },

      // Устанавливает цвет
      setColor (color) {
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
      getColor () {
        return this.currentColor
      }
    }

    return component.render()
  }

  /**
     * Создает переиспользуемый компонент управления размером
     */
  createSizeControl (container, options = {}) {
    const defaultOptions = {
      sizes: [20, 30, 40, 50, 60],
      defaultValue: 40,
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
      render () {
        const sizeControl = document.createElement('div')
        sizeControl.className = 'size-control'

        sizeControl.innerHTML = `
                    <h3>${defaultOptions.title}</h3>
                    <div class="size-palette">
                        ${defaultOptions.sizes.map(size => `
                            <button class="size-btn" 
                                    data-size="${size}"
                                    title="${size}px">
                                ${size}
                            </button>
                        `).join('')}
                    </div>
                `

        container.appendChild(sizeControl)
        this.setupEventListeners()
        return this
      },

      // Настраивает обработчики событий
      setupEventListeners () {
        const buttons = container.querySelectorAll('.size-btn')
        buttons.forEach(button => {
          button.addEventListener('click', () => {
            const size = parseInt(button.dataset.size)
            this.setSize(size)
          })
        })
      },

      // Устанавливает размер
      setSize (size) {
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
      getSize () {
        return this.currentSize
      }
    }

    return component.render()
  }

  /**
     * Создает переиспользуемый компонент статуса
     */
  createStatusIndicator (container, options = {}) {
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
      render () {
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
      setupElements () {
        this.elements.container = container.querySelector('.status-indicator')
        this.elements.icon = container.querySelector('.status-icon')
        this.elements.text = container.querySelector('.status-text')
      },

      // Устанавливает статус
      setStatus (status, message = '', type = 'info') {
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
      show () {
        this.elements.container.style.display = 'block'
      },

      // Скрывает индикатор
      hide () {
        this.elements.container.style.display = 'none'
      },

      // Получает текущий статус
      getStatus () {
        return this.currentStatus
      }
    }

    return component.render()
  }

  /**
     * Создает переиспользуемый компонент canvas с превью
     */
  createCanvasPreview (container, options = {}) {
    const defaultOptions = {
      width: 400,
      height: 300,
      backgroundColor: '#020617',
      showInfo: true,
      draggable: false,
      ...options
    }

    const component = {
      container,
      options: defaultOptions,
      canvas: null,
      ctx: null,
      physicsEngine: null,
      renderer: null,
      elements: {},

      // Создает HTML для canvas превью
      render () {
        const previewContainer = document.createElement('div')
        previewContainer.className = 'canvas-preview'

        previewContainer.innerHTML = `
                    ${defaultOptions.draggable ? '<div class="drag-handle">📱 Перетащите</div>' : ''}
                    <canvas width="${defaultOptions.width}" height="${defaultOptions.height}"></canvas>
                    ${defaultOptions.showInfo ? '<div class="preview-info">Превью</div>' : ''}
                `

        container.appendChild(previewContainer)
        this.setupCanvas()
        this.setupElements()
        return this
      },

      // Настраивает canvas
      setupCanvas () {
        this.canvas = container.querySelector('canvas')
        this.ctx = this.canvas.getContext('2d')

        // Создаем движок физики и рендерер
        this.physicsEngine = moduleFactory.createPhysicsEngine({
          worldWidth: this.options.width,
          worldHeight: this.options.height,
          colors: {
            bg: this.options.backgroundColor
          }
        })

        this.renderer = moduleFactory.createRenderer(this.canvas, this.physicsEngine)
      },

      // Настраивает ссылки на элементы
      setupElements () {
        this.elements.container = container.querySelector('.canvas-preview')
        this.elements.canvas = this.canvas
        this.elements.info = container.querySelector('.preview-info')
      },

      // Запускает рендеринг
      start () {
        if (this.renderer) {
          this.renderer.start()
        }
      },

      // Останавливает рендеринг
      stop () {
        if (this.renderer) {
          this.renderer.stop()
        }
      },

      // Синхронизирует с сервером
      syncFromServer (state) {
        if (this.physicsEngine) {
          this.physicsEngine.syncFromServer(state)
        }
      },

      // Изменяет размеры
      resize (width, height) {
        this.options.width = width
        this.options.height = height

        if (this.canvas) {
          this.canvas.width = width
          this.canvas.height = height
        }

        if (this.physicsEngine) {
          this.physicsEngine.setWorldSize(width, height)
        }

        if (this.renderer) {
          this.renderer.resize(width, height)
        }
      },

      // Получает canvas элемент
      getCanvas () {
        return this.canvas
      },

      // Получает движок физики
      getPhysicsEngine () {
        return this.physicsEngine
      },

      // Получает рендерер
      getRenderer () {
        return this.renderer
      }
    }

    return component.render()
  }

  /**
     * Создает переиспользуемый компонент мобильных контролов
     */
  createMobileControls (container, options = {}) {
    const defaultOptions = {
      onDirectionChange: null,
      onSpeedChange: null,
      showSpeedControl: true,
      ...options
    }

    const component = {
      container,
      options: defaultOptions,
      elements: {},

      // Создает HTML для мобильных контролов
      render () {
        const mobileControls = document.createElement('div')
        mobileControls.className = 'mobile-controls'

        mobileControls.innerHTML = `
                    <div class="mobile-direction-pad">
                        <button class="mobile-btn up" data-direction="up">⬆️</button>
                        <button class="mobile-btn left" data-direction="left">⬅️</button>
                        <button class="mobile-btn center" data-direction="center">⏹️</button>
                        <button class="mobile-btn right" data-direction="right">➡️</button>
                        <button class="mobile-btn down" data-direction="down">⬇️</button>
                    </div>
                    ${defaultOptions.showSpeedControl
    ? `
                        <div class="mobile-speed-control">
                            <input type="range" class="mobile-speed-range" min="0" max="100" value="40">
                            <span class="mobile-speed-value">40</span>
                        </div>
                    `
    : ''}
                `

        container.appendChild(mobileControls)
        this.setupElements()
        this.setupEventListeners()
        return this
      },

      // Настраивает ссылки на элементы
      setupElements () {
        this.elements.container = container.querySelector('.mobile-controls')
        this.elements.directionPad = container.querySelector('.mobile-direction-pad')
        this.elements.speedRange = container.querySelector('.mobile-speed-range')
        this.elements.speedValue = container.querySelector('.mobile-speed-value')
      },

      // Настраивает обработчики событий
      setupEventListeners () {
        // Направление
        const directionButtons = container.querySelectorAll('.mobile-btn')
        directionButtons.forEach(button => {
          button.addEventListener('click', () => {
            const direction = button.dataset.direction
            this.handleDirectionChange(direction)
          })
        })

        // Скорость
        if (this.elements.speedRange) {
          this.elements.speedRange.addEventListener('input', (e) => {
            const speed = parseInt(e.target.value)
            this.handleSpeedChange(speed)
          })
        }
      },

      // Обрабатывает изменение направления
      handleDirectionChange (direction) {
        const directionMap = {
          up: { x: 0, y: -1 },
          down: { x: 0, y: 1 },
          left: { x: -1, y: 0 },
          right: { x: 1, y: 0 },
          center: { x: 0, y: 0 }
        }

        const newDirection = directionMap[direction] || { x: 0, y: 0 }

        if (this.options.onDirectionChange) {
          this.options.onDirectionChange(newDirection)
        }
      },

      // Обрабатывает изменение скорости
      handleSpeedChange (speed) {
        if (this.elements.speedValue) {
          this.elements.speedValue.textContent = speed
        }

        if (this.options.onSpeedChange) {
          this.options.onSpeedChange(speed)
        }
      },

      // Показывает мобильные контролы
      show () {
        this.elements.container.style.display = 'block'
      },

      // Скрывает мобильные контролы
      hide () {
        this.elements.container.style.display = 'none'
      }
    }

    return component.render()
  }
}

// Создаем глобальный экземпляр
const sharedComponents = new SharedComponents()

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.SharedComponents = SharedComponents
  window.sharedComponents = sharedComponents
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SharedComponents, sharedComponents }
}
