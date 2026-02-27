/**
 * RealtimeClient - Универсальный адаптер для WebSocket и SSE
 * Автоматически выбирает оптимальный транспорт в зависимости от настроек
 * По умолчанию использует WebSocket (меньше overhead на слабом VPS)
 */
/* global SSEClient, WebSocketClient */
if (typeof RealtimeClient === 'undefined') {
  class RealtimeClient {
    constructor(sessionId, role, options = {}) {
      this.sessionId = sessionId
      this.role = role
      const useSSE = options.transport === 'sse'
      this.transportType = useSSE ? 'sse' : 'websocket'
      if (!useSSE && typeof WebSocketClient !== 'undefined') {
        this.client = new WebSocketClient(sessionId, role, options)
      } else if (useSSE && typeof SSEClient !== 'undefined') {
        this.client = new SSEClient(sessionId, role, options)
        this.transportType = 'sse'
      } else {
        throw new Error('No realtime transport available (SSEClient or WebSocketClient)')
      }
    }
    /**
     * Подключение к серверу
     */
    async connect() {
      return this.client.connect()
    }
    /**
     * Отправка сообщения
     */
    async send(type, payload, options = {}) {
      return this.client.send(type, payload, options)
    }
    /**
     * Регистрация обработчика события
     */
    on(eventType, handler) {
      this.client.on(eventType, handler)
    }
    /**
     * Отписка от события
     */
    off(eventType, handler) {
      this.client.off(eventType, handler)
    }
    /**
     * Закрытие соединения
     */
    close() {
      this.client.close()
    }
    /**
     * Проверка подключения
     */
    get isConnected() {
      return this.client.isConnected
    }
    /**
     * Получение статистики
     */
    getStats() {
      return {
        ...this.client.getStats(),
        transportType: this.transportType
      }
    }
    /**
     * Получение информации о транспорте
     */
    getTransportType() {
      return this.transportType
    }
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.RealtimeClient = RealtimeClient
  }
}
