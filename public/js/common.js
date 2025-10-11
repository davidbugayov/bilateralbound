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

const toggleFullscreen = (window.CommonUtils && typeof window.CommonUtils.toggleFullscreen === 'function')
  ? window.CommonUtils.toggleFullscreen
  : (function () {
      // Robust fullscreen toggle fallback using the Fullscreen API
      const canFullscreen = () => {
        const docEl = document.documentElement
        return (
          docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.msRequestFullscreen ||
          docEl.mozRequestFullScreen
        )
      }

      const isFs = () => !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement ||
        document.mozFullScreenElement
      )

      const enter = (el) => {
        const target = el || document.documentElement
        return (
          target.requestFullscreen?.() ||
          target.webkitRequestFullscreen?.() ||
          target.msRequestFullscreen?.() ||
          target.mozRequestFullScreen?.() ||
          Promise.reject(new Error('Fullscreen API not available'))
        )
      }

      const exit = () => (
        document.exitFullscreen?.() ||
        document.webkitExitFullscreen?.() ||
        document.msExitFullscreen?.() ||
        document.mozCancelFullScreen?.() ||
        Promise.resolve()
      )

      return function toggleFullscreen (el) {
        try {
          if (!canFullscreen()) {
            return Promise.resolve(false)
          }
          if (isFs()) {
            return exit().then(() => true).catch(() => false)
          } else {
            return enter(el).then(() => true).catch(() => false)
          }
        } catch (_) {
          return Promise.resolve(false)
        }
      }
    })()
const throttle = (window.CommonUtils && typeof window.CommonUtils.throttle === 'function')
  ? window.CommonUtils.throttle
  : function (fn, wait = 100) {
    if (typeof fn !== 'function') return () => {}
    let last = 0
    let timeoutId = null
    let trailingArgs = null
    return function (...args) {
      const now = Date.now()
      const remaining = wait - (now - last)
      trailingArgs = args
      if (remaining <= 0 || remaining > wait) {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        last = now
        fn.apply(this, args)
      } else if (!timeoutId) {
        timeoutId = setTimeout(() => {
          last = Date.now()
          timeoutId = null
          fn.apply(this, trailingArgs)
          trailingArgs = null
        }, remaining)
      }
    }
  }

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
