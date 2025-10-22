/**
 * SessionController - контроллер для управления сессией EMDR терапии
 * Отвечает за координацию между различными компонентами системы
 */
export class SessionController {
  /**
   * Создает экземпляр контроллера сессии
   * @param {WebSocketClient} wsClient - WebSocket клиент для связи с сервером
   * @param {Object} appState - глобальное состояние приложения
   */
  constructor(wsClient, appState) {
    this.wsClient = wsClient
    this.appState = appState
    this.listeners = new Set()
  }

  /**
   * Инициализирует контроллер сессии
   */
  initialize() {
    // Регистрация обработчиков событий WebSocket
    this.setupWebSocketListeners()
    return this
  }

  /**
   * Проверяет валидность состояния контроллера
   */
  isValid() {
    return !!this.wsClient && !!this.appState
  }

  /**
   * Возвращает текущее состояние сессии
   */
  getSessionState() {
    return this.appState
  }

  /**
   * Устанавливает новое состояние сессии
   * @param {Object} newState - новое состояние
   */
  setSessionState(newState) {
    this.appState = { ...this.appState, ...newState }
    this.notifyListeners('stateChanged', newState)
  }

  /**
   * Добавляет слушателя событий контроллера
   * @param {Function} listener - функция слушателя
   */
  addListener(listener) {
    this.listeners.add(listener)
  }

  /**
   * Удаляет слушателя событий контроллера
   * @param {Function} listener - функция слушателя
   */
  removeListener(listener) {
    this.listeners.delete(listener)
  }

  /**
   * Уведомляет всех слушателей о событии
   * @param {string} event - тип события
   * @param {*} data - данные события
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data)
      } catch (error) {
        console.error('SessionController listener error:', error)
      }
    })
  }

  /**
   * Настраивает обработчики WebSocket событий
   * @private
   */
  setupWebSocketListeners() {
    if (!this.wsClient) return

    this.wsClient.on('stateUpdate', (state) => {
      this.setSessionState(state)
    })

    this.wsClient.on('sessionEnd', () => {
      this.notifyListeners('sessionEnded')
    })
  }
}
