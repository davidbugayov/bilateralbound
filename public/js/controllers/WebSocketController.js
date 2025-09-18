/**
 * WebSocketController - Управление WebSocket соединением
 * Отвечает за обработку WebSocket сообщений и событий
 */
export class WebSocketController {
  constructor(wsClient, appState) {
    this.wsClient = wsClient;
    this.appState = appState;
    this.messageHandlers = new Map();
    this.setupDefaultHandlers();
  }

  setupDefaultHandlers() {
    // Обработчик начального состояния
    this.onInitialState((data) => {
      this.appState.lastServerState = data;
      this.updateAppState(data);
    });

    // Обработчик обновлений состояния
    this.onStateUpdate((data) => {
      this.appState.lastServerState = data;
      this.updateAppState(data);
    });

    // Обработчик статуса вьювера
    this.onViewerStatus((data) => {
      this.appState.viewerConnected = data.connected;
      this.appState.viewerScreenSize = data.screenSize || { width: 0, height: 0 };
    });

    // Обработчик ошибок
    this.onError((error) => {
      this.appState.onError?.(error);
    });

    // Обработчик закрытия соединения
    this.onClose((event) => {
      this.appState.onDisconnect?.(event);
    });
  }

  updateAppState(data) {
    if (data.paused !== undefined) {
      this.appState.isPlaying = !data.paused;
    }
    
    if (data.dirX !== undefined && data.dirY !== undefined) {
      this.appState.directionState = { dx: data.dirX, dy: data.dirY };
    }
    
    if (data.speed !== undefined) {
      this.appState.speed = data.speed;
    }
  }

  // Подписка на события
  onInitialState(callback) {
    this.wsClient?.on?.(window.WS_MSG?.initialState || 'initial_state', callback);
  }

  onStateUpdate(callback) {
    this.wsClient?.on?.(window.WS_MSG?.stateUpdate || 'state_update', callback);
  }

  onViewerStatus(callback) {
    this.wsClient?.on?.(window.WS_MSG?.viewerStatus || 'viewer_status', callback);
  }

  onError(callback) {
    this.wsClient?.on?.('error', callback);
  }

  onClose(callback) {
    this.wsClient?.on?.('close', callback);
  }

  onOpen(callback) {
    this.wsClient?.on?.('open', callback);
  }

  // Отправка сообщений
  async sendControllerUpdate(data) {
    if (!this.wsClient) {
      return;
    }

    try {
      await this.wsClient.send({
        type: 'controller_update',
        data: data
      });
    } catch (error) {
      throw error;
    }
  }

  async sendDirectionChange(dx, dy) {
    await this.sendControllerUpdate({
      dirX: dx,
      dirY: dy
    });
  }

  async sendPlayPauseToggle(paused) {
    await this.sendControllerUpdate({
      paused: paused
    });
  }

  async sendSpeedChange(speed) {
    await this.sendControllerUpdate({
      speed: speed
    });
  }

  async sendReset() {
    await this.sendControllerUpdate({
      reset: true
    });
  }

  // Управление соединением
  async connect(sessionId, role = 'controller') {
    if (!this.wsClient) {
      throw new Error('WebSocket client not initialized');
    }

    try {
      await this.wsClient.connect(sessionId, role);
    } catch (error) {
      throw error;
    }
  }

  disconnect() {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }
  }

  isConnected() {
    return this.wsClient?.isConnected?.() || false;
  }

  // Регистрация пользовательских обработчиков
  registerHandler(messageType, callback) {
    this.messageHandlers.set(messageType, callback);
    this.wsClient?.on?.(messageType, callback);
  }

  unregisterHandler(messageType) {
    const handler = this.messageHandlers.get(messageType);
    if (handler) {
      this.wsClient?.off?.(messageType, handler);
      this.messageHandlers.delete(messageType);
    }
  }
}


