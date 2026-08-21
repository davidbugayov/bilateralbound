/**
 * Simple success toast notification system
 * Minimal, non-blocking feedback for positive actions
 */

class SuccessToast {
  constructor() {
    this.container = null;
    this.autoHideTimeout = 3000;
    this.init();
  }

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.className = 'success-toast-container';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
    this.setupStyles();
  }

  setupStyles() {
    if (document.getElementById('success-toast-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'success-toast-styles';
    styles.textContent = `
      .success-toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 350px;
      }

      .success-toast {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%);
        color: #f0fdf4;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        pointer-events: auto;
        animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .success-toast.removing {
        animation: slideOutRight 0.2s ease-in-out;
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }

      .success-toast-icon {
        font-size: 16px;
        flex-shrink: 0;
      }

      .success-toast-text {
        flex: 1;
      }

      /* Light theme */
      body.light-theme .success-toast {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(21, 128, 61, 0.95) 100%);
        color: #166534;
        border-color: rgba(34, 197, 94, 0.3);
      }

      @media (max-width: 480px) {
        .success-toast-container {
          top: 10px;
          right: 10px;
          left: 10px;
          max-width: none;
        }
        .success-toast {
          font-size: 12px;
          padding: 10px 14px;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  show(message, duration = this.autoHideTimeout) {
    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.setAttribute('role', 'status');

    const icon = document.createElement('div');
    icon.className = 'success-toast-icon';
    icon.textContent = '✅';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('div');
    text.className = 'success-toast-text';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 200);
      }, duration);
    }
  }

  success(message) {
    this.show(message);
  }
}

// Export globally
if (typeof globalThis !== 'undefined') {
  globalThis.successToast = new SuccessToast();
  globalThis.showSuccessToast = (message) =>
    globalThis.successToast.success(message);
}
