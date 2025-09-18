/**
 * Общие утилиты для BilateralBound
 * Централизованные функции для переиспользования
 */

class CommonUtils {
  /**
   * Извлекает ID сессии из URL
   */
  static getSessionIdFromUrl() {
    const path = window.location.pathname;
    const parts = path.split('/');
    
    // Новый формат: /c/SESSION_ID или /s/SESSION_ID
    if ((parts[1] === 'c' || parts[1] === 's') && parts[2]) {
      return parts[2];
    }
    
    // Старый формат: ?sessionId=SESSION_ID
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('sessionId');
  }

  /**
   * Управляет полноэкранным режимом
   */
  static toggleFullscreen(element = document.documentElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        // Error attempting to enable fullscreen
      });
    } else {
      document.exitFullscreen();
    }
  }

  /**
   * Копирует текст в буфер обмена
   */
  static async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Failed to copy text
      return false;
    }
  }

  /**
   * Создает уведомление
   */
  static showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    if (type === 'success') {
      notification.style.background = '#10b981';
    } else if (type === 'error') {
      notification.style.background = '#ef4444';
    } else if (type === 'warning') {
      notification.style.background = '#f59e0b';
    } else {
      notification.style.background = '#3b82f6';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, duration);
  }

  /**
   * Дебаунс функция
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Троттлинг функция
   */
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Проверяет, является ли устройство мобильным
   */
  static isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Получает размеры экрана
   */
  static getScreenSize() {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  /**
   * Форматирует время
   */
  static formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
  }

  /**
   * Генерирует случайный ID
   */
  static generateId(length = 8) {
    return Math.random().toString(36).substr(2, length);
  }
}

// Добавляем CSS для анимаций уведомлений
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
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
  `;
  document.head.appendChild(style);
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.CommonUtils = CommonUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommonUtils;
}
