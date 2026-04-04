/**
 * Integrated Error State System
 * Displays errors as part of the UI design, not as separate notifications
 */

class ErrorStateManager {
  constructor() {
    this.errors = new Map();
    this.container = null;
  }

  init(containerId = 'errorStatesContainer') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = containerId;
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show an error message with optional actions
   * @param {string} id - Unique error identifier
   * @param {Object} config - { title, message, actions?, duration? }
   */
  show(id, config) {
    const defaults = {
      title: 'Error',
      message: '',
      actions: [],
      duration: 0, // 0 = persist until dismissed
    };

    const errorConfig = { ...defaults, ...config };

    // Clear duplicate errors
    if (this.errors.has(id)) {
      this.hide(id);
    }

    const errorEl = this.createErrorElement(id, errorConfig);
    this.container.appendChild(errorEl);
    this.container.style.display = 'block';

    // Trigger animation
    requestAnimationFrame(() => {
      errorEl.classList.add('show');
    });

    this.errors.set(id, { element: errorEl, config: errorConfig });

    // Auto-hide if duration is set
    if (errorConfig.duration > 0) {
      setTimeout(() => {
        this.hide(id);
      }, errorConfig.duration);
    }

    return errorEl;
  }

  /**
   * Create error element
   */
  createErrorElement(id, config) {
    const container = document.createElement('div');
    container.className = 'error-message';
    container.id = `error-${id}`;
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');

    const title = document.createElement('div');
    title.className = 'error-message-title';
    const titleIcon = document.createElement('span');
    titleIcon.textContent = '⚠️';
    const titleText = document.createElement('span');
    titleText.textContent = config.title;
    title.appendChild(titleIcon);
    title.appendChild(titleText);

    const message = document.createElement('div');
    message.className = 'error-message-text';
    message.textContent = config.message;

    container.appendChild(title);
    container.appendChild(message);

    // Actions
    if (config.actions && config.actions.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'error-message-actions';

      config.actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.className = 'error-message-btn';
        btn.textContent = action.label;
        btn.onclick = () => {
          action.callback();
          this.hide(id);
        };
        actions.appendChild(btn);
      });

      // Dismiss button
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'error-message-btn';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.onclick = () => this.hide(id);
      actions.appendChild(dismissBtn);

      container.appendChild(actions);
    }

    return container;
  }

  /**
   * Hide error by ID
   */
  hide(id) {
    const error = this.errors.get(id);
    if (!error) return;

    error.element.classList.remove('show');
    setTimeout(() => {
      if (error.element.parentElement) {
        error.element.remove();
      }
      this.errors.delete(id);

      // Hide container if no errors
      if (this.errors.size === 0) {
        this.container.style.display = 'none';
      }
    }, 200);
  }

  /**
   * Clear all errors
   */
  clearAll() {
    this.errors.forEach((error, id) => {
      this.hide(id);
    });
  }
}

/**
 * Integrated Error Bar for Viewer
 * Single persistent error banner at bottom
 */
class ViewerErrorBar {
  constructor() {
    this.bar = null;
    this.currentError = null;
  }

  init() {
    this.bar = document.getElementById('errorBar');
  }

  show(title, message, retryCallback = null) {
    if (!this.bar) return;

    document.getElementById('errorBarTitle').textContent = title;
    document.getElementById('errorBarMessage').textContent = message;

    const retryBtn = document.getElementById('errorBarRetry');
    if (retryCallback) {
      retryBtn.style.display = 'block';
      retryBtn.onclick = retryCallback;
    } else {
      retryBtn.style.display = 'none';
    }

    this.bar.classList.remove('hidden');
    this.bar.classList.add('show');
    this.currentError = { title, message };
  }

  hide() {
    if (this.bar) {
      this.bar.classList.remove('show');
      this.bar.classList.add('hidden');
      this.currentError = null;
    }
  }

  isVisible() {
    return this.bar && !this.bar.classList.contains('hidden');
  }
}

// Export globally
if (typeof globalThis !== 'undefined') {
  globalThis.errorStateManager = new ErrorStateManager();
  globalThis.viewerErrorBar = new ViewerErrorBar();

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      globalThis.errorStateManager.init();
      globalThis.viewerErrorBar.init();
    });
  } else {
    globalThis.errorStateManager.init();
    globalThis.viewerErrorBar.init();
  }
}
