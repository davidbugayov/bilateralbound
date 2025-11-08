'use strict'
/**
 * Common utilities and functions for BilateralBound
 * Упрощенная версия с использованием общих утилит
 */
/**
 * Условное логирование только в режиме разработки.
 * @param {...*} args - Аргументы для логирования.
 */
const debugLog =
  typeof globalThis !== 'undefined' && globalThis.debugLog ? globalThis.debugLog : () => {}

/**
 * Логирует ошибки в режиме разработки.
 * @param {...*} args - Аргументы для логирования.
 */
const debugError =
  typeof globalThis !== 'undefined' && globalThis.debugError ? globalThis.debugError : () => {}

/**
 * Логирует предупреждения в режиме разработки.
 * @param {...*} args - Аргументы для логирования.
 */
const debugWarn =
  typeof globalThis !== 'undefined' && globalThis.debugWarn ? globalThis.debugWarn : () => {}
/**
 * Извлекает ID сессии из URL.
 * @returns {string|null} ID сессии или null, если не найден.
 */
const getSessionIdFromUrl =
  globalThis.CommonUtils?.getSessionIdFromUrl &&
  typeof globalThis.CommonUtils.getSessionIdFromUrl === 'function'
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
  globalThis.CommonUtils?.toggleFullscreen &&
  typeof globalThis.CommonUtils.toggleFullscreen === 'function'
    ? globalThis.CommonUtils.toggleFullscreen
    : (function () {
        // Robust fullscreen toggle fallback using the Fullscreen API
        const canFullscreen = () => {
          const docEl = document.documentElement
          return !!(
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

        /**
         * Toggles fullscreen mode for a given element or the entire page.
         * Uses the Fullscreen API with fallbacks for different browsers.
         * @param {HTMLElement} [el] - The element to make fullscreen. Defaults to document.documentElement.
         * @returns {Promise<boolean>} A promise that resolves to true if the state changed, false otherwise.
         */
        return async function toggleFullscreen(el) {
          try {
            if (!canFullscreen()) {
              return false
            }

            if (isFs()) {
              const exitFullscreen = document.exitFullscreen ||
                document.webkitExitFullscreen ||
                document.msExitFullscreen ||
                document.mozCancelFullScreen
              await exitFullscreen?.call(document)
            } else {
              const target = el || document.documentElement
              const requestFullscreen = target.requestFullscreen ||
                target.webkitRequestFullscreen ||
                target.msRequestFullscreen ||
                target.mozRequestFullScreen
              await requestFullscreen?.call(target)
            }
            return true
          } catch (err) {
            debugError('Fullscreen API error:', err)
            return false
          }
        }
      })()
/**
 * Создает throttled-функцию, которая вызывает fn не чаще одного раза за указанный период.
 * @param {Function} fn - Функция для throttling.
 * @param {number} [wait=100] - Период ожидания в миллисекундах.
 * @returns {Function} Новая throttled-функция.
 */
const throttle =
  globalThis.CommonUtils && typeof globalThis.CommonUtils.throttle === 'function'
    ? globalThis.CommonUtils.throttle
    : function throttleImplementation(fn, wait = 100) {
        if (typeof fn !== 'function') return () => {}

        let last = 0
        let timeoutId = null
        let trailingArgs = null

        return function throttled(...args) {
          const now = Date.now()
          const remaining = wait - (now - last)
          trailingArgs = args

          if (remaining <= 0 || remaining > wait) {
            // Немедленное выполнение
            if (timeoutId) {
              clearTimeout(timeoutId)
              timeoutId = null
            }
            last = now
            fn.apply(this, args)
          } else if (timeoutId === null) {
            // Отложенное выполнение
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

/**
 * Manages the theme (light/dark) of the application.
 * @class ThemeManager
 */
class ThemeManager {
  /**
   * The key used to store the theme preference in localStorage.
   * @type {string}
   * @private
   */
  themeKey = 'bb_theme'

  /**
   * Initializes the ThemeManager.
   * @constructor
   */
  constructor() {
    this.init()
  }

  /**
   * Loads the saved theme and sets up the theme toggle button.
   * @private
   */
  init() {
    this.setupThemeToggle()
    this.loadTheme()
  }

  /**
   * Loads the theme from localStorage and applies it to the body.
   * @private
   */
  loadTheme() {
    const savedTheme = localStorage.getItem(this.themeKey) || 'dark'

    // Сначала очищаем все классы тем
    document.body.classList.remove('dark-theme', 'light-theme')

    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme')
      this.updateThemeButton('🌙')
    } else if (savedTheme === 'light') {
      document.body.classList.add('light-theme')
      this.updateThemeButton('☀️')
    } else {
      // Fallback to dark theme
      document.body.classList.add('dark-theme')
      this.updateThemeButton('🌙')
    }
  }

  /**
   * Cycles through themes: dark -> light -> dark
   */
  toggleTheme() {
    const body = document.body
    const hasLightClass = body.classList.contains('light-theme')

    // Очищаем классы
    body.classList.remove('dark-theme', 'light-theme')

    if (hasLightClass) {
      // Была светлая - переход на темную
      body.classList.add('dark-theme')
      localStorage.setItem(this.themeKey, 'dark')
      this.updateThemeButton('🌙')
    } else {
      // Была темная - переход на светлую
      body.classList.add('light-theme')
      localStorage.setItem(this.themeKey, 'light')
      this.updateThemeButton('☀️')
    }
  }

  /**
   * Updates the theme toggle button text/icon
   * @private
   */
  updateThemeButton(text) {
    const btn = document.getElementById('themeToggleBtn')
    if (btn) {
      btn.textContent = text
    }
  }

  /**
   * Finds the theme toggle button and attaches a click event listener.
   * @private
   */
  setupThemeToggle() {
    const toggleBtn = document.getElementById('themeToggleBtn')
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleTheme())
    }
  }
}

/**
 * Копирует текст из элемента в буфер обмена.
 * @param {string} elementId - ID элемента, из которого нужно скопировать текст.
 * @param {string} successMessage - Сообщение, отображаемое при успешном копировании.
 */
/**
 * Копирует текст из элемента в буфер обмена.
 * @param {string} elementId - ID элемента, из которого нужно скопировать текст.
 * @param {string} successMessage - Сообщение, отображаемое при успешном копировании.
 */
async function copy(elementId, successMessage) {
  const element = document.getElementById(elementId)
  if (!element?.value) {
    if (globalThis.showErrorNotification) {
      globalThis.showErrorNotification('Ошибка', 'Элемент для копирования не найден.')
    } else {
      console.error('Элемент для копирования не найден:', elementId)
    }
    return
  }

  try {
    await navigator.clipboard.writeText(element.value)
    if (globalThis.showSuccessNotification) {
      globalThis.showSuccessNotification(successMessage || 'Текст скопирован!')
    }
  } catch (err) {
    console.error('Ошибка копирования:', err)
    if (globalThis.showErrorNotification) {
      globalThis.showErrorNotification('Ошибка копирования', 'Не удалось скопировать текст.')
    }
  }
}

/**
 * Navigates the user to the main page.
 */
function goBack() {
  window.location.href = '/'
}

document.addEventListener('DOMContentLoaded', () => {
  globalThis.themeManager = new ThemeManager()
})

if (typeof globalThis !== 'undefined') {
  globalThis.copy = copy
  globalThis.goBack = goBack
}
