/* jshint esversion: 9 */
/**
 * HintBanner — единая система подсказок (bb-hint)
 * Используется на контроллере, viewer и главном экране.
 */
(function () {
  'use strict'

  const ICONS = { info: '💡', success: '✅', warning: '⚠️', error: '🚫' }
  const TYPES = ['info', 'success', 'warning', 'error']

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key)
    } catch (e) {
      return null
    }
  }
  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch (e) {
      /* noop */
    }
  }

  function HintBanner(config) {
    this.config = config || {}
    this.el = null
  }

  HintBanner.prototype.show = function () {
    const cfg = this.config
    if (cfg.dismissKey && storageGet(cfg.dismissKey)) return undefined
    if (this.el) return this.el

    const type = TYPES.indexOf(cfg.type) !== -1 ? cfg.type : 'info'

    const el = document.createElement('div')
    el.className = 'bb-hint bb-hint--' + type
    el.setAttribute('role', cfg.ariaLive === 'assertive' ? 'alert' : 'status')
    el.setAttribute('aria-live', cfg.ariaLive || 'polite')

    const icon = document.createElement('span')
    icon.className = 'bb-hint__icon'
    icon.textContent = cfg.icon || ICONS[type]
    el.appendChild(icon)

    const body = document.createElement('div')
    body.className = 'bb-hint__body'
    if (cfg.title) {
      const title = document.createElement('div')
      title.className = 'bb-hint__title'
      title.textContent = cfg.title
      body.appendChild(title)
    }
    if (cfg.message) {
      const msg = document.createElement('div')
      msg.className = 'bb-hint__message'
      msg.innerHTML = cfg.message
      body.appendChild(msg)
    }
    el.appendChild(body)

    if (cfg.ctaLabel && typeof cfg.onCta === 'function') {
      const cta = document.createElement('button')
      cta.type = 'button'
      cta.className = 'bb-hint__cta'
      cta.textContent = cfg.ctaLabel
      cta.addEventListener('click', function () {
        cfg.onCta()
      })
      el.appendChild(cta)
    }

    const self = this
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'bb-hint__close'
    closeBtn.setAttribute('aria-label', cfg.closeLabel || 'Close')
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', function () {
      if (cfg.dismissKey) storageSet(cfg.dismissKey, '1')
      self.hide()
    })
    el.appendChild(closeBtn)

    let container = cfg.container
    if (typeof container === 'string')
      container = document.getElementById(container)
    if (!container || container.nodeType !== 1) {
      container = document.createElement('div')
      container.className = 'bb-hint-container'
      document.body.appendChild(container)
    }
    container.appendChild(el)
    this.el = el
    return el
  }

  HintBanner.prototype.hide = function () {
    if (!this.el || !this.el.parentNode) return
    const el = this.el
    this.el = null
    el.classList.add('bb-hint--leaving')
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el)
    }, 200)
  }

  if (typeof globalThis !== 'undefined') globalThis.HintBanner = HintBanner
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HintBanner: HintBanner }
  }
})()
