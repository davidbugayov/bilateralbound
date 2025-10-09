/**
 * Common utilities and functions for BilateralBound
 * Упрощенная версия с использованием общих утилит
 */

// Условное логирование только в режиме разработки
const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
// Не переопределяем, если уже определены (из других скриптов)
const debugLog = (typeof window !== 'undefined' && window.debugLog) ? window.debugLog : () => {}
const debugError = (typeof window !== 'undefined' && window.debugError) ? window.debugError : () => {}
const debugWarn = (typeof window !== 'undefined' && window.debugWarn) ? window.debugWarn : () => {}

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

const toggleFullscreen = window.CommonUtils ? window.CommonUtils.toggleFullscreen : () => {}
const throttle = window.CommonUtils ? window.CommonUtils.throttle : () => {}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.debugLog = debugLog
  window.debugError = debugError
  window.debugWarn = debugWarn
  window.getSessionIdFromUrl = getSessionIdFromUrl
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
