/**
 * Subscription Badge — controller page indicator.
 * Injects a pill badge into the controller header:
 *   • Active subscription → ⭐ PRO with Magic UI border-beam shimmer
 *   • No subscription     → ⚡ subtle "subscribe" hint
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

  // ── i18n helper ──
  function t(key, fallback) {
    try {
      var v = (globalThis.i18n && globalThis.i18n.t) ? globalThis.i18n.t(key) : null
      // i18n.t may return the key itself when translation is missing
      return (v && v !== key) ? v : fallback
    } catch (e) { return fallback }
  }

  const STRINGS = {
    activeText: function () { return t('subscriptionBadge.active', '⭐ PRO') },
    activeTitle: function () { return t('subscriptionBadge.activeTitle', 'Active subscription') },
    inactiveText: function () { return t('subscriptionBadge.inactive', '⚡ Subscribe') },
    inactiveTitle: function () { return t('subscriptionBadge.inactiveTitle', 'Activate subscription — 75⭐ / 30 days') }
  }

  // ── Build DOM ──
  const badge = document.createElement('a')
  badge.id = 'bb-sub-badge'
  badge.className = 'sub-badge sub-badge--loading'
  badge.href = '/#subscription'
  badge.setAttribute('aria-label', '')

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

    // Insert before settings button (last element in header)
    const settingsBtn = document.getElementById('settingsBtn')
    if (settingsBtn) {
      header.insertBefore(badge, settingsBtn)
    } else {
      header.appendChild(badge)
    }
  }

  function refresh() {
    icon.textContent = badge.classList.contains('sub-badge--active') ? '⭐' : '⚡'
    text.textContent = badge.classList.contains('sub-badge--active')
      ? STRINGS.activeText()
      : STRINGS.inactiveText()
    badge.setAttribute('aria-label', badge.classList.contains('sub-badge--active')
      ? STRINGS.activeTitle()
      : STRINGS.inactiveTitle())
  }

  // ── Fetch subscription status ──
  async function checkSubscription() {
    try {
      const fetchFn = globalThis.csrfFetch || fetch
      const resp = await fetchFn('/api/subscription/' + encodeURIComponent(SESSION_ID) + '/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await resp.json().catch(function () { return {} })

      badge.classList.remove('sub-badge--loading')

      if (data.active) {
        badge.classList.add('sub-badge--active')
        badge.classList.remove('sub-badge--inactive')
      } else {
        badge.classList.add('sub-badge--inactive')
        badge.classList.remove('sub-badge--active')
      }
      refresh()
    } catch (err) {
      // Network error — hide silently
      badge.style.display = 'none'
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
