/**
 * Общий модуль для обработки ошибок, polling'а и уведомлений
 * Обеспечивает масштабируемость, переиспользуемость и чистоту кода
 */

/**
 * Конфигурация системы обработки ошибок
 */
const ERROR_CONFIG = {
  MAX_RETRIES: 5,                    // Максимальное количество последовательных ошибок
  RATE_LIMIT_BACKOFF_MS: 10000,      // Время ожидания после rate limit (мс)
  BASE_POLLING_INTERVAL_MS: 500,     // Базовый интервал polling'а (мс)
  MAX_POLLING_INTERVAL_MS: 5000,     // Максимальный интервал polling'а (мс)
  NOTIFICATION_DURATION_MS: 30000,   // Длительность показа уведомлений (мс)
  POSITION_SYNC_CHANCE: 0.001        // Шанс синхронизации позиции (0.1% - очень редко)
};

/**
 * Типы ошибок для обработки
 */
const ERROR_TYPES = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Класс для обработки ошибок и управления polling'ом
 */
class ErrorHandler {
  constructor(onSessionExpired) {
    this.consecutiveErrors = 0;
    this.lastRateLimitTime = 0;
    this.pollingInterval = ERROR_CONFIG.BASE_POLLING_INTERVAL_MS;
    this.onSessionExpired = onSessionExpired;
  }

  /**
   * Обрабатывает HTTP ответ и определяет тип ошибки
   * @param {Response} response - HTTP ответ
   * @returns {string|null} Тип ошибки или null при успешном ответе
   */
  handleResponse(response) {
    if (response.ok) {
      this.resetErrorCount();
      return null;
    }

    let errorType;

    switch (response.status) {
      case 404:
        console.error('Session not found, session may have expired');
        errorType = ERROR_TYPES.SESSION_NOT_FOUND;
        break;
      case 429:
        console.log('Rate limited, slowing down polling...');
        this.lastRateLimitTime = Date.now();
        errorType = ERROR_TYPES.RATE_LIMITED;
        break;
      default:
        console.error(`HTTP error: ${response.status}`);
        errorType = ERROR_TYPES.UNKNOWN_ERROR;
    }

    this.incrementErrorCount();
    return errorType;
  }

  /**
   * Обрабатывает исключения в сети
   * @param {Error} error - Исключение
   */
  handleNetworkError(error) {
    console.error('Network error:', error);
    this.incrementErrorCount();
  }

  /**
   * Увеличивает счетчик ошибок и проверяет лимит
   */
  incrementErrorCount() {
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= ERROR_CONFIG.MAX_RETRIES) {
      console.error('Too many consecutive errors, stopping polling');
      this.onSessionExpired();
    }
  }

  /**
   * Сбрасывает счетчик ошибок
   */
  resetErrorCount() {
    this.consecutiveErrors = 0;
  }

  /**
   * Вычисляет адаптивный интервал polling'а
   * @returns {number} Интервал в миллисекундах
   */
  getAdaptiveInterval() {
    // Адаптивная логика: увеличиваем интервал при rate limiting, уменьшаем при стабильной работе
    if (Date.now() - this.lastRateLimitTime < ERROR_CONFIG.RATE_LIMIT_BACKOFF_MS) {
      this.pollingInterval = Math.min(this.pollingInterval * 1.5, ERROR_CONFIG.MAX_POLLING_INTERVAL_MS);
    } else {
      this.pollingInterval = Math.max(this.pollingInterval * 0.9, ERROR_CONFIG.BASE_POLLING_INTERVAL_MS);
    }

    return this.pollingInterval;
  }

  /**
   * Проверяет, нужно ли синхронизировать позицию
   * @returns {boolean} True если нужно синхронизировать
   */
  shouldSyncPosition() {
    return Math.random() < ERROR_CONFIG.POSITION_SYNC_CHANCE;
  }
}

/**
 * Класс для управления уведомлениями
 */
class NotificationManager {
  /**
   * Показывает уведомление об истечении сессии
   * @param {Object} options - Опции уведомления
   * @param {string} options.title - Заголовок уведомления
   * @param {string} options.message - Текст сообщения
   * @param {Array} options.actions - Массив действий [{text, action}]
   */
  static showSessionExpired(options = {}) {
    const {
      title = '⏰ Сессия истекла',
      message = 'Ваша сессия была завершена. Создайте новую сессию для продолжения.',
      actions = [{ text: 'Создать новую сессию', action: () => location.reload() }]
    } = options;

    // Создаем уведомление
    const notification = document.createElement('div');
    notification.id = 'session-expired-notification';
    notification.innerHTML = this.createNotificationHTML(title, message, actions);

    // Показываем уведомление
    this.displayNotification(notification, actions);
  }

  /**
   * Создает HTML для уведомления
   * @private
   */
  static createNotificationHTML(title, message, actions) {
    const actionsHTML = actions.map((action, index) =>
      `<button data-action-index="${index}" style="
        background: ${action.primary ? '#ef4444' : 'white'};
        color: ${action.primary ? 'white' : '#ef4444'};
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        margin-right: 10px;
      ">${action.text}</button>`
    ).join('');

    return `
      <div style="
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ef4444;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 400px;
        text-align: center;
      ">
        <h3 style="margin: 0 0 8px 0; font-size: 16px;">${title}</h3>
        <p style="margin: 0 0 15px 0; font-size: 14px; opacity: 0.9;">
          ${message}
        </p>
        <div style="display: flex; justify-content: center;">
          ${actionsHTML}
        </div>
      </div>
    `;
  }

  /**
   * Отображает уведомление на странице
   * @private
   */
  static displayNotification(notification, actions = []) {
    // Убираем существующее уведомление
    const existing = document.getElementById('session-expired-notification');
    if (existing) {
      existing.remove();
    }

    document.body.appendChild(notification);

    // Добавляем обработчики событий для кнопок
    const buttons = notification.querySelectorAll('button[data-action-index]');
    buttons.forEach(button => {
      const actionIndex = parseInt(button.getAttribute('data-action-index'));
      const action = actions[actionIndex];
      if (action && action.action) {
        button.addEventListener('click', () => {
          try {
            action.action();
          } catch (error) {
            console.error('Error executing action:', error);
          }
          // Скрываем уведомление после выполнения действия
          if (notification.parentNode) {
            notification.remove();
          }
        });
      }
    });

    // Автоматически скрываем через заданное время
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, ERROR_CONFIG.NOTIFICATION_DURATION_MS);
  }
}

// SessionPoller теперь импортируется из session-poller.js

// Экспортируем классы для использования в других модулях
window.ErrorHandler = ErrorHandler;
window.NotificationManager = NotificationManager;
// SessionPoller теперь импортируется отдельно из session-poller.js
window.ERROR_CONFIG = ERROR_CONFIG;
