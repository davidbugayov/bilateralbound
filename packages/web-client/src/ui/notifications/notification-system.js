/**
 * Улучшенная система уведомлений для BilateralBound
 * Поддержка разных типов уведомлений с красивыми анимациями
 */
'use strict'

class NotificationSystem {
  constructor() {
    this.autoHideTimeout = 5000
    this.container = null
    this.notifications = []
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
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        pointer-events: none;
        width: max-content;
        max-width: calc(100vw - 32px);
      }

      .bb-notification {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 14px 9px 10px;
        background: rgba(10, 14, 28, 0.86);
        backdrop-filter: blur(28px) saturate(180%);
        -webkit-backdrop-filter: blur(28px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 100px;
        color: rgba(255, 255, 255, 0.92);
        font-size: 13px;
        font-weight: 450;
        letter-spacing: 0.01em;
        pointer-events: auto;
        position: relative;
        overflow: hidden;
        transform: translateY(-12px) scale(0.94);
        opacity: 0;
        transition:
          transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
          opacity 0.22s ease;
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.45),
          0 1px 0 rgba(255, 255, 255, 0.05) inset;
        white-space: nowrap;
      }

      .bb-notification.show {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      .bb-notification.removing {
        transform: translateY(-8px) scale(0.96);
        opacity: 0;
        transition:
          transform 0.22s ease-in,
          opacity 0.18s ease-in;
      }

      /* Dot indicator */
      .bb-notification-icon {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
        font-size: 0;
        line-height: 0;
      }

      .bb-notification.success .bb-notification-icon {
        background: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
        animation: dotPulse 2.4s ease-in-out infinite;
      }
      .bb-notification.error .bb-notification-icon {
        background: #ef4444;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
        animation: dotPulse 1.6s ease-in-out infinite;
      }
      .bb-notification.warning .bb-notification-icon {
        background: #f59e0b;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
        animation: dotPulse 1.8s ease-in-out infinite;
      }
      .bb-notification.info .bb-notification-icon {
        background: #60a5fa;
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
        animation: dotPulse 2.4s ease-in-out infinite;
      }

      @keyframes dotPulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
        50%       { box-shadow: 0 0 0 6px rgba(255,255,255,0.0); }
      }

      /* Content */
      .bb-notification-content {
        flex: 1;
        display: flex;
        align-items: baseline;
        gap: 5px;
      }

      .bb-notification-title {
        font-weight: 600;
        font-size: 13px;
        line-height: 1;
        opacity: 0.55;
      }

      .bb-notification-message {
        font-size: 13px;
        line-height: 1;
        opacity: 0.92;
      }

      /* Only show title separator when both exist */
      .bb-notification-title:not(:empty) + .bb-notification-message::before {
        content: '·';
        margin-right: 5px;
        opacity: 0.35;
      }

      /* Close button */
      .bb-notification-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.25);
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 50px;
        transition: color 0.15s ease, background 0.15s ease;
        flex-shrink: 0;
        margin-left: 2px;
      }

      .bb-notification-close:hover {
        color: rgba(255, 255, 255, 0.7);
        background: rgba(255, 255, 255, 0.08);
      }

      /* Progress line at bottom of pill */
      .bb-notification-progress {
        position: absolute;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        height: 2px;
        border-radius: 0 0 100px 100px;
        transition: width 0.1s linear;
      }

      .bb-notification.success .bb-notification-progress  { background: #10b981; }
      .bb-notification.error .bb-notification-progress    { background: #ef4444; }
      .bb-notification.warning .bb-notification-progress  { background: #f59e0b; }
      .bb-notification.info .bb-notification-progress     { background: #60a5fa; }

      /* Mobile */
      @media (width <= 480px) {
        .bb-notification-container {
          top: 12px;
          max-width: calc(100vw - 24px);
        }
        .bb-notification {
          white-space: normal;
          max-width: 320px;
        }
      }

      /* Light theme */
      .light-theme .bb-notification {
        background: rgba(255, 255, 255, 0.9);
        border-color: rgba(0, 0, 0, 0.07);
        color: #0f172a;
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.12),
          0 1px 0 rgba(255, 255, 255, 0.9) inset;
      }

      .light-theme .bb-notification-title {
        opacity: 0.45;
      }

      .light-theme .bb-notification-message {
        opacity: 0.85;
      }

      .light-theme .bb-notification-close {
        color: rgba(0, 0, 0, 0.25);
      }

      .light-theme .bb-notification-close:hover {
        color: rgba(0, 0, 0, 0.6);
        background: rgba(0, 0, 0, 0.06);
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
    const duplicate = this.notifications.find(
      (n) => n.config?.message === config.message
    )
    if (duplicate) {
      if (
        duplicate.config?.type === config.type &&
        (duplicate.config?.title || '') === (config.title || '')
      ) {
        return
      }
      this.hide(duplicate)
    }
    const notification = this.createNotification(config)
    this.notifications.push(notification)
    this.container.appendChild(notification.element)
    setTimeout(() => {
      notification.element.classList.add('show')
    }, 10)
    if (config.duration > 0) {
      notification.hideTimeout = setTimeout(() => {
        this.hide(notification)
      }, config.duration)
    }
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
    const iconElement = document.createElement('div')
    iconElement.className = 'bb-notification-icon'
    const content = document.createElement('div')
    content.className = 'bb-notification-content'
    // Skip emoji/symbol titles — dot indicator handles the type signal
    const emojiPattern = /^[\u{1F000}-\u{1FFFF}]/u
    // eslint-disable-next-line no-misleading-character-class
    const symbolPattern = /^[⚠️❌✅ℹ️]/
    const isSymbolTitle = config.title && (emojiPattern.test(config.title) || symbolPattern.test(config.title))
    if (config.title && !isSymbolTitle) {
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
    const close = document.createElement('button')
    close.className = 'bb-notification-close'
    close.textContent = '\u00D7'
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
    if (!notification?.element) return
    clearTimeout(notification.hideTimeout)
    notification.element.classList.add('removing')
    setTimeout(() => {
      if (notification.element?.parentElement) {
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
}
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

module.exports = NotificationSystem
