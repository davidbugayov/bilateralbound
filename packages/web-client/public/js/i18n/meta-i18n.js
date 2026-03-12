'use strict';
/**
 * @fileoverview Meta tags updater for i18n support
 * Updates page title and meta tags based on current language
 * @module meta-i18n
 */

(function (global) {
  /**
   * Update meta tags with translated content
   * Should be called after i18n is ready
   */
  function updateMetaTags() {
    // Guard: i18n must exist
    if (typeof global.i18n === 'undefined') return

    const i18n = global.i18n

    const applyTranslationsSafely = () => {
      try {
        // Apply general translations first (fills data-i18n / data-i18n-attr)
        if (typeof i18n.applyTranslations === 'function') {
          i18n.applyTranslations()
        }

        // Try to get page-specific title key
        const titleKey =
          document.documentElement.dataset.titleKey ||
          'controller.meta.controllerTitle'

        // Get translated value (i18n.t returns the key when missing)
        const translated = typeof i18n.t === 'function' ? i18n.t(titleKey) : ''

        // Detect if returned value looks like an untranslated key
        const looksLikeKey =
          translated === titleKey ||
          (typeof translated === 'string' &&
            /^([a-z0-9_]+\.)+[a-z0-9_]+$/i.test(translated))

        if (!looksLikeKey && translated) {
          // Use translated title
          document.title = translated

          // Keep OG and Twitter metas in sync if present
          const og = document.querySelector('meta[property="og:title"]')
          if (og) og.setAttribute('content', translated)

          const tw = document.querySelector('meta[name="twitter:title"]')
          if (tw) tw.setAttribute('content', translated)
        } else {
          // Fallback: prefer OG meta > existing <title>
          const og = document.querySelector('meta[property="og:title"]')
          if (og && og.getAttribute('content')) {
            document.title = og.getAttribute('content')
          }
        }
      } catch (err) {
        console.warn('updateMetaTags error', err)
      }
    }

    // If i18n is already ready, apply immediately; otherwise wait for i18nReady
    if (i18n.isReady) {
      applyTranslationsSafely()
    } else {
      global.addEventListener('i18nReady', applyTranslationsSafely, {
        once: true
      })
    }
  }

  /**
   * Initialize meta tag updates
   * Sets up listeners for i18n ready and language changes
   */
  function init() {
    const i18n = global.i18n

    // Ensure update runs when i18n signals readiness
    if (typeof i18n !== 'undefined') {
      try {
        i18n.ready && i18n.ready(updateMetaTags)
      } catch (e) {
        console.warn('i18n.ready call error', e)
      }
    }

    global.addEventListener('i18nReady', updateMetaTags)

    // React to dynamic language changes
    global.addEventListener('i18nLanguageChanged', () => {
      try {
        updateMetaTags()
      } catch (err) {
        console.warn('i18nLanguageChanged handler error', err)
      }
    })
  }

  // Auto-initialize
  init()

  // Export API
  global.BBMetaI18n = {
    updateMetaTags,
    init
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : this
)
