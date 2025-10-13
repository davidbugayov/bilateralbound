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
    this.wsClient = wsClient;
    this.appState = appState;
  }
}
