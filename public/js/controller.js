/**
 * Controller - Логика управления сессией BilateralBound
 * Современная модульная архитектура с улучшенной обработкой ошибок
 */

// 1. Глобальное состояние определяется в первую очередь, до загрузки DOM
window.__current = {
    sessionId: null,
    viewerConnected: false,
    viewerScreenSize: { width: 0, height: 0 }
};

// 2. Рендерер для превью
window.__previewRenderer = null;

// 3. Глобальные переменные для логики контроллера
let components = {};
let speedManager;
let directionState = { dx: 1, dy: 0 };
let isPlaying = false;
let currentDirectionMode = 'horizontal';
let wsClient;
let isInitialized = false; // Флаг для предотвращения повторной инициализации

// 4. Остальная логика выполняется после полной загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('%c[Controller] DOMContentLoaded: Инициализация страницы', 'color: #purple; font-weight: bold;');
    initializeController();
});

/**
 * Современная инициализация контроллера с улучшенной обработкой ошибок
 */
async function initializeController() {
    const logger = createLogger('Controller')

    try {
        logger.info('🚀 Начинаем инициализацию контроллера')

        // 1. Валидация и получение сессии
        const sessionId = getSessionIdFromUrl()
        if (!sessionId) {
            throw new AppError('SESSION_ID_MISSING', 'ID сессии не найден в URL')
        }

        window.__current.sessionId = sessionId
        logger.info(`📋 Работаем с сессией: ${sessionId}`)

        // 2. Инициализация DOM элементов - делаем это сразу
        await initializeDOMElements(sessionId)

        // Показываем блок превью сразу, но без запущенной анимации
        const previewWrap = document.getElementById('previewWrap');
        if (previewWrap) {
            previewWrap.style.display = 'block';
        }

        // Инициализируем компоненты сразу
        initializeComponents();

        // 3. Инициализация WebSocket с современным API
        await initializeWebSocketClient(sessionId)

        logger.info('🔌 WebSocket клиент инициализирован, ожидаем подключения вьювера...')

    } catch (error) {
        await handleInitializationError(error, logger)
    }
}

/**
 * Завершает инициализацию после подключения вьювера
 */
async function completeInitialization() {
    if (isInitialized) {
        return; // Уже инициализировано
    }
    isInitialized = true;

    const logger = createLogger('Controller');
    logger.success('✅ Вьювер подключен! Завершаем инициализацию...');
    
    try {
        // Раньше здесь был initializeDOMElements, теперь он вызывается сразу
        initializePreview();
        logger.success('🎉 Контроллер полностью готов к работе!');
    } catch (error) {
        await handleInitializationError(error, logger);
    }
}

/**
 * Современная инициализация DOM элементов
 */
async function initializeDOMElements(sessionId) {
    const elements = {
        curSid: 'curSid',
        view: 'view',
        sessionInfo: 'sessionInfo',
        viewerStatus: 'viewerStatus'
    }

    const missingElements = []
    const initializedElements = {}

    for (const [key, id] of Object.entries(elements)) {
        const element = document.getElementById(id)
        if (!element) {
            missingElements.push(id)
        } else {
            initializedElements[key] = element
        }
    }

    if (missingElements.length > 0) {
        throw new AppError('DOM_ELEMENTS_MISSING',
            `Не найдены HTML элементы: ${missingElements.join(', ')}`)
    }

    // Настройка элементов
    initializedElements.curSid.textContent = sessionId
    initializedElements.view.value = `${window.location.origin}/s/${sessionId}`
    initializedElements.sessionInfo.textContent = `Создана: ${new Date().toLocaleString()}`
    initializedElements.viewerStatus.textContent = 'Ожидание...'

    return initializedElements
}

/**
 * Современная инициализация WebSocket клиента
 */
