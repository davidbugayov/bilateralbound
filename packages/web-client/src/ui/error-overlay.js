'use strict'

if (typeof EMDRErrorOverlay === 'undefined') {
  const STYLES = `
    @keyframes emdr-overlay-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes emdr-modal-slide-in {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .emdr-error-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      padding: 1rem;
      animation: emdr-overlay-fade-in 0.2s ease-out;
    }
    .emdr-error-modal {
      position: relative;
      width: 100%;
      max-width: 42rem;
      background-color: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 0.5rem;
      padding: 1.5rem;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2);
      animation: emdr-modal-slide-in 0.2s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .emdr-error-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 4rem;
      height: 4rem;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border-radius: 50%;
      box-shadow: 0 0 30px rgba(239,68,68,0.3);
    }
    .emdr-error-icon svg {
      width: 2rem;
      height: 2rem;
      color: white;
      stroke-width: 2.5;
    }
    .emdr-error-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ef4444;
      text-align: center;
      margin: 0 0 1rem;
      line-height: 1.4;
    }
    .emdr-error-divider {
      height: 1px;
      background-color: #2a2a2a;
      border: none;
      margin: 1rem 0;
    }
    .emdr-error-message {
      font-size: 0.875rem;
      color: #a1a1aa;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .emdr-error-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }
    .emdr-error-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.625rem 1.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.15s ease;
      border: none;
      outline: none;
    }
    .emdr-error-button:focus-visible {
      outline: 2px solid #ef4444;
      outline-offset: 2px;
    }
    .emdr-error-button-primary {
      background-color: #ef4444;
      color: white;
    }
    .emdr-error-button-primary:hover { background-color: #dc2626; }
    .emdr-error-button-secondary {
      background-color: #27272a;
      color: #e4e4e7;
      border: 1px solid #3f3f46;
    }
    .emdr-error-button-secondary:hover { background-color: #3f3f46; }
    .emdr-error-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #71717a;
      cursor: pointer;
      border-radius: 0.25rem;
      transition: all 0.15s ease;
    }
    .emdr-error-close:hover { color: #e4e4e7; background-color: #27272a; }
    .emdr-error-close svg { width: 1.25rem; height: 1.25rem; }
    @media (max-width: 640px) {
      .emdr-error-modal { padding: 1.25rem; }
      .emdr-error-icon { width: 3rem; height: 3rem; margin-bottom: 1rem; }
      .emdr-error-icon svg { width: 1.5rem; height: 1.5rem; }
      .emdr-error-title { font-size: 1.125rem; }
      .emdr-error-actions { flex-direction: column; }
      .emdr-error-button { width: 100%; }
    }
  `

  const NS = 'http://www.w3.org/2000/svg'

  const makeSvg = function(attrs, ...children) {
    const svg = document.createElementNS(NS, 'svg')
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v)
    for (const child of children) svg.appendChild(child)
    return svg
  }

  const svgEl = function(tag, attrs) {
    const el = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }

  const makeAlertIcon = function() {
    return makeSvg(
      {
        width: '24',
        height: '24',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      svgEl('circle', { cx: '12', cy: '12', r: '10' }),
      svgEl('line', { x1: '12', y1: '8', x2: '12', y2: '12' }),
      svgEl('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' })
    )
  }

  const makeCloseIcon = function() {
    return makeSvg(
      {
        width: '24',
        height: '24',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      svgEl('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
      svgEl('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
    )
  }

  class EMDRErrorOverlay {
    constructor() {
      this._overlay = null
      this._isVisible = false
      this._handleEscape = (e) => {
        if (e.key === 'Escape' && this._isVisible) this.hide()
      }
      this._injectStyles()
    }

    _injectStyles() {
      if (document.getElementById('emdr-error-overlay-styles')) return
      const style = document.createElement('style')
      style.id = 'emdr-error-overlay-styles'
      style.textContent = STYLES
      document.head.appendChild(style)
    }

    /**
     * @param {Object} config
     * @param {string} config.title
     * @param {string} config.message
     * @param {string} [config.actionText]
     * @param {Function} [config.onAction]
     * @param {Function} [config.onClose]
     */
    show(config) {
      if (this._isVisible) this.hide()

      this._overlay = document.createElement('div')
      this._overlay.className = 'emdr-error-overlay'
      this._overlay.setAttribute('role', 'dialog')
      this._overlay.setAttribute('aria-modal', 'true')
      this._overlay.setAttribute('aria-labelledby', 'emdr-error-title')

      const modal = document.createElement('div')
      modal.className = 'emdr-error-modal'

      // Close button (X)
      const closeBtn = document.createElement('button')
      closeBtn.className = 'emdr-error-close'
      closeBtn.setAttribute('aria-label', 'Close')
      closeBtn.appendChild(makeCloseIcon())
      closeBtn.onclick = () => {
        config.onClose?.()
        this.hide()
      }

      // Alert icon circle
      const iconWrap = document.createElement('div')
      iconWrap.className = 'emdr-error-icon'
      iconWrap.appendChild(makeAlertIcon())

      // Title
      const title = document.createElement('h2')
      title.id = 'emdr-error-title'
      title.className = 'emdr-error-title'
      title.textContent = config.title

      // Divider
      const divider = document.createElement('hr')
      divider.className = 'emdr-error-divider'

      // Message
      const msgEl = document.createElement('div')
      msgEl.className = 'emdr-error-message'
      msgEl.textContent = config.message

      // Actions
      const actions = document.createElement('div')
      actions.className = 'emdr-error-actions'

      if (config.actionText && config.onAction) {
        const primaryBtn = document.createElement('button')
        primaryBtn.className = 'emdr-error-button emdr-error-button-primary'
        primaryBtn.textContent = config.actionText
        primaryBtn.onclick = () => {
          config.onAction()
          this.hide()
        }
        actions.appendChild(primaryBtn)
      }

      const closeLabel = globalThis.i18n?.t('common.close') || 'Close'
      const secondaryBtn = document.createElement('button')
      secondaryBtn.className = 'emdr-error-button emdr-error-button-secondary'
      secondaryBtn.textContent = closeLabel
      secondaryBtn.onclick = () => {
        config.onClose?.()
        this.hide()
      }
      actions.appendChild(secondaryBtn)

      modal.appendChild(closeBtn)
      modal.appendChild(iconWrap)
      modal.appendChild(title)
      modal.appendChild(divider)
      modal.appendChild(msgEl)
      modal.appendChild(actions)
      this._overlay.appendChild(modal)

      this._overlay.addEventListener('click', (e) => {
        if (e.target === this._overlay) {
          config.onClose?.()
          this.hide()
        }
      })

      document.addEventListener('keydown', this._handleEscape)
      document.body.appendChild(this._overlay)
      this._isVisible = true
      setTimeout(() => closeBtn.focus(), 100)
    }

    hide() {
      this._overlay?.parentNode?.removeChild(this._overlay)
      this._overlay = null
      this._isVisible = false
      document.removeEventListener('keydown', this._handleEscape)
    }

    isShowing() {
      return this._isVisible
    }
  }

  globalThis.EMDRErrorOverlay = EMDRErrorOverlay
  globalThis.emdrErrorOverlay = new EMDRErrorOverlay()

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EMDRErrorOverlay }
  }
}
