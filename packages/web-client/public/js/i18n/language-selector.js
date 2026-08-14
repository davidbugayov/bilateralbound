'use strict'

/**
 * Language Selector Manager with i18n Integration
 * Handles multi-language switching and page content translation
 * Uses shared constants from constants/i18n-constants.js
 */

const LanguageSelector = (function () {
  // Use shared constants or fallback to inline values (for backwards compatibility)
  const constants = globalThis.I18nConstants || {
    LANGUAGE_NAMES: {
      en: 'English',
      ru: 'Русский',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      pt: 'Português',
      ja: '日本語',
      zh: '中文'
    },
    SUPPORTED_LANGUAGES: ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh'],
    STORAGE_KEY: 'emdr-language',
    isSupported: (lang) => constants.SUPPORTED_LANGUAGES.includes(lang),
    saveLanguage: (lang) => {
      try {
        localStorage.setItem(constants.STORAGE_KEY, lang)
      } catch {
        /* ignore */
      }
    }
  }

  const languageNames = constants.LANGUAGE_NAMES
  const supportedLanguages = new Set(constants.SUPPORTED_LANGUAGES)

  function init() {
    const btn = document.getElementById('languageSelectorBtn')
    const dropdown = document.getElementById('languageDropdown')
    const options = document.querySelectorAll('.language-option')

    if (!btn || !dropdown || options.length === 0) {
      return
    }

    const currentLang = detectCurrentLanguage()
    updateCurrentLanguage(currentLang)

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isHidden = dropdown.hasAttribute('hidden')
      if (isHidden) {
        dropdown.removeAttribute('hidden')
        btn.setAttribute('aria-expanded', 'true')
      } else {
        dropdown.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
      }
    })

    for (const option of options) {
      option.addEventListener('click', (e) => {
        e.preventDefault()
        const lang = option.dataset.lang
        changeLanguage(lang)
        dropdown.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
      })

      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const lang = option.dataset.lang
          changeLanguage(lang)
          dropdown.setAttribute('hidden', '')
          btn.setAttribute('aria-expanded', 'false')
        } else if (e.key === 'Escape') {
          dropdown.setAttribute('hidden', '')
          btn.setAttribute('aria-expanded', 'false')
          btn.focus()
        }
      })
    }

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.setAttribute('hidden', '')
        btn.setAttribute('aria-expanded', 'false')
      }
    })

    document.addEventListener('keydown', (e) => {
      if (btn.getAttribute('aria-expanded') === 'true') {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const activeOption = dropdown.querySelector('[role="option"]:focus')
          const allOptions = Array.from(
            dropdown.querySelectorAll('[role="option"]')
          )
          const currentIndex = activeOption
            ? allOptions.indexOf(activeOption)
            : -1
          const nextIndex = (currentIndex + 1) % allOptions.length
          allOptions[nextIndex].focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          const activeOption = dropdown.querySelector('[role="option"]:focus')
          const allOptions = Array.from(
            dropdown.querySelectorAll('[role="option"]')
          )
          const currentIndex = activeOption
            ? allOptions.indexOf(activeOption)
            : 0
          const prevIndex =
            currentIndex === 0 ? allOptions.length - 1 : currentIndex - 1
          allOptions[prevIndex].focus()
        }
      }
    })
  }

  function detectCurrentLanguage() {
    const params = new URLSearchParams(globalThis.location.search)
    const langParam = params.get('lang')
    if (langParam && supportedLanguages.has(langParam)) {
      localStorage.setItem('emdr-language', langParam)
      return langParam
    }

    const savedLang = localStorage.getItem('emdr-language')
    if (savedLang && supportedLanguages.has(savedLang)) {
      return savedLang
    }

    // Domain default comes before browser language: .ru → ru, .online → en
    const hostname = globalThis.location?.hostname || ''
    if (hostname.includes('emdrbilateral.ru')) {
      localStorage.setItem('emdr-language', 'ru')
      return 'ru'
    }
    if (hostname.includes('emdrbilateral.online')) {
      localStorage.setItem('emdr-language', 'en')
      return 'en'
    }

    const browserLang = navigator.language.split('-')[0].toLowerCase()
    if (supportedLanguages.has(browserLang)) {
      localStorage.setItem('emdr-language', browserLang)
      return browserLang
    }

    // Default to English if no match found
    localStorage.setItem('emdr-language', 'en')
    return 'en'
  }

  function updateCurrentLanguage(lang) {
    const label = document.getElementById('currentLanguageLabel')
    const options = document.querySelectorAll('.language-option')

    if (label) {
      // Получаем название языка из i18n, если доступно и перевод существует
      const langNameKey = `common.lang.${lang}`
      let translatedName = null
      if (globalThis.i18n?.t) {
        const result = globalThis.i18n.t(langNameKey)
        // Проверяем, что перевод не вернул сам ключ (что означает отсутствие перевода)
        if (result && result !== langNameKey) {
          translatedName = result
        }
      }
      // Используем перевод или fallback на hardcoded languageNames
      label.textContent = translatedName || languageNames[lang] || lang
    }

    for (const option of options) {
      const optionLang = option.dataset.lang
      if (optionLang === lang) {
        option.classList.add('language-option--active')
        option.setAttribute('aria-selected', 'true')
      } else {
        option.classList.remove('language-option--active')
        option.setAttribute('aria-selected', 'false')
      }
    }

    document.documentElement.lang = lang
  }

  /**
   * Safe setter for i18n language across different implementations.
   * Tries async changeLanguage(lang) -> sync setLanguage(lang) -> direct assignment.
   * Returns a Promise that resolves to true/false depending on success.
   */
  async function safeSetI18nLanguage(lang) {
    const ii = globalThis?.i18n
    if (!ii) return false

    // Prefer async changeLanguage if available
    if (typeof ii.changeLanguage === 'function') {
      try {
        const res = await Promise.resolve(ii.changeLanguage(lang))
        return !!res
      } catch {
        // Fallback to next option
      }
    }

    // Fallback: if a legacy synchronous setLanguage exists, call it but guard errors
    if (typeof ii.setLanguage === 'function') {
      try {
        const res = ii.setLanguage(lang)
        return !!res
      } catch {
        // Fallback to next option
      }
    }

    // Last resort: set property directly if present
    if (ii.currentLanguage !== undefined) {
      try {
        ii.currentLanguage = lang
        if (typeof ii.applyTranslations === 'function') {
          try {
            ii.applyTranslations()
          } catch {
            /* ignore */
          }
        }
        // Emit language change event for fallback path
        try {
          if (typeof CustomEvent === 'function') {
            globalThis.dispatchEvent(
              new CustomEvent('i18nLanguageChanged', { detail: { lang } })
            )
          } else if (typeof Event === 'function') {
            // eslint-disable-next-line no-undef
            globalThis.dispatchEvent(new Event('i18nLanguageChanged'))
          }
        } catch {
          /* ignore event dispatch errors */
        }
        return true
      } catch {
        return false
      }
    }

    return false
  }

  function changeLanguage(lang) {
    if (!supportedLanguages.has(lang)) {
      return
    }

    // Сохраняем выбор
    localStorage.setItem('emdr-language', lang)

    // Обновляем UI селектора языка
    updateCurrentLanguage(lang)

    // Обновляем i18n - это автоматически обновит все элементы с data-i18n
    safeSetI18nLanguage(lang)
      .then((ok) => {
        if (ok) {
          // Обновляем title страницы
          if (globalThis.i18n?.t) {
            document.title = globalThis.i18n.t('home.title')
          }
        }
      })
      .catch(() => {
        // Silently fail
      })

    // Обновляем URL
    const url = new URL(globalThis.location.href)
    url.searchParams.set('lang', lang)
    globalThis.history.replaceState({}, '', url)

    // Синхронизируем язык с Viewer через API (только для Controller)
    if (globalThis.location.pathname.includes('/c/')) {
      const sessionId =
        globalThis.getSessionIdFromUrl?.() || extractSessionIdFromUrl()
      if (sessionId) {
        syncLanguageToViewer(sessionId, lang).catch((err) => {
          console.warn(
            '[LanguageSelector] Failed to sync language to Viewer:',
            err.message
          )
        })
      }
    }
  }

  /**
   * Extract sessionId from URL path
   */
  function extractSessionIdFromUrl() {
    const match = globalThis.location.pathname.match(/\/[cv]\/([a-f0-9]+)/)
    return match ? match[1] : null
  }

  /**
   * Sync language to Viewer via API
   */
  async function syncLanguageToViewer(sessionId, language) {
    try {
      const response = await fetch(`/api/session/${sessionId}/language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log(
        '[LanguageSelector] ✅ Language synced to Viewer:',
        data.language
      )
    } catch (error) {
      console.error('[LanguageSelector] ❌ Failed to sync language:', error)
      throw error
    }
  }

  return {
    init
  }
})();

// Инициализируем после готовности i18n и DOM
(function () {
  if (globalThis?.window === undefined) return

  let initialized = false
  let domListenerAdded = false

  const initSelector = () => {
    if (initialized) return
    initialized = true
    LanguageSelector.init()
  }

  // Если i18n уже готов, инициализируем сразу
  if (globalThis.i18n?.isReady) {
    if (document.readyState === 'loading') {
      if (!domListenerAdded) {
        domListenerAdded = true
        document.addEventListener('DOMContentLoaded', initSelector, {
          once: true
        })
      }
    } else {
      initSelector()
    }
  } else {
    // Ждем события i18nReady
    globalThis.addEventListener(
      'i18nReady',
      () => {
        if (document.readyState === 'loading') {
          if (!domListenerAdded) {
            domListenerAdded = true
            document.addEventListener('DOMContentLoaded', initSelector, {
              once: true
            })
          }
        } else {
          initSelector()
        }
      },
      { once: true }
    )

    // Fallback на случай если событие не сработает
    setTimeout(() => {
      if (!initialized) {
        if (document.readyState === 'loading') {
          if (!domListenerAdded) {
            domListenerAdded = true
            document.addEventListener('DOMContentLoaded', initSelector, {
              once: true
            })
          }
        } else {
          initSelector()
        }
      }
    }, 2000)
  }
})()

// Expose globally for debugging
if (typeof globalThis !== 'undefined') {
  globalThis.LanguageSelector = LanguageSelector
}

