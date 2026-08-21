'use strict';
/**
 * Notifications & warnings - critical error display, toast notifications,
 * viewer connection warnings, and click-guard for controls.
 * @module application/controller/notifications
 */

function _t(key, fallback) {
  const v = globalThis.i18n?.t(key);
  return v && v !== key ? v : fallback;
}

function showCriticalError(title, message) {
  if (typeof globalThis.HintBanner === 'function') {
    const container = document.getElementById('errorStatesContainer');
    if (container) container.style.display = 'block';
    new globalThis.HintBanner({
      container: container || document.body,
      type: 'error',
      title: title,
      message: message,
      ctaLabel: _t('hint.createNewSession', 'Create new session'),
      onCta: () => {
        globalThis.location.href = '/';
      },
      closeLabel: _t('hint.close', 'Close hint'),
      ariaLive: 'assertive',
    }).show();
    return;
  }
  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('critical-error', {
      title: title,
      message: message,
      actions: [
        {
          label: _t('hint.createNewSession', 'Create new session'),
          callback: () => {
            globalThis.location.href = '/';
          },
        },
        {
          label: _t('viewer.reload', 'Reload page'),
          callback: () => globalThis.location.reload(),
        },
      ],
    });
  } else if (globalThis.emdrErrorOverlay) {
    globalThis.emdrErrorOverlay.show({
      title,
      message,
      actionText: _t('viewer.reload', 'Reload page'),
      onAction: () => globalThis.location.reload(),
    });
  } else {
    alert(`${title}\n\n${message}`);
  }
}

function showNotification(message, type = 'info') {
  try {
    if (globalThis.errorStateManager?.show) {
      const t = globalThis.i18n?.t.bind(globalThis.i18n);
      const titles = {
        info: t?.('controller.info') || 'Info',
        success: t?.('controller.success') || 'Success',
        warning: t?.('controller.warning') || 'Warning',
        error: t?.('controller.errored') || 'Error',
      };
      globalThis.errorStateManager.show(`notification-${type}`, {
        title: titles[type] || 'Info',
        message: message,
        duration: type === 'error' ? 0 : 4000,
      });
    } else if (globalThis.showSuccessToast && type === 'success') {
      globalThis.showSuccessToast(message);
    } else {
      if (type === 'error') {
        alert(`Ошибка: ${message}`);
      }
    }
  } catch (error) {
    console.error('Error showing notification:', error);
    if (type === 'error') {
      alert(message);
    }
  }
}

function showViewerNotConnectedWarning() {
  if (globalThis.__current?.isInitializing) return;

  const title = _t(
    'controller.viewerNotConnectedWarning',
    'Viewer not connected',
  );
  const message = _t(
    'controller.viewerNotConnectedMessage',
    'Share the viewer link with your client so they can join the session.',
  );

  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('viewer-not-connected', {
      title: title,
      message: message,
      duration: 8000,
    });
  } else {
    showNotification(`${title}: ${message}`, 'warning');
  }
}

function showViewerSizeNotReadyWarning() {
  if (globalThis.__current?.isInitializing) return;

  const title = _t('controller.viewerSizeNotReadyTitle', 'Screen size unknown');
  const message = _t(
    'controller.viewerSizeNotReadyMessage',
    'Waiting for viewer screen size. Please wait a moment and try again.',
  );

  if (globalThis.errorStateManager?.show) {
    globalThis.errorStateManager.show('viewer-size-not-ready', {
      title: title,
      message: message,
      duration: 6000,
    });
  } else {
    showNotification(`${title}: ${message}`, 'warning');
  }
}

function requireViewerConnection(action, showWarning = true) {
  if (!globalThis.__current?.viewerConnected) {
    if (showWarning) {
      showViewerNotConnectedWarning();
    }
    return false;
  }
  if (typeof action === 'function') {
    action();
  }
  return true;
}

function initViewerConnectionWarnings() {
  const main = document.querySelector('main.wrap');
  if (!main || main._viewerGuardAdded) return;
  main._viewerGuardAdded = true;
  main.addEventListener(
    'click',
    (event) => {
      if (globalThis.__current?.viewerConnected) return;
      if (globalThis.__current?.isInitializing) return;
      const t = event.target;
      const inControl = t.closest(
        '.controls-card, .session-actions-row, #presetControls, .presets-details, #previewFsPanel',
      );
      if (!inControl) return;
      const isExempt = t.closest(
        '.link-group, #autoStopRow, .session-stats-row, .drag-handle, #toggleDebugBtn, .fs-close-btn, .fs-panel-header',
      );
      if (isExempt) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      showViewerNotConnectedWarning();
    },
    true,
  );
}

function toggleDebugOverlay() {
  if (globalThis.BBDebug && typeof globalThis.BBDebug.toggle === 'function') {
    globalThis.BBDebug.toggle();
  }
}

const ControllerNotifications = {
  showCriticalError,
  showNotification,
  showViewerNotConnectedWarning,
  showViewerSizeNotReadyWarning,
  requireViewerConnection,
  initViewerConnectionWarnings,
  toggleDebugOverlay,
};

module.exports = ControllerNotifications;
