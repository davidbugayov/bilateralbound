/**
 * Common utilities and functions for BilateralBound
 * Упрощенная версия с использованием общих утилит
 */

// Условное логирование только в режиме разработки
const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const debugLog = DEBUG ? (...args) => console.log(...args) : () => {}
const debugError = DEBUG ? (...args) => console.error(...args) : () => {}
const debugWarn = DEBUG ? (...args) => console.warn(...args) : () => {}

// Используем общие утилиты, если доступны, иначе fallback
const getSessionIdFromUrl = window.CommonUtils
  ? window.CommonUtils.getSessionIdFromUrl
  : function () {
    const path = window.location.pathname
    const parts = path.split('/')
    if ((parts[1] === 'c' || parts[1] === 's') && parts[2]) {
      return parts[2]
    }
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('sessionId')
  }

const toggleFullscreen = window.CommonUtils
  ? window.CommonUtils.toggleFullscreen
  : function (element = document.documentElement) {
    if (!document.fullscreenElement) {
      element.requestFullscreen().catch(err => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`)
      })
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

const throttle = window.CommonUtils
  ? window.CommonUtils.throttle
  : function (func, limit) {
    let inThrottle
    return function () {
      const args = arguments
      const context = this
      if (!inThrottle) {
        func.apply(context, args)
        inThrottle = true
        setTimeout(() => { inThrottle = false }, limit)
      }
    }
  }

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.debugLog = debugLog
  window.debugError = debugError
  window.debugWarn = debugWarn
  window.getSessionIdFromUrl = getSessionIdFromUrl
  window.toggleFullscreen = toggleFullscreen
  window.throttle = throttle
  // Единые типы WS-сообщений (без изменения логики)
  window.WS_MSG = Object.freeze({
    controllerUpdate: 'controller_update',
    heartbeat: 'heartbeat',
    initialState: 'initial_state',
    stateUpdate: 'state_update',
    viewerStatus: 'viewer_status',
    netMetrics: 'net_metrics'
  })
}
