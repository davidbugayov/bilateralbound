/**
 * Улучшенная система уведомлений для BilateralBound
 * Поддержка разных типов уведомлений с красивыми анимациями
 */

class NotificationSystem {
  container = null
  notifications = []
  autoHideTimeout = 5000

  constructor() {
    this.init()
  }

  /**
   * Инициализация системы уведомлений
   */
  init() {
    this.createContainer()
    this.setupStyles()
  }

  /**
   * Создает контейнер для уведомлений
   */
  createContainer() {
    if (this.container) return

    this.container = document.createElement('div')
    this.container.className = 'bb-notification-container'
    document.body.appendChild(this.container)
  }

  /**
   * Устанавливает стили для уведомлений
   */
  setupStyles() {
    if (document.getElementById('bb-notification-styles')) return

    const styles = document.createElement('style')
    styles.id = 'bb-notification-styles'
    styles.textContent = `
      .bb-notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 400px;
      }

      .bb-notification {
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px 20px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 50px;
        pointer-events: auto;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      }

      .bb-notification.show {
        transform: translateX(0);
        opacity: 1;
      }

      .bb-notification.removing {
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.2s ease-in-out;
      }

      .bb-notification.success {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .bb-notification.error {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .bb-notification.warning {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(217, 119, 6, 0.9) 100%);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .bb-notification.info {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(37, 99, 235, 0.9) 100%);
        border-color: rgba(255, 255, 255, 0.2);
      }

      .bb-notification-icon {
        font-size: 20px;
        flex-shrink: 0;
        animation: iconBounce 0.5s ease-in-out;
      }

      .bb-notification-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .bb-notification-title {
        font-weight: 600;
        font-size: 14px;
        line-height: 1.3;
      }

      .bb-notification-message {
        font-size: 13px;
        opacity: 0.9;
        line-height: 1.4;
      }

      .bb-notification-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 16px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .bb-notification-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .bb-notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 0 0 12px 12px;
        transition: width 0.1s linear;
      }

      .bb-notification.success .bb-notification-progress {
        background: rgba(255, 255, 255, 0.6);
      }

      .bb-notification.error .bb-notification-progress {
        background: rgba(255, 255, 255, 0.6);
      }

      .bb-notification.warning .bb-notification-progress {
        background: rgba(255, 255, 255, 0.6);
      }

      .bb-notification.info .bb-notification-progress {
        background: rgba(255, 255, 255, 0.6);
      }

      /* Анимации */
      @keyframes iconBounce {
        0%, 20%, 50%, 80%, 100% {
          transform: translateY(0);
        }
        40% {
          transform: translateY(-3px);
        }
        60% {
          transform: translateY(-2px);
        }
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }

      /* Адаптивность */
      @media (max-width: 768px) {
        .bb-notification-container {
          top: 10px;
          right: 10px;
          left: 10px;
          max-width: none;
        }

        .bb-notification {
          padding: 12px 16px;
          font-size: 13px;
          min-height: 45px;
        }
      }

      /* Светлая тема */
      .light-theme .bb-notification {
        background: #ffffff;
        border-color: #e2e8f0;
        color: #1e293b;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      }

      .light-theme .bb-notification.success {
        background: #f0fdf4;
        border-left: 4px solid #22c55e;
        color: #166534;
      }

      .light-theme .bb-notification.error {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%);
        color: #991b1b;
      }

      .light-theme .bb-notification.warning {
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%);
        color: #92400e;
      }

      .light-theme .bb-notification.info {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%);
        color: #1e3a8a;
      }

      .light-theme .bb-notification-close {
        color: #94a3b8;
        background: transparent;
      }

      .light-theme .bb-notification-close:hover {
        background: #f1f5f9;
        color: #475569;
      }
    `
    document.head.appendChild(styles)
  }

  /**
   * Показывает уведомление
   */
  show(options = {}) {
    const defaults = {
      type: 'info',
      title: '',
      message: '',
      duration: this.autoHideTimeout,
      closable: true,
      showProgress: true,
      icon: null,
      position: 'top-right'
    }

    const config = { ...defaults, ...options }

    // Проверяем дубликаты: объединяем по сообщению
    // Если уже есть уведомление с тем же текстом, но, возможно, другим типом/заголовком,
    // заменяем его новым (прячем старое и показываем актуальное), чтобы исключить "смешанные" цвета.
    const duplicate = this.notifications.find(n => n.config && n.config.message === config.message)
    if (duplicate) {
      // Если полностью совпадает (тип и заголовок), просто игнорируем повтор
      if (
        duplicate.config.type === config.type &&
        (duplicate.config.title || '') === (config.title || '')
      ) {
        return
      }
      // Иначе убираем предыдущее уведомление с тем же сообщением
      this.hide(duplicate)
    }

    const notification = this.createNotification(config)
    this.notifications.push(notification)
    this.container.appendChild(notification.element)

    // Анимация появления
    setTimeout(() => {
      notification.element.classList.add('show')
    }, 10)

    // Автоматическое скрытие
    if (config.duration > 0) {
      notification.hideTimeout = setTimeout(() => {
        this.hide(notification)
      }, config.duration)
    }

    // Прогресс-бар
    if (config.showProgress) {
      this.startProgress(notification)
    }

    return notification
  }

