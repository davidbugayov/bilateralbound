/**
 * Subscription Badge — controller page indicator.
 * Injects a pill badge into the controller header:
 *   • Active subscription → ⭐ PRO with Magic UI border-beam shimmer
 *   • No subscription     → ⚡ CTA "support" button
 *
 * Clicking the badge (either state) opens a "What you get with Supporter"
 * dialog with benefits, price and a CTA to the Telegram bot.
 *
 * Self-contained: builds DOM, fetches /api/subscription/:sessionId/check,
 * no external deps beyond globalThis.fetch.
 */
(function () {
  'use strict'

  if (document.getElementById('bb-sub-badge')) return

  const SESSION_ID = (function () {
    try {
      const parts = window.location.pathname.split('/')
      return parts[parts.length - 1] || ''
    } catch (e) { return '' }
  })()

  if (!SESSION_ID) return

  const BOT_URL = 'https://t.me/emdrbilateral_bot'

  // ── i18n helper ──
  function t(key, fallback) {
    try {
      const v = (globalThis.i18n && globalThis.i18n.t) ? globalThis.i18n.t(key) : null
      // i18n.t may return the key itself when translation is missing
      return (v && v !== key) ? v : fallback
    } catch (e) { return fallback }
  }

  const STRINGS = {
    activeText: function () { return t('subscriptionBadge.active', 'PRO') },
    activeTitle: function () { return t('subscriptionBadge.activeTitle', 'Active subscription') },
    inactiveText: function () { return t('subscriptionBadge.inactive', 'Support us') },
    inactiveTitle: function () { return t('subscriptionBadge.inactiveTitle', 'Support the project — 75⭐ / 30 days') },
    dialogTitle: function () { return t('subscriptionBadge.dialogTitle', 'What you get with Supporter') },
    dialogClose: function () { return t('subscriptionBadge.dialogClose', 'Close') },
    planName: function () { return t('subscription.planName', 'Supporter') },
    benefit1: function () { return t('subscription.benefit1', 'Custom permanent session IDs') },
    benefit2: function () { return t('subscription.benefit2', 'Links never expire — reuse with same client') },
    benefit3: function () { return t('subscription.benefit3', 'Priority support') },
    benefitSupport: function () { return t('subscription.benefitSupport', 'Helps keep BilateralBound running') },
    price: function () { return t('subscription.price', '75 ⭐ / 30 days') },
    cta: function () { return t('subscription.cta', 'Support with 75 ⭐') },
    ctaNote: function () { return t('subscription.ctaNote', 'One-time via Telegram — no auto-charge') },
    alreadyActive: function () { return t('subscription.alreadyActive', 'Supporter Active') },
    manageInBot: function () { return t('subscription.manageInBot', 'Manage in Telegram Bot') }
  }

  // ── Build badge DOM ──
  const badge = document.createElement('a')
  badge.id = 'bb-sub-badge'
  badge.className = 'sub-badge sub-badge--loading'
  badge.href = '#'
  badge.setAttribute('aria-label', '')
  badge.setAttribute('role', 'button')

  const icon = document.createElement('span')
  icon.className = 'sub-badge__icon'

  const text = document.createElement('span')
  text.className = 'sub-badge__text'

  badge.appendChild(icon)
  badge.appendChild(text)

  // ── Insert into header ──
  function mount() {
    const header = document.querySelector('body > header')
    if (!header) return setTimeout(mount, 50)

    // Insert before settings button — badge sits to the left of it
    const settingsBtn = document.getElementById('settingsBtn')
    if (settingsBtn) {
      header.insertBefore(badge, settingsBtn)
    } else {
      header.appendChild(badge)
    }
  }

  function refresh() {
    const isActive = badge.classList.contains('sub-badge--active')
    icon.textContent = isActive ? '⭐' : '⚡'
    text.textContent = isActive ? STRINGS.activeText() : STRINGS.inactiveText()
    badge.setAttribute('aria-label', isActive ? STRINGS.activeTitle() : STRINGS.inactiveTitle())
    // Badge always opens the benefits dialog (click handler below)
  }

  // ── Benefits dialog ──
  function openDialog() {
    const isActive = badge.classList.contains('sub-badge--active')

    const overlay = document.createElement('div')
    overlay.className = 'sub-dialog__overlay'

    const card = document.createElement('div')
    card.className = 'sub-dialog__card'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    card.setAttribute('aria-labelledby', 'subDialogTitle')

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'sub-dialog__close'
    closeBtn.setAttribute('aria-label', STRINGS.dialogClose())
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', function () { closeDialog() })

    // Header
    const head = document.createElement('div')
    head.className = 'sub-dialog__head'
    const headIcon = document.createElement('span')
    headIcon.className = 'sub-dialog__head-icon'
    headIcon.textContent = '⭐'
    const title = document.createElement('h2')
    title.id = 'subDialogTitle'
    title.className = 'sub-dialog__title'
    title.textContent = STRINGS.dialogTitle()
    head.appendChild(headIcon)
    head.appendChild(title)

    // Benefits list
    const benefits = document.createElement('ul')
    benefits.className = 'sub-dialog__benefits'
    const benefitItems = [STRINGS.benefit1(), STRINGS.benefit2(), STRINGS.benefit3(), STRINGS.benefitSupport()]
    benefitItems.forEach(function (b) {
      const li = document.createElement('li')
      li.className = 'sub-dialog__benefit'
      li.textContent = b
      benefits.appendChild(li)
    })

    // Price row
    const price = document.createElement('div')
    price.className = 'sub-dialog__price'
    price.textContent = STRINGS.price()

    // Actions
    const actions = document.createElement('div')
    actions.className = 'sub-dialog__actions'

    if (isActive) {
      const status = document.createElement('div')
      status.className = 'sub-dialog__status'
      status.textContent = '✅ ' + STRINGS.alreadyActive()

      const manageBtn = document.createElement('a')
      manageBtn.className = 'sub-dialog__btn sub-dialog__btn--manage'
      manageBtn.href = BOT_URL
      manageBtn.target = '_blank'
      manageBtn.rel = 'noopener noreferrer'
      manageBtn.textContent = STRINGS.manageInBot()

      actions.appendChild(status)
      actions.appendChild(manageBtn)
    } else {
      const ctaBtn = document.createElement('a')
      ctaBtn.className = 'sub-dialog__btn sub-dialog__btn--cta'
      ctaBtn.href = BOT_URL
      ctaBtn.target = '_blank'
      ctaBtn.rel = 'noopener noreferrer'
      ctaBtn.textContent = STRINGS.cta()

      const note = document.createElement('div')
      note.className = 'sub-dialog__note'
      note.textContent = STRINGS.ctaNote()

      actions.appendChild(ctaBtn)
      actions.appendChild(note)
    }

    card.appendChild(closeBtn)
    card.appendChild(head)
    card.appendChild(benefits)
    card.appendChild(price)
    card.appendChild(actions)

    const wrap = document.createElement('div')
    wrap.className = 'sub-dialog'
    wrap.appendChild(overlay)
    wrap.appendChild(card)

    document.body.appendChild(wrap)
    document.body.classList.add('sub-dialog-open')

    // Close on overlay click / Escape
    overlay.addEventListener('click', function () { closeDialog() })
    document.addEventListener('keydown', handleDialogKey)

    requestAnimationFrame(function () { wrap.classList.add('sub-dialog--show') })

    // Focus close button for keyboard users
    setTimeout(function () { closeBtn.focus() }, 50)
  }

  function handleDialogKey(e) {
    if (e.key === 'Escape') closeDialog()
  }

  function closeDialog() {
    const wrap = document.querySelector('.sub-dialog')
    if (!wrap) return
    document.removeEventListener('keydown', handleDialogKey)
    document.body.classList.remove('sub-dialog-open')
    wrap.classList.remove('sub-dialog--show')
    setTimeout(function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap)
    }, 200)
  }

  badge.addEventListener('click', function (e) {
    e.preventDefault()
    e.stopPropagation()
    openDialog()
  })

  // ── Read cookie by name ──
  function getCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\\/+^])/g, '\\$1') + '=([^;]*)'))
      return m ? decodeURIComponent(m[1]) : null
    } catch (_) { return null }
  }

  // ── Fetch subscription status ──
  async function checkSubscription() {
    // Fast path: sub_active cookie (set by server on link-access unlock, non-httpOnly)
    var subActive = getCookie('sub_active')
    if (subActive) {
      var expiry = parseInt(subActive, 10)
      if (expiry && expiry > Date.now()) {
        badge.classList.remove('sub-badge--loading')
        badge.classList.add('sub-badge--active')
        badge.classList.remove('sub-badge--inactive')
        refresh()
        return
      }
    }

    // Check subscription by session ID
    try {
      const fetchFn = globalThis.csrfFetch || fetch
      const resp = await fetchFn('/api/subscription/' + encodeURIComponent(SESSION_ID) + '/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      })
      const data = await resp.json().catch(function () { return {} })

      badge.classList.remove('sub-badge--loading')

      if (data.active) {
        badge.classList.add('sub-badge--active')
        badge.classList.remove('sub-badge--inactive')
        refresh()
        return
      }
    } catch (_) { /* continue to link-access fallback */ }

    // Fallback: check if browser was unlocked via bb_lk cookie (link-access)
    try {
      const resp2 = await fetch('/api/link-access/' + encodeURIComponent(SESSION_ID) + '/check', {
        method: 'GET',
        credentials: 'same-origin'
      })
      const la = await resp2.json().catch(function () { return {} })

      badge.classList.remove('sub-badge--loading')

      if (la.unlocked) {
        badge.classList.add('sub-badge--active')
        badge.classList.remove('sub-badge--inactive')
      } else {
        badge.classList.add('sub-badge--inactive')
        badge.classList.remove('sub-badge--active')
      }
      refresh()
    } catch (_) {
      // Both checks failed — show inactive state
      badge.classList.remove('sub-badge--loading')
      badge.classList.add('sub-badge--inactive')
      badge.classList.remove('sub-badge--active')
      refresh()
    }
  }

  mount()
  refresh()
  checkSubscription()

  // Re-apply i18n when ready
  if (globalThis.i18n && typeof globalThis.i18n.ready === 'function') {
    globalThis.i18n.ready(function () { refresh() })
  }
})()
