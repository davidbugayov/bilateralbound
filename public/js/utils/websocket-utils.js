/**
 * Утилиты для работы с WebSocket
 * Централизованная логика подключения и обработки сообщений
 */

class WebSocketUtils {
  /**
   * Создает WebSocket URL
   */
  static generateWebSocketUrl(sessionId, role) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/?sessionId=${sessionId}&role=${role}`;
  }

  /**
   * Создает WebSocket клиент с обработкой ошибок
   */
  static createWebSocketClient(sessionId, role, options = {}) {
    const url = this.generateWebSocketUrl(sessionId, role);
    const ws = new WebSocket(url);
    
    // Настройки по умолчанию
    const config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      ...options
    };

    let reconnectAttempts = 0;
    let heartbeatTimer = null;
    let reconnectTimer = null;

    // Обработчики событий
    const eventHandlers = new Map();

    const client = {
      ws,
      sessionId,
      role,
      config,
      isConnected: false,
      reconnectAttempts: 0,

      // Подписка на события
      on(event, handler) {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
      },

      // Отписка от событий
      off(event, handler) {
        if (eventHandlers.has(event)) {
          const handlers = eventHandlers.get(event);
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      },

      // Отправка сообщения
      send(type, data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
          const message = { type, payload: data };
          this.ws.send(JSON.stringify(message));
          return true;
        }
        return false;
      },

      // Подключение
      connect() {
        this.ws = new WebSocket(url);
        this._setupEventHandlers();
      },

      // Отключение
      disconnect() {
        this.isConnected = false;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (this.ws) {
          this.ws.close();
        }
      },

      // Настройка обработчиков событий
      _setupEventHandlers() {
        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._emit('open');
          this._startHeartbeat();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'heartbeat') return;
            this._emit(message.type, message.payload);
          } catch (error) {
            console.error('WebSocket message parse error:', error);
          }
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this._emit('close', event);
          this._attemptReconnect();
        };

        this.ws.onerror = (error) => {
          this._emit('error', error);
        };
      },

      // Попытка переподключения
      _attemptReconnect() {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
          this._emit('reconnect_failed');
          return;
        }

        this.reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
          console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
          this.connect();
        }, this.config.reconnectInterval);
      },

      // Запуск heartbeat
      _startHeartbeat() {
        heartbeatTimer = setInterval(() => {
          if (this.isConnected) {
            this.ws.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, this.config.heartbeatInterval);
      },

      // Эмит событий
      _emit(event, data) {
        if (eventHandlers.has(event)) {
          eventHandlers.get(event).forEach(handler => {
            try {
              handler(data);
            } catch (error) {
              console.error(`Error in event handler for ${event}:`, error);
            }
          });
        }
      }
    };

    return client;
  }

  /**
   * Создает простой WebSocket клиент без переподключения
   */
  static createSimpleWebSocketClient(sessionId, role) {
    const url = this.generateWebSocketUrl(sessionId, role);
    const ws = new WebSocket(url);
    
    const client = {
      ws,
      sessionId,
      role,
      isConnected: false,

      on(event, handler) {
        this.ws.addEventListener(event, handler);
      },

      send(type, data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
          const message = { type, payload: data };
          this.ws.send(JSON.stringify(message));
          return true;
        }
        return false;
      },

      connect() {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
          this.isConnected = true;
        };
      },

      disconnect() {
        this.isConnected = false;
        if (this.ws) {
          this.ws.close();
        }
      }
    };

    return client;
  }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.WebSocketUtils = WebSocketUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketUtils;
}
