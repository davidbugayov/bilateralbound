'use strict';
/**
 * @fileoverview Language pre-loader - prevents flashing of wrong language
 * Must be loaded BEFORE i18n.js in the <head> section
 * @module lang-preload
 */

(function () {
  const SUPPORTED_LANGUAGES = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh']
  const STORAGE_KEY = 'emdr-language'

  /**
   * Detect language from domain
   * @returns {string} Language code
   */
  function detectFromDomain() {
    const hostname = (typeof globalThis !== 'undefined' ? globalThis : window)
      .location.hostname

    if (hostname.includes('emdrbilateral.ru')) {
      return 'ru'
    }
    if (hostname.includes('emdrbilateral.online')) {
      return 'en'
    }

    return 'en' // Default fallback
  }

  /**
   * Get and apply language setting
   */
  function applyLanguage() {
    let lang = null

    try {
      lang = localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      // localStorage not available (private mode, etc.)
    }

    // Validate or detect language
    if (!lang || !SUPPORTED_LANGUAGES.includes(lang)) {
      lang = detectFromDomain()

      try {
        localStorage.setItem(STORAGE_KEY, lang)
      } catch (e) {
        // Ignore storage errors
      }
    }

    // Apply to document immediately to prevent flashing
    document.documentElement.lang = lang
    document.documentElement.dataset.lang = lang

    // Inject anti-flash style (hides i18n elements until translated).
    // Skip when the server already rendered localized content
    // (data-i18n-rendered is set by LocalizationService) — hiding content
    // that is already correct hurts SEO (crawlers without JS see nothing).
    if (!document.documentElement.hasAttribute('data-i18n-rendered')) {
      const style = document.createElement('style')
      style.id = 'i18n-cloak'
      style.innerHTML = '[data-i18n] { visibility: hidden !important; }'
      document.head.appendChild(style)
    }
  }

  // Execute immediately
  applyLanguage()
})()
