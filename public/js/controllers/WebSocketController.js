/**
 * WebSocketController - контроллер для управления WebSocket соединением
 * Отвечает за отправку команд на сервер через WebSocket
 */
export class WebSocketController {
  /**
   * Создает экземпляр контроллера WebSocket
   * @param {WebSocketClient} wsClient - WebSocket клиент для связи с сервером
   * @param {Object} appState - глобальное состояние приложения
   */
  constructor(wsClient, appState) {
    this.wsClient = wsClient;
    this.appState = appState;
  }

  /**
   * Отправляет обновление контроллера на сервер
   * @param {Object} data - данные для отправки
   * @returns {Promise} промис с результатом отправки
   */
  sendControllerUpdate(data) {
    return this.wsClient.send('controller_update', data);
  }

  /**
   * Отправляет изменение направления движения
   * @param {number} dirX - компонент X направления
   * @param {number} dirY - компонент Y направления
   * @returns {Promise} промис с результатом отправки
   */
  sendDirectionChange(dirX, dirY) {
    return this.sendControllerUpdate({ dirX, dirY });
  }

  /**
   * Отправляет переключение воспроизведения/паузы
   * @param {boolean} isPlaying - текущее состояние воспроизведения
   * @returns {Promise} промис с результатом отправки
   */
  sendPlayPauseToggle(isPlaying) {
    return this.sendControllerUpdate({ paused: !isPlaying });
  }

  /**
   * Отправляет изменение скорости
   * @param {number} speed - новая скорость движения
   * @returns {Promise} промис с результатом отправки
   */
  sendSpeedChange(speed) {
    return this.sendControllerUpdate({ speed });
  }

  /**
   * Отправляет команду сброса позиции мяча в центр
   * @returns {Promise} промис с результатом отправки
   */
  sendReset() {
    return this.sendControllerUpdate({ reset: true });
  }
}
