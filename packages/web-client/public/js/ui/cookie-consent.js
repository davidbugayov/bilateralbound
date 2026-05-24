/* jshint esversion: 11, asi: true */
/**
 * Cookie Consent Manager
 * Shows a GDPR/152-FZ compliant cookie banner and defers Yandex.Metrica
 * loading until user consent is given.
 *
 * Consent state is stored in localStorage key 'bb_cookie_consent':
 *   - 'accepted' — Metrica loads immediately on next page load
 *   - 'declined' — Metrica never loads
 *   - null/undefined — show banner
 */
(function () {
  'use strict'

  var STORAGE_KEY = 'bb_cookie_consent'
  var YM_ID = 104698530

  // Skip analytics entirely on dev/local
  var hostname = globalThis.location?.hostname || ''
  if (/dev\.emdrbilateral|localhost|127\.0\.0\.1/.test(hostname)) {
    return
  }

  /**
   * Read consent from localStorage
   */
  function getConsent() {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch (_) {
      return null
    }
  }

  /**
   * Write consent to localStorage
   */
  function setConsent(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch (_) { /* ignore */ }
  }

  /**
   * Load Yandex.Metrica script dynamically
   */
  function loadYandexMetrica() {
    if (typeof globalThis.ym === 'function') return // already loaded

    // Inject the Metrica script
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) }
      m[i].l = 1 * new Date()
      for (let j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) { return }
      }
      k = e.createElement(t)
      a = e.getElementsByTagName(t)[0]
      k.async = 1
      k.src = r
      a.parentNode.insertBefore(k, a)
    })(globalThis, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + YM_ID, 'ym')

    globalThis.ym(YM_ID, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      accurateTrackBounce: false,
      trackLinks: true,
      childIframe: true,
      triggerEvent: true
    })

    // noscript fallback
    const noscript = document.createElement('noscript')
    const img = document.createElement('img')
    img.src = 'https://mc.yandex.ru/watch/' + YM_ID
    img.style.position = 'absolute'
    img.style.left = '-9999px'
    img.alt = ''
    noscript.appendChild(img)
    document.body.appendChild(noscript)

    console.log('[CookieConsent] Yandex.Metrica loaded after consent')
  }

  /**
   * Handle "Accept" click
   */
  function onAccept() {
    setConsent('accepted')
    hideBanner()
    loadYandexMetrica()
    globalThis.dispatchEvent(new CustomEvent('bb_cookie_consent_accepted'))
  }

  /**
   * Handle "Decline" click
   */
  function onDecline() {
    setConsent('declined')
    hideBanner()
    // Track decline via pixel — ym is never loaded, but we can still count declines
    try {
      var img = new Image()
      img.src = 'https://mc.yandex.ru/watch/' + YM_ID + '?rn=' + Date.now()
    } catch (_) { /* ignore */ }
    globalThis.dispatchEvent(new CustomEvent('bb_cookie_consent_declined'))
  }

  /**
   * Remove the banner from the DOM
   */
  function hideBanner() {
    const banner = document.getElementById('cookieConsentBanner')
    if (banner) {
      banner.classList.add('cookie-consent--hidden')
      setTimeout(function () {
        if (banner.parentNode) banner.parentNode.removeChild(banner)
      }, 300)
    }
  }

  /**
   * Get localized text with fallback
   */
  function getText(key, fallback) {
    if (globalThis.i18n?.t) {
      const t = globalThis.i18n.t(key)
      if (t !== key) return t
    }
    return fallback
  }

  /**
   * Build and show the cookie consent banner
   */
  function showBanner() {
    // Avoid duplicate
    if (document.getElementById('cookieConsentBanner')) return

    const banner = document.createElement('div')
    banner.id = 'cookieConsentBanner'
    banner.className = 'cookie-consent'

    const text = document.createElement('p')
    text.className = 'cookie-consent__text'
    text.textContent = getText('cookie.text', 'We use Yandex.Metrica for analytics. By clicking "Accept", you consent to the processing of your data.')

    const actions = document.createElement('div')
    actions.className = 'cookie-consent__actions'

    const declineBtn = document.createElement('button')
    declineBtn.className = 'cookie-consent__btn cookie-consent__btn--decline'
    declineBtn.textContent = getText('cookie.decline', 'Decline')
    declineBtn.addEventListener('click', onDecline)

    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'cookie-consent__btn cookie-consent__btn--accept'
    acceptBtn.textContent = getText('cookie.accept', 'Accept')
    acceptBtn.addEventListener('click', onAccept)

    actions.appendChild(declineBtn)
    actions.appendChild(acceptBtn)

    banner.appendChild(text)
    banner.appendChild(actions)
    document.body.appendChild(banner)

    // Trigger entrance animation
    requestAnimationFrame(function () {
      banner.classList.add('cookie-consent--visible')
    })
  }

  /**
   * Check consent on page load and either load Metrica or show banner
   */
  function init() {
    const consent = getConsent()

    if (consent === 'accepted') {
      // Previously accepted — load Metrica immediately
      loadYandexMetrica()
    } else if (consent === 'declined') {
      // Previously declined — do nothing
      return
    } else {
      // No consent yet — show banner after a short delay to not block rendering
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          setTimeout(showBanner, 500)
        })
      } else {
        setTimeout(showBanner, 500)
      }
    }
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // Expose for testing
  if (typeof globalThis !== 'undefined') {
    globalThis.CookieConsent = {
      getConsent: getConsent,
      setConsent: setConsent,
      accept: onAccept,
      decline: onDecline,
      reset: function () {
        try { localStorage.removeItem(STORAGE_KEY) } catch (_) { /* ignore */ }
      }
    }
  }
})()
