'use strict'
/**
 * Common utilities and functions for BilateralBound
 * Упрощенная версия с использованием общих утилит
 */
// Условное логирование только в режиме разработки
const debugLog =
  typeof globalThis !== 'undefined' && globalThis.debugLog ? globalThis.debugLog : () => {}

const debugError =
  typeof globalThis !== 'undefined' && globalThis.debugError ? globalThis.debugError : () => {}

const debugWarn =
  typeof globalThis !== 'undefined' && globalThis.debugWarn ? globalThis.debugWarn : () => {}
// Используем общие утилиты, если доступны, иначе fallback
const getSessionIdFromUrl = globalThis.CommonUtils
  ? globalThis.CommonUtils.getSessionIdFromUrl
  : function () {
      const path = globalThis.location.pathname
      const parts = path.split('/')
      if ((parts[1] === 'c' || parts[1] === 's') && parts[2]) {
        return parts[2]
      }

      const urlParams = new URLSearchParams(globalThis.location.search)
      return urlParams.get('sessionId')
    }

const toggleFullscreen =
  globalThis.CommonUtils && typeof globalThis.CommonUtils.toggleFullscreen === 'function'
    ? globalThis.CommonUtils.toggleFullscreen
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

        const isFs = () =>
          !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement ||
            document.mozFullScreenElement
          )

        return async function toggleFullscreen(el) {
          try {
            if (!canFullscreen()) {
              return false
            }

            if (isFs()) {
              document.exitFullscreen?.() ||
              document.webkitExitFullscreen?.() ||
              document.msExitFullscreen?.() ||
              document.mozCancelFullScreen?.()
              return true
            } else {
              const target = el || document.documentElement
              await (
                target.requestFullscreen?.() ||
                target.webkitRequestFullscreen?.() ||
                target.msRequestFullscreen?.() ||
                target.mozRequestFullScreen?.() ||
                Promise.reject(new Error('Fullscreen API not available'))
              )
              return true
            }
          } catch {
            return false
          }
        }
      })()
const throttle =
  globalThis.CommonUtils && !(globalThis.CommonUtils instanceof Promise) && typeof globalThis.CommonUtils.throttle === 'function'
    ? globalThis.CommonUtils.throttle
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
if (typeof globalThis !== 'undefined') {
  globalThis.debugLog = debugLog
  globalThis.debugError = debugError
  globalThis.debugWarn = debugWarn
  globalThis.getSessionIdFromUrl = getSessionIdFromUrl
  globalThis.toggleFullscreen = toggleFullscreen
  globalThis.throttle = throttle
  // Единые типы WS-сообщений (без изменения логики)
  globalThis.WS_MSG = Object.freeze({
    controllerUpdate: 'controller_update',
    heartbeat: 'heartbeat',
    initialState: 'initial_state',
    stateUpdate: 'state_update',
    viewerStatus: 'viewer_status',
    netMetrics: 'net_metrics'
  })
}

class ThemeManager {
  constructor() {
    this.themeKey = 'bb_theme'
    this.init()
  }

  init() {
    this.loadTheme()
    this.setupThemeToggle()
  }

  loadTheme() {
    const savedTheme = localStorage.getItem(this.themeKey) || 'dark'
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme')
    }
  }

  toggleTheme() {
    const body = document.body
    const isLight = body.classList.contains('light-theme')
    if (isLight) {
      // Сейчас светлая тема - переключаем на темную
      body.classList.remove('light-theme')
      localStorage.setItem(this.themeKey, 'dark')
        globalThis.showSuccessNotification?.('Тёмная тема активирована')
    } else {
      // Сейчас темная тема - переключаем на светлую
      body.classList.add('light-theme')
      localStorage.setItem(this.themeKey, 'light')
        globalThis.showSuccessNotification?.('Светлая тема активирована')
    }
  }

  setupThemeToggle() {
    const toggleBtn = document.getElementById('themeToggleBtn')
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleTheme())
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  globalThis.themeManager = new ThemeManager()
})