  /**
   * Создает элемент уведомления
   */
  createNotification(config) {
    const element = document.createElement('div')
    element.className = `bb-notification ${config.type}`

    // Иконка
    const icon = this.getIcon(config.type, config.icon)
    const iconElement = document.createElement('div')
    iconElement.className = 'bb-notification-icon'
    iconElement.textContent = icon

    // Контент
    const content = document.createElement('div')
    content.className = 'bb-notification-content'

    if (config.title) {
      const title = document.createElement('div')
      title.className = 'bb-notification-title'
      title.textContent = config.title
      content.appendChild(title)
    }

    if (config.message) {
      const message = document.createElement('div')
      message.className = 'bb-notification-message'
      message.textContent = config.message
      content.appendChild(message)
    }

    // Кнопка закрытия
    const close = document.createElement('button')
    close.className = 'bb-notification-close'
    close.innerHTML = '&times;'
    // Прогресс-бар
    const progress = document.createElement('div')
    progress.className = 'bb-notification-progress'

    const notification = {
      element,
      config,
      progress,
      hideTimeout: null
    }

    close.onclick = () => {
      this.hide(notification)
    }

    element.appendChild(iconElement)
    element.appendChild(content)
    if (config.closable) {
      element.appendChild(close)
    }
    element.appendChild(progress)

    return notification
  }

  /**
   * Возвращает иконку для типа уведомления
   */
  getIcon(type, customIcon) {
    if (customIcon) return customIcon

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    }

    return icons[type] || icons.info
  }

  /**
   * Запускает прогресс-бар
   */
  startProgress(notification) {
    const duration = notification.config.duration
    const startTime = Date.now()

    const updateProgress = () => {
      if (!notification.element.parentElement) {
        return
      }

      const elapsed = Date.now() - startTime
      const progress = Math.max(0, 100 - (elapsed / duration) * 100)

      notification.progress.style.width = `${progress}%`

      if (progress > 0) {
        requestAnimationFrame(updateProgress)
      }
    }

    requestAnimationFrame(updateProgress)
  }

  /**
   * Скрывает уведомление
   */
  hide(notification) {
    if (!notification || !notification.element) return

    clearTimeout(notification.hideTimeout)

    notification.element.classList.add('removing')

    setTimeout(() => {
      if (notification.element && notification.element.parentElement) {
        notification.element.remove()
      }

      const index = this.notifications.indexOf(notification)
      if (index > -1) {
        this.notifications.splice(index, 1)
      }
    }, 200)
  }

  /**
   * Показывает успешное уведомление
   */
  success(title, message) {
    return this.show({
      type: 'success',
      title,
      message
    })
  }

  /**
   * Показывает уведомление об ошибке
   */
  error(title, message) {
    return this.show({
      type: 'error',
      title,
      message
    })
  }

  /**
   * Показывает предупреждение
   */
  warning(title, message) {
    return this.show({
      type: 'warning',
      title,
      message
    })
  }

  /**
   * Показывает информационное уведомление
   */
  info(title, message) {
    return this.show({
      type: 'info',
      title,
      message
    })
  }

  /**
   * Очищает все уведомления
   */
  clearAll() {
    for (const notification of this.notifications) {
      this.hide(notification)
    }
  }

  /**
   * Получает количество активных уведомлений
   */
  count() {
    return this.notifications.length
  }
}

// Создаем глобальный экземпляр
if (typeof globalThis !== 'undefined') {
  globalThis.notificationSystem = new NotificationSystem()
  globalThis.showSuccessNotification = (title, message) =>
    globalThis.notificationSystem.success(title, message)
  globalThis.showErrorNotification = (title, message) =>
    globalThis.notificationSystem.error(title, message)
  globalThis.showWarningNotification = (title, message) =>
    globalThis.notificationSystem.warning(title, message)
  globalThis.showInfoNotification = (title, message) =>
    globalThis.notificationSystem.info(title, message)
}
