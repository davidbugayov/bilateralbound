/**
 * i18n Configuration
 * Handles multi-language support for Bilateral Bound
 * Uses shared constants from constants/i18n-constants.js when available
 */

(function (root) {
  // Use shared constants or fallback to inline values
  const constants = root.I18nConstants || {
    SUPPORTED_LANGUAGES: ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh'],
    DEFAULT_LANGUAGE: 'en',
    STORAGE_KEY: 'emdr-language',
    detectFromDomain: () => {
      const hostname = typeof location !== 'undefined' ? location.hostname : ''
      if (hostname.includes('emdrbilateral.ru')) return 'ru'
      if (hostname.includes('emdrbilateral.online')) return 'en'
      return 'en'
    }
  }

  // Simple i18n manager for client-side
  const I18n = {
    currentLanguage: constants.DEFAULT_LANGUAGE,
    defaultLanguage: constants.DEFAULT_LANGUAGE,
    translations: {},
    supportedLanguages: constants.SUPPORTED_LANGUAGES,
    isReady: false,
    _readyCallbacks: [],

    ready(callback) {
      if (typeof callback !== 'function') return
      if (this.isReady) {
        callback()
        return
      }
      this._readyCallbacks.push(callback)
    },

    _notifyReady() {
      // Remove ALL anti-flash cloak elements (lang-preload.js creates one,
      // and privacy/offer HTML pages also have one — only removing the first
      // leaves the second in place, keeping content invisible)
      if (typeof document !== 'undefined') {
        document.querySelectorAll('#i18n-cloak').forEach((el) => el.remove())
        document.documentElement.classList.add('i18n-ready')
      }


      if (this.isReady) return
      this.isReady = true
      while (this._readyCallbacks.length) {
        try {
          const cb = this._readyCallbacks.shift()
          cb()
        } catch (err) {
          // Silently ignore callback errors to prevent initialization blocking
          if (typeof globalThis !== 'undefined' && globalThis.debugError) {
            globalThis.debugError('i18n.ready callback error:', err)
          }
        }
      }
      if (typeof window !== 'undefined' && typeof Event === 'function') {
        // eslint-disable-next-line no-undef
        globalThis.dispatchEvent(new Event('i18nReady'))
      }
    },

    /**
     * Initialize i18n system
     */
    init: async function () {
      this.detectLanguage()
      if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
        globalThis.debugLog('[i18n] Detected language:', this.currentLanguage)
      }

      // Update document language immediately
      if (typeof document !== 'undefined') {
        document.documentElement.lang = this.currentLanguage
        document.documentElement.dataset.lang = this.currentLanguage
      }

      await this.loadTranslations()
      if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
        globalThis.debugLog(
          '[i18n] Translations loaded:',
          Object.keys(this.translations)
        )
      }

      // Apply translations in DOM after loading
      // If DOM is ready, apply immediately, otherwise wait for DOMContentLoaded
      if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
          // DOM is still loading, wait for it
          document.addEventListener(
            'DOMContentLoaded',
            () => {
              this.applyTranslations()
              this._notifyReady()
              // Применяем переводы еще раз с небольшой задержкой для динамически созданных элементов
              setTimeout(() => this.applyTranslations(), 100)
            },
            { once: true }
          )
        } else {
          // DOM is ready, apply now
          this.applyTranslations()
          this._notifyReady()
          // Применяем переводы еще раз с небольшой задержкой для динамически созданных элементов
          setTimeout(() => this.applyTranslations(), 100)
        }
      } else {
        this._notifyReady()
      }
      return this
    },

    /**
     * Detect language from multiple sources
     */
    detectLanguage: function () {
      // 1. Check URL parameter (highest priority)
      const params = new URLSearchParams(
        typeof globalThis !== 'undefined' &&
          globalThis.location &&
          globalThis.location.search
          ? globalThis.location.search
          : ''
      )
      const langParam = params.get('lang')
      if (langParam && this.supportedLanguages.includes(langParam)) {
        this.currentLanguage = langParam
        localStorage.setItem('emdr-language', langParam)
        return
      }

      // 2. Check localStorage (second priority) - сохраненный выбор пользователя
      const savedLang = localStorage.getItem('emdr-language')
      if (savedLang && this.supportedLanguages.includes(savedLang)) {
        this.currentLanguage = savedLang
        return
      }

      // 3. Check domain (third priority) - только для новых пользователей
      // Russian domain → Russian language
      // English domain → English language
      const hostname =
        typeof globalThis !== 'undefined' &&
        globalThis.location &&
        globalThis.location.hostname
          ? globalThis.location.hostname
          : ''
      if (hostname.includes('emdrbilateral.ru')) {
        this.currentLanguage = 'ru'
        localStorage.setItem('emdr-language', 'ru')
        return
      } else if (hostname.includes('emdrbilateral.online')) {
        this.currentLanguage = 'en'
        localStorage.setItem('emdr-language', 'en')
        return
      }

      // 4. Check browser language
      const browserLang = navigator.language.split('-')[0].toLowerCase()
      if (this.supportedLanguages.includes(browserLang)) {
        this.currentLanguage = browserLang
        localStorage.setItem('emdr-language', browserLang)
        return
      }

      // 5. Fallback to default English
      this.currentLanguage = this.defaultLanguage
      localStorage.setItem('emdr-language', this.defaultLanguage)
    },

    /**
     * Load translations from server.
     * Language is captured at call time to avoid a race condition where
     * currentLanguage changes during the async fetch, which would cause
     * translations for one language to be stored under a different key.
     */
    loadTranslations: async function () {
      // Capture language now — currentLanguage may change while we await the fetch
      const lang = this.currentLanguage
      try {
        const url = `/locales/${lang}/common.json`
        if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
          globalThis.debugLog('[i18n] Loading translations from:', url)
        }
        const response = await fetch(url)
        if (!response.ok) {
          // Log and trigger fallback without throwing (avoids throw-caught-locally lint warning)
          if (typeof globalThis !== 'undefined' && globalThis.debugError) {
            globalThis.debugError(
              `[i18n] Failed to load translations: ${response.statusText}`
            )
          }
          // If not English, switch to en and retry
          if (lang !== 'en') {
            this.currentLanguage = 'en'
            return await this.loadTranslations()
          }
          return false
        }
        this.translations[lang] = await response.json()
        if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
          globalThis.debugLog(
            '[i18n] Successfully loaded translations for:',
            lang
          )
        }
        return true
      } catch (error) {
        if (typeof globalThis !== 'undefined' && globalThis.debugError) {
          globalThis.debugError(
            `[i18n] Failed to load translations: ${error?.message || error}`
          )
        }
        // Fallback: load English if current language fails
        if (lang !== 'en') {
          this.currentLanguage = 'en'
          return await this.loadTranslations()
        }
        return false
      }
    },

    /**
     * Get translation by key with dot notation
     */
    t: function (key, options = {}) {
      // If not ready yet, return key without warning (during initialization)
      if (!this.isReady) {
        return key
      }

      const value = this.getValueByPath(
        this.translations[this.currentLanguage],
        key
      )

      if (!value) {
        // Check if translations object exists at all
        if (!this.translations[this.currentLanguage]) {
          if (typeof globalThis !== 'undefined' && globalThis.debugError) {
            globalThis.debugError(
              `No translations loaded for language: ${this.currentLanguage}`
            )
          }
        } else {
          if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
            globalThis.debugWarn(
              `Translation missing: ${key} (language: ${this.currentLanguage})`
            )
          }
        }
        return key
      }

      // Auto-inject VERSION from meta tag if placeholder exists
      if (typeof value === 'string' && value.includes('{{VERSION}}')) {
        const versionMeta = document.querySelector('meta[name="version"]')
        const version = versionMeta
          ? versionMeta.getAttribute('content')
          : 'dev'
        options.VERSION = `v${version}`
      }

      // Handle interpolation
      if (typeof value === 'string' && Object.keys(options).length > 0) {
        let result = value
        for (const [k, v] of Object.entries(options)) {
          result = result.replace(`{{${k}}}`, v)
        }
        return result
      }

      return value
    },

    /**
     * Get value from nested object using dot notation
     */
    getValueByPath: function (obj, path) {
      if (!obj) return null
      return path.split('.').reduce((current, part) => current?.[part], obj)
    },

    /**
     * Change current language
     */
    changeLanguage: async function (lang) {
      if (!this.supportedLanguages.includes(lang)) {
        if (typeof globalThis !== 'undefined' && globalThis.debugError) {
          globalThis.debugError(`Language '${lang}' is not supported`)
        }
        return false
      }
      this.currentLanguage = lang
      localStorage.setItem('emdr-language', lang)

      // Update document language immediately for accessibility
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang
        document.documentElement.dataset.lang = lang
      }

      // Attempt to load translations; do not throw on failure, just return boolean
      const ok = await this.loadTranslations()
      if (ok) {
        this.applyTranslations()
      } else {
        // If translations failed to load, still try to apply whatever is available
        this.applyTranslations()
      }

      // Notify listeners that language has changed so pages can react (e.g., update titles/meta)
      try {
        if (typeof CustomEvent === 'function') {
          globalThis.dispatchEvent(
            new CustomEvent('i18nLanguageChanged', { detail: { lang } })
          )
        } else {
          // Fallback for very old environments
          // eslint-disable-next-line no-undef
          globalThis.dispatchEvent(new Event('i18nLanguageChanged'))
        }
      } catch (err) {
        if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
          globalThis.debugWarn(
            'Failed to dispatch i18nLanguageChanged event',
            err
          )
        }
      }

      return !!ok
    },

    /**
     * Alias for changeLanguage for API consistency
     * Used when receiving language updates from server
     */
    setLanguage: async function (lang) {
      return this.changeLanguage(lang)
    },

    /**
     * Apply translations to DOM elements with data-i18n or data-i18n-attr attributes.
     * - elements with `data-i18n` will have their textContent replaced
     * - elements with `data-i18n-attr` will set attributes, e.g. data-i18n-attr="placeholder:home.placeholder"
     */
    applyTranslations: function () {
      try {
        const translations = this.translations[this.currentLanguage]
        if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
          globalThis.debugLog(
            '[i18n] Applying translations for language:',
            this.currentLanguage
          )
        }

        // Check if translations are loaded
        if (!translations || Object.keys(translations).length === 0) {
          if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
            globalThis.debugWarn(
              '[i18n] Translations not loaded yet, skipping applyTranslations'
            )
          }
          return
        }

        // Helper to get translation by key
        const get = (key) => {
          if (!key) return null
          let value = this.getValueByPath(translations, key)

          // Auto-inject VERSION from meta tag if placeholder exists
          if (typeof value === 'string' && value.includes('{{VERSION}}')) {
            const versionMeta = document.querySelector('meta[name="version"]')
            const version = versionMeta
              ? versionMeta.getAttribute('content')
              : 'dev'
            value = value.replace('{{VERSION}}', `v${version}`)
          }

          return value
        }

        // Replace textContent for data-i18n
        const nodes = document.querySelectorAll('[data-i18n]')
        if (typeof globalThis !== 'undefined' && globalThis.debugLog) {
          globalThis.debugLog(
            '[i18n] Found',
            nodes.length,
            'elements with data-i18n attribute'
          )
        }
        nodes.forEach((node) => {
          const key = node.getAttribute('data-i18n')
          const value = get(key)
          if (
            value !== null &&
            value !== undefined &&
            typeof value !== 'object'
          ) {
            // Проверяем, содержит ли перевод HTML-теги
            if (
              typeof value === 'string' &&
              (value.includes('<') || value.includes('>'))
            ) {
              // Если в переводе есть HTML, используем innerHTML
              node.innerHTML = value
            } else {
              // Иначе используем textContent для безопасности
              node.textContent = value
            }
          } else if (value === null || value === undefined) {
            if (typeof globalThis !== 'undefined' && globalThis.debugWarn) {
              globalThis.debugWarn('[i18n] Missing translation for key:', key)
            }
          }
        })

        // Handle attributes: data-i18n-attr="attrName:key.path;attr2:key2"
        const attrNodes = document.querySelectorAll('[data-i18n-attr]')
        attrNodes.forEach((node) => {
          const spec = node.getAttribute('data-i18n-attr')
          if (!spec) return
          // split by ; for multiple attr mappings
          spec.split(';').forEach((part) => {
            const [attr, key] = part.split(':').map((s) => s && s.trim())
            if (!attr || !key) return
            const value = get(key)
            if (value != null && typeof attr === 'string') {
              node.setAttribute(attr, value)
            }
          })
        })
      } catch (err) {
        if (typeof globalThis !== 'undefined' && globalThis.debugError) {
          globalThis.debugError('i18n.applyTranslations error:', err)
        }
      }
    }
  }

  // Export for CommonJS or attach to root
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = I18n
  } else {
    root.i18n = I18n
  }

  // Auto-initialize i18n IMMEDIATELY to prevent FOUC
  // We need to start initialization as early as possible
  if (typeof root !== 'undefined' && root.document) {
    // Start initialization immediately, don't wait for DOMContentLoaded
    I18n.init().catch((err) => {
      if (typeof globalThis !== 'undefined' && globalThis.debugError) {
        globalThis.debugError('Failed to initialize i18n:', err)
      }
    })
  }
  globalThis.i18n = I18n
})(typeof globalThis !== 'undefined' ? globalThis : window)
