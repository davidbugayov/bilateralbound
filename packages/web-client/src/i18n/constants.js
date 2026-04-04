'use strict'
/**
 * @fileoverview Shared i18n constants - Single Source of Truth
 * All language-related constants are defined here to avoid duplication
 * @module constants/i18n-constants
 */

/**
 * List of supported languages
 * @constant {string[]}
 */
const SUPPORTED_LANGUAGES = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh']

/**
 * Human-readable language names
 * @constant {Object<string, string>}
 */
const LANGUAGE_NAMES = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  ja: '日本語',
  zh: '中文'
}

/**
 * LocalStorage key for language preference
 * @constant {string}
 */
const STORAGE_KEY = 'emdr-language'

/**
 * Default language fallback
 * @constant {string}
 */
const DEFAULT_LANGUAGE = 'en'

/**
 * Check if a language code is supported
 * @param {string} lang - Language code to check
 * @returns {boolean}
 */
function isSupported(lang) {
  return SUPPORTED_LANGUAGES.includes(lang)
}

/**
 * Detect language from domain
 * @returns {string} Language code
 */
function detectFromDomain() {
  // Safe access to location.hostname
  let hostname = 'localhost'
  if (typeof globalThis !== 'undefined' && globalThis.location) {
    hostname = globalThis.location.hostname
  }

  // Check domain for language detection (emdrbilateral is project name, not a typo)
  if (hostname.includes('emdrbilateral.ru')) {
    return 'ru'
  }
  if (hostname.includes('emdrbilateral.online')) {
    return 'en'
  }

  return DEFAULT_LANGUAGE
}

/**
 * Save language preference
 * @param {string} lang - Language code to save
 */
function saveLanguage(lang) {
  // Early return if not supported
  if (!isSupported(lang)) {
    return
  }

  // Save to localStorage if available
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Ignore storage errors
    }
  }
}

// Export constants
const I18nConstants = {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  STORAGE_KEY,
  DEFAULT_LANGUAGE,
  isSupported,
  detectFromDomain,
  saveLanguage
}

// Freeze to prevent accidental mutation
Object.freeze(I18nConstants)
Object.freeze(SUPPORTED_LANGUAGES)
Object.freeze(LANGUAGE_NAMES)

// Export to global scope (browser)
if (typeof globalThis !== 'undefined' && globalThis) {
  globalThis.I18nConstants = I18nConstants
}

// CommonJS export (Node.js)
if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = I18nConstants
}

module.exports = I18nConstants