async function initializeWebSocketClient(sessionId) {
    const logger = createLogger('WebSocket')

    // Создаем клиента с улучшенной конфигурацией
    wsClient = new WebSocketClient(sessionId, 'controller', {
        maxReconnectAttempts: 10,
        reconnectInterval: 2000,
        heartbeatInterval: 25000
    })

    // Настраиваем обработчики событий
    setupWebSocketEventHandlers(wsClient, logger)

    // Подключаемся с таймаутом
    await Promise.race([
        (async () => {
            try {
                await wsClient.connect();
            } catch (error) {
                // Пробрасываем ошибку, чтобы Promise.race ее поймал
                throw new Error(`WebSocket connection failed: ${error.message}`);
            }
        })(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('WebSocket connection timeout')), 15000)
        )
    ])

    logger.success('WebSocket клиент успешно инициализирован')
}

/**
 * Настройка обработчиков WebSocket событий
 */
function setupWebSocketEventHandlers(wsClient, logger) {
    wsClient.on('open', (data) => {
        logger.success('WebSocket соединение установлено')
        updateConnectionStatus(true)
    })

    wsClient.on('close', (event) => {
        logger.warning(`WebSocket соединение закрыто (код: ${event.code})`)
        updateConnectionStatus(false)
        window.__current.viewerConnected = false
        updateViewerStatusUI()
    })

    wsClient.on('error', (error) => {
        logger.error(`WebSocket ошибка: ${error.type}`, error)
        if (error.type === 'connection') {
            showErrorNotification('Потеряно соединение с сервером')
        }
    })

    wsClient.on('viewer_status', (data) => {
        logger.info('Получен статус viewer', data)
        window.__current.viewerConnected = data.connected
        if (data.screenSize) {
            window.__current.viewerScreenSize = data.screenSize
        }
        
        // Если вьювер подключился, завершаем инициализацию
        if (data.connected) {
            completeInitialization();
        }

        updateViewerStatusUI()
    })

    wsClient.on('initial_state', (state) => {
        logger.info('Получено начальное состояние', state)
        if (window.__previewRenderer) {
            window.__previewRenderer.physicsEngine.setState(state)
        }
        syncUIWithState(state)
    })

    wsClient.on('state_update', (state) => {
        // Тихая обработка обновлений состояния
        if (window.__previewPhysics) {
            window.__previewPhysics.applyCommand(state)
        }
    })

    wsClient.on('maxReconnectAttemptsReached', () => {
        logger.error('Исчерпаны попытки переподключения')
        showErrorNotification('Не удается подключиться к серверу. Проверьте интернет-соединение.')
    })
}

/**
 * Обновление статуса соединения
 */
function updateConnectionStatus(isConnected) {
    const wsStatus = document.getElementById('wsStatus')
    if (wsStatus) {
        wsStatus.className = isConnected ? 'status-indicator connected' : 'status-indicator disconnected'
        wsStatus.textContent = isConnected ? 'Подключен' : 'Отключен'
    }
}

/**
 * Показ уведомления об ошибке
 */
function showErrorNotification(message) {
    // Создаем временное уведомление
    const notification = document.createElement('div')
    notification.className = 'error-notification'
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 300px;
        ">
            <strong>Ошибка:</strong> ${message}
            <button onclick="this.parentElement.remove()" style="
                float: right;
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                margin-left: 10px;
            ">×</button>
        </div>
    `
    document.body.appendChild(notification)

    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove()
        }
    }, 5000)
}

/**
 * Создание логгера для модуля
 */
function createLogger(moduleName) {
    return {
        info: (message, data) => {
            console.log(`%c[${moduleName}] ${message}`, 'color: #3b82f6; font-weight: bold;', data || '')
        },
        success: (message, data) => {
            console.log(`%c[${moduleName}] ✅ ${message}`, 'color: #10b981; font-weight: bold;', data || '')
        },
        warning: (message, data) => {
            console.warn(`%c[${moduleName}] ⚠️ ${message}`, 'color: #f59e0b; font-weight: bold;', data || '')
        },
        error: (message, data) => {
            console.error(`%c[${moduleName}] ❌ ${message}`, 'color: #ef4444; font-weight: bold;', data || '')
        }
    }
}

/**
 * Кастомная ошибка приложения
 */
class AppError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'AppError'
        this.code = code
        this.details = details
        this.timestamp = new Date().toISOString()
    }
}

/**
 * Обработка ошибок инициализации
 */
async function handleInitializationError(error, logger) {
    logger.error('Критическая ошибка инициализации:', error)

    let userMessage = 'Произошла неизвестная ошибка при инициализации'

    if (error instanceof AppError) {
        switch (error.code) {
            case 'SESSION_ID_MISSING':
                userMessage = 'Ссылка недействительна. Попробуйте создать новую сессию.'
                break
            case 'DOM_ELEMENTS_MISSING':
                userMessage = 'Ошибка интерфейса приложения. Попробуйте перезагрузить страницу.'
                break
            default:
                userMessage = error.message
        }
    } else if (error.message) {
        userMessage = error.message
    }

    // Показываем ошибку пользователю
    alert(`Ошибка инициализации: ${userMessage}`)

    // Логируем для отладки
    console.error('Полная информация об ошибке:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
        timestamp: new Date().toISOString()
    })
}

// ===== СИНХРОНИЗАЦИЯ UI =====

function syncUIWithState(ballState) {
    try {
        debugLog('🔄 Синхронизируем UI с состоянием от сервера', ballState)

        if (!ballState) {
            debugWarn('syncUIWithState вызван с пустым состоянием.')
            return
        }

        updatePreviewSize(ballState.viewerScreenSize)

        window.__current.viewerConnected = ballState.viewerConnected
        window.__current.viewerScreenSize = ballState.viewerScreenSize
        updateViewerStatusUI()

        if (ballState.speed !== undefined && components.speed) {
            components.speed.setSpeed(ballState.speed)
        }
        if (ballState.radius !== undefined && components.size) {
            components.size.setSize(ballState.radius)
        }
        if (ballState.colorBall && components.ballColor) {
           components.ballColor.setColor(ballState.colorBall)
        }
        if (ballState.colorBg && components.bgColor) {
            components.bgColor.setColor(ballState.colorBg)
        }
        if (ballState.paused !== undefined) {
            isPlaying = !ballState.paused
            updatePlayPauseButton()
        }

        if (ballState.dirX !== undefined && ballState.dirY !== undefined) {
            directionState = { dx: ballState.dirX, dy: ballState.dirY }

            // Определяем режим направления по вектору
            if (Math.abs(ballState.dirX) > 0.9) currentDirectionMode = 'horizontal'
            else if (Math.abs(ballState.dirY) > 0.9) currentDirectionMode = 'vertical'
            else if (ballState.dirX > 0 && ballState.dirY > 0) currentDirectionMode = 'diagRL'
            else if (ballState.dirX > 0 && ballState.dirY < 0) currentDirectionMode = 'diagRLL'

            updateDirectionButtons()
            updateDirectionDisplay(ballState.dirX, ballState.dirY)
        }

        debugLog('✅ UI синхронизирован')
    } catch (error) {
        debugError('Ошибка при синхронизации UI:', error)
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ КОМПОНЕНТОВ =====

function initializeComponents() {
  // Создаем компонент управления скоростью
  components.speed = sharedComponents.createSpeedControl(
    document.getElementById('speedControl'),
    {
      onSpeedChange: throttle((speed) => {
        updateSpeed(speed)
      }, 100) // Ограничиваем отправку: не чаще чем раз в 100 мс
    }
  )

  // Создаем компонент управления цветом шарика
  components.ballColor = sharedComponents.createColorControl(
    document.getElementById('ballColorControl'),
    {
      colors: ['#60a5fa', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16', '#fb7185', '#ffffff'],
      defaultValue: '#60a5fa', // Дефолтный цвет мяча
      title: '🎨 Цвет шарика',
      onColorChange: (color) => {
        setBallColor(color)
        // Не меняем радиус превью при смене цвета
      }
    }
  )

  // Создаем компонент управления цветом фона
  components.bgColor = sharedComponents.createColorControl(
    document.getElementById('bgColorControl'),
    {
      colors: ['#020617', '#000000', '#111827', '#0a2540', '#052e16', '#1a102a', '#2b1b0e', '#032f2f', '#2a0e14', '#0f172a'],
      defaultValue: '#020617', // Дефолтный цвет фона
      title: '🎨 Цвет фона',
      onColorChange: (color) => {
        setBgColor(color)
        // Не меняем радиус превью при смене фона
      }
    }
  )

  // Создаем компонент управления размером
  components.size = sharedComponents.createSizeControl(
    document.getElementById('sizeControl'),
    {
      sizes: [20, 40, 80, 100],
      defaultValue: 20,
      title: '📏 Размер шарика',
      onSizeChange: (size) => {
        setBallSize(size)
      }
    }
  )

  // Инициализируем менеджер скорости
  speedManager = {
    lastUpdateTime: 0,
    updateDelay: 200, // Фиксированная задержка для локальной разработки
    getCurrentSpeed: function() {
      return components.speed ? components.speed.getSpeed() : 40
    }
  }
}

/**
 * Определяет оптимальную задержку обновления в зависимости от окружения
 */
function getOptimalUpdateDelay() {
  // Проверяем, работаем ли на продакшене (Render.com)
  const isProduction = window.location.hostname.includes('onrender.com') || 
                      window.location.hostname.includes('bilateralbound.onrender.com')
  
  if (isProduction) {
    return 3000 // 3 секунды для продакшена чтобы избежать 429 ошибок
  } else {
    return 200 // 200ms для локальной разработки
  }
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ =====

async function updateSpeed(speed) {
  try {
    // Оптимизация: меньше обновлений когда нет вьювера
    if (!window.__current.viewerConnected) {
      console.log('⏭️ Skipping speed update - no viewer connected')
      return
    }

    await wsClient.send('controller_update', { speed: speed })
    debugLog('✅ Скорость обновлена через WebSocket:', speed)

  } catch (error) {
    debugError('Ошибка при обновлении скорости:', error)
    alert('Ошибка при обновлении скорости', error.message)
  }
}

// ===== ПРЕВЬЮ =====

async function initializePreview() {
    debugLog('🎮 Начинаем инициализацию превью')

    // Показываем текст ожидания подключения вьювера
    showWaitingForViewer()

    const previewWrap = document.getElementById('previewWrap')
    if (previewWrap) {
        previewWrap.style.display = 'block'
        debugLog('✅ Превью контейнер показан')
    }

    const canvas = document.getElementById('preview')
    if (!canvas) {
        debugError('Preview canvas not found')
        return
    }
    debugLog('✅ Canvas элемент найден')

    // Проверяем размеры canvas
    debugLog(`📏 Исходные размеры canvas: ${canvas.width}x${canvas.height}`)
    if (canvas.width === 0 || canvas.height === 0) {
        debugLog(`⚠️ Неверные размеры canvas, устанавливаем по умолчанию`)
        canvas.width = 400
        canvas.height = 300
        // Жестко задаем CSS размеры, чтобы исключить неравномерное масштабирование
        canvas.style.width = canvas.width + 'px'
        canvas.style.height = canvas.height + 'px'
    }

    try {
        // Создаем движок физики для превью
        window.__previewPhysics = new PhysicsEngine({
            worldWidth: canvas.width,
            worldHeight: canvas.height,
            bounceCallback: null,
            isViewer: true // Превью теперь работает в режиме "зрителя"
        })
        debugLog('✅ PhysicsEngine создан')

        // Создаем рендерер, который будет сам обновлять физику (для интерполяции)
        window.__previewRenderer = new BallRenderer(canvas, window.__previewPhysics, {
            localPhysics: true // Включаем локальную физику для превью - как у вьювера
        })
        debugLog('✅ BallRenderer создан')

        window.__previewRenderer.setFrameCallback((deltaTime) => {
            // Дополнительная логика для превью может быть добавлена здесь
        })

        window.__previewCanvas = canvas
        debugLog('✅ Глобальные переменные установлены')

        window.__previewRenderer.start()
        debugLog('✅ Renderer запущен')

        // Устанавливаем мяч в центр и ставим на паузу по умолчанию
        setTimeout(() => {
            window.__previewPhysics.setPaused(true)
            window.__previewPhysics.setPosition(canvas.width / 2, canvas.height / 2) // Центр превью
            window.__previewPhysics.setVelocity(0, 0)
            debugLog('✅ Превью инициализирован в центре и на паузе')
        }, 500)

        debugLog('🎉 Инициализация превью завершена успешно')

    } catch (error) {
        debugError('❌ Ошибка при инициализации превью: ' + error.message)
        console.error('Preview initialization error:', error)
        alert('Ошибка при инициализации превью', error.message)
    }
}

function showWaitingForViewer() {
    const viewerInfo = document.getElementById('viewerInfo')
    if (viewerInfo) {
        viewerInfo.textContent = '⏳ Ожидание подключения вьювера'
        viewerInfo.style.display = 'block'
    }
}

function updatePreviewSize(viewerScreenSize) {
    if (!viewerScreenSize || !window.__previewRenderer || !window.__previewPhysics) {
        console.log('⚠️ Skipping preview size update - missing viewer screen size or components')
        showWaitingForViewer()
        return
    }

    const canvas = document.getElementById('preview')
    if (!canvas) {
        console.log('⚠️ Preview canvas not found')
        return
    }

    console.log('🔧 Updating preview size with viewer screen:', viewerScreenSize)

    const container = canvas.parentElement
    const containerRect = container.getBoundingClientRect()

    // Уменьшенные размеры для компактности
    const maxWidth = Math.min(containerRect.width - 40, 350)  // Уменьшаем для компактности
    const maxHeight = Math.min(280, maxWidth * 0.75)          // Уменьшаем для компактности

    const viewerRatio = viewerScreenSize.width / viewerScreenSize.height
    console.log(`📐 Вьювер соотношение: ${viewerRatio.toFixed(3)} (${viewerScreenSize.width}×${viewerScreenSize.height})`)

    let previewWidth, previewHeight

    // Сохраняем точное соотношение сторон вьювера
    if (viewerRatio > 4/3) {
        previewWidth = maxWidth
        previewHeight = previewWidth / viewerRatio
        if (previewHeight > maxHeight) {
            previewHeight = maxHeight
            previewWidth = previewHeight * viewerRatio
        }
    } else if (viewerRatio < 4/3) {
        previewHeight = maxHeight
        previewWidth = previewHeight * viewerRatio
        if (previewWidth > maxWidth) {
            previewWidth = maxWidth
            previewHeight = previewWidth / viewerRatio
        }
    } else {
        previewWidth = Math.min(maxWidth, maxHeight * viewerRatio)
        previewHeight = previewWidth / viewerRatio
    }

    // Минимальные размеры для компактности
    canvas.width = Math.max(previewWidth, 250)   // Уменьшаем минимум для компактности
    canvas.height = Math.max(previewHeight, 200) // Уменьшаем минимум для компактности

    // Синхронизируем CSS размеры с внутренними, чтобы круг не сплющивался
    canvas.style.width = canvas.width + 'px'
    canvas.style.height = canvas.height + 'px'

    console.log(`📏 Превью размер: ${canvas.width}×${canvas.height} (соотношение: ${(canvas.width/canvas.height).toFixed(3)})`)

    window.__previewRenderer.resize(canvas.width, canvas.height)
    window.__previewPhysics.setWorldSize(canvas.width, canvas.height)

    // Центрирование мяча в превью теперь происходит через syncFromServer
    // const centerX = canvas.width / 2
    // const centerY = canvas.height / 2
    // window.__previewPhysics.setPosition(centerX, centerY)

    console.log(`🎯 Мяч будет центрирован через syncFromServer`)

    const viewerInfo = document.getElementById('viewerInfo')
    if (viewerInfo) {
        viewerInfo.textContent = `Вьювер: ${viewerScreenSize.width}×${viewerScreenSize.height}`
        viewerInfo.style.display = 'block'
    }

    console.log('✅ Preview size updated:', {
        finalSize: { width: canvas.width, height: canvas.height },
        containerSize: { width: containerRect.width, height: containerRect.height },
        viewerRatio: viewerRatio,
        maxDimensions: { width: maxWidth, height: maxHeight }
    })
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ НАПРАВЛЕНИЕМ =====

function setDir(mode){
  let dx = 0, dy = 0
  switch(mode){
    case 'horizontal': dx = 1; dy = 0; break
    case 'vertical': dx = 0; dy = 1; break
    case 'diagRL': dx = 0.707; dy = 0.707; break
    case 'diagRLL': dx = 0.707; dy = -0.707; break
  }

  directionState = { dx, dy }
  updateDirectionDisplay(dx, dy)

  // Отправляем команду изменения направления через WebSocket
  wsClient.send('controller_update', {
    dirX: dx,
    dirY: dy,
    resume: true // Если мяч движется, сразу меняем направление
  })
  debugLog(`✅ Направление изменено через WS: dx=${dx}, dy=${dy}`)
}

// Функция для обновления активного состояния кнопок направлений
function updateDirectionButtons() {
  // Снимаем активное состояние со всех кнопок
  document.querySelectorAll('.direction-btn').forEach(btn => { btn.classList.remove('active') })
  document.querySelectorAll('.segmented .seg-btn').forEach(btn => { btn.classList.remove('active') })

  // Добавляем активное состояние к текущей кнопке
  const activeSeg = document.querySelector(`.segmented .seg-btn[data-mode="${currentDirectionMode}"]`)
  if (activeSeg) { activeSeg.classList.add('active') }
}

// Функция установки направления (как в тесте)
function setDirection(mode) {
    currentDirectionMode = mode

    let dx = 0, dy = 0
    switch(mode) {
        case 'horizontal': dx = 1; dy = 0; break
        case 'vertical': dx = 0; dy = 1; break
        case 'diagRL': dx = 0.707; dy = 0.707; break
        case 'diagRLL': dx = 0.707; dy = -0.707; break
    }

    directionState = { dx, dy }
    updateDirectionDisplay(dx, dy)
    updateDirectionButtons() // Обновляем выделение кнопок

    // Отправляем команду на сервер (только установка направления, без запуска движения)
    wsClient.send('controller_update', {
        dirX: dx,
        dirY: dy
    })
    debugLog('✅ Направление и движение установлены через WS:', mode, { dx, dy })
}

function setDirFromDirection(direction) {
  const dx = direction.x
  const dy = direction.y

  directionState = { dx, dy }
  updateDirectionDisplay(dx, dy)

  wsClient.send('controller_update', { dirX: dx, dirY: dy })
}

function updateDirectionDisplay(dx, dy) {
  const currentDirection = document.getElementById('currentDirection')
  if (!currentDirection) return

  let directionText = '↔️ Горизонтально'
  if (dx === 0 && dy === 1) directionText = '↕️ Вертикально'
  else if (dx > 0 && dy > 0) directionText = '↗️ Диагональ L→R'
  else if (dx > 0 && dy < 0) directionText = '↙️ Диагональ R→L'
  else if (dx < 0 && dy > 0) directionText = '↖️ Диагональ R→L'
  else if (dx < 0 && dy < 0) directionText = '↙️ Диагональ L→R'

  currentDirection.textContent = directionText
}

// ===== ФУНКЦИИ УПРАВЛЕНИЯ МЯЧОМ =====

function resetCenter(){
  debugLog('🎯 Центрирование мяча...')
  wsClient.send('controller_update', { reset: true })
  debugLog('✅ Мяч отцентрирован через WS')
}

function resetSession(){
    if (confirm('Вы уверены, что хотите сбросить сессию?')) {
        // Закрываем текущий WebSocket
        if(wsClient) wsClient.disconnect()

        fetch('/api/session', { method: 'POST' }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            return response.json()
        }).then(data => {
            const newSessionId = data.sessionId

            debugLog(`🔄 Сессия сброшена. Новая сессия: ${newSessionId}`)

            // Обновляем URL и перезагружаем страницу
            const newUrl = new URL(window.location)
            newUrl.searchParams.set('sessionId', newSessionId)
            window.location.href = newUrl.toString()

        }).catch(error => {
            debugError('Error resetting session:', error)
            alert('Ошибка при сбросе сессии', error.message)
        })
    }
}

function setBallColor(color) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    console.log('⏭️ Skipping ball color update - no viewer connected')
    return
  }
  wsClient.send('controller_update', { colorBall: color })
}

function setBgColor(color) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    console.log('⏭️ Skipping background color update - no viewer connected')
    return
  }
  wsClient.send('controller_update', { colorBg: color })
}

function setBallSize(size) {
  // Оптимизация: меньше обновлений когда нет вьювера
  if (!window.__current.viewerConnected) {
    console.log('⏭️ Skipping ball size update - no viewer connected')
    return
  }
  wsClient.send('controller_update', { radius: size })
}

// ===== ФУНКЦИИ ВОСПРОИЗВЕДЕНИЯ =====

// Глобальная переменная для отслеживания состояния игры
// let isPlaying = false; // Перенесено наверх

// Удаляем hasViewer, так как теперь используем window.__current.viewerConnected
// let hasViewer = false;

// Глобальная переменная для отслеживания текущего направления
// let currentDirectionMode = 'horizontal'; // Перенесено наверх

function updatePlayPauseButton() {
  const button = document.getElementById('playPauseBtn')
  if (!button) return

  if (isPlaying) {
    button.textContent = '⏸ Стоп'
    button.style.background = '#f59e0b'
  } else {
    button.textContent = '▶️ Старт'
    button.style.background = '#10b981'
  }
}

function togglePlayPause(){
  const button = document.getElementById('playPauseBtn')

  if (isPlaying) {
    // Останавливаем игру
    wsClient.send('controller_update', { pause: true })
    isPlaying = false
    updatePlayPauseButton()
    debugLog('⏸ Игра остановлена через WS')
    // Синхронизируем превью
    if (window.__previewPhysics) {
      window.__previewPhysics.setPaused(true)
    }
  } else {
    // Запускаем игру (используем выбранное направление или горизонтальное по умолчанию)
    // Убеждаемся что направление не нулевое
    let currentDirection = directionState || { dx: 1, dy: 0 }
    if (currentDirection.dx === 0 && currentDirection.dy === 0) {
      currentDirection = { dx: 1, dy: 0 } // По умолчанию горизонтальное движение
    }
    debugLog(`▶️ Запуск движения: направление dx=${currentDirection.dx}, dy=${currentDirection.dy}`)
    wsClient.send('controller_update', {
      paused: false,
      dirX: currentDirection.dx,
      dirY: currentDirection.dy,
      speed: components.speed ? components.speed.getSpeed() : 40
    })
    isPlaying = true
    updatePlayPauseButton()
    debugLog('▶️ Игра запущена через WS')

    // Запускаем локальную физику в превью
    if (window.__previewPhysics) {
      window.__previewPhysics.setPaused(false)
      window.__previewPhysics.startMovement(currentDirection.dx, currentDirection.dy, components.speed ? components.speed.getSpeed() : 40)
      debugLog('▶️ Локальная физика превью запущена')
    }
  }
}

// Устаревшие функции (оставлены для совместимости)
function resumePlay(){
  if (!isPlaying) {
    togglePlayPause()
  }
}

function pausePlay(){
  if (isPlaying) {
    togglePlayPause()
  }
}

// ===== УТИЛИТЫ =====

function copy(id) {
  const element = document.getElementById(id)
  if (!element) return
  element.select()
  navigator.clipboard.writeText(element.value)
    .then(() => {
      const btn = (window.event && window.event.target) || null
      if (btn) {
        const originalText = btn.textContent
        btn.textContent = '✅ Скопировано!'
        setTimeout(() => { btn.textContent = originalText }, 2000)
      }
    })
    .catch(err => {
      debugError('Failed to copy: ', err)
      alert('Ошибка копирования', err.message)
    })
}

function goBack() {
    if (confirm('Вы уверены, что хотите вернуться на главную страницу? Текущая сессия будет сохранена.')) {
        window.location.href = '/'
    }
}

function updateViewerStatusUI() {
    console.log(`%c[Controller] Вызвана updateViewerStatusUI. Статус: ${window.__current.viewerConnected}`, 'color: #purple; font-weight: bold;')
    const viewerStatusEl = document.getElementById('viewerStatus')
    if(viewerStatusEl) {
        if (window.__current.viewerConnected) {
            viewerStatusEl.textContent = 'Подключен'
            viewerStatusEl.style.color = '#10b981' // зеленый
            if (window.__current.viewerScreenSize && window.__current.viewerScreenSize.width > 0) {
                updatePreviewSize(window.__current.viewerScreenSize)
            }
        } else {
            viewerStatusEl.textContent = 'Ожидание...'
            viewerStatusEl.style.color = '#ef4444' // красный
            showWaitingForViewer()
        }
    }
}
