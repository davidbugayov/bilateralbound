/**
 * Paywall overlay — injected by the server into viewer/controller pages
 * when repeated access without an active subscription is detected.
 *
 * Shows a modal dialog OVER the normal content (the ball stays visible)
 * and blocks interaction until the user verifies a subscription
 * (Telegram User ID) or subscribes via the bot.
 *
 * Self-contained: builds DOM with inline styles, no external deps.
 */
(function () {
  'use strict'

  // Guard: only inject once
  if (document.getElementById('bb-paywall-overlay')) return

  var SESSION_ID = null
  try {
    var parts = window.location.pathname.split('/')
    SESSION_ID = parts[parts.length - 1] || ''
  } catch (e) { /* keep null */ }

  function t(key, fallback) {
    try {
      var v = globalThis.i18n && globalThis.i18n.t ? globalThis.i18n.t(key) : null
      return v || fallback
    } catch (e) {
      return fallback
    }
  }

  // ── i18n strings (fallback = English) ──
  var STRINGS = {
    heading: function () { return t('paywall.heading', 'Free Access Window Has Expired') },
    description: function () { return t('paywall.description', 'The 2-hour free access for this session has ended. Subscribe for 1⭐ / 30 days for unlimited access. Your support keeps the platform running.') },
    botButton: function () { return t('paywall.botButton', '💬 Subscribe in Telegram — 1⭐') },
    orVerify: function () { return t('paywall.orVerify', 'or verify existing subscription') },
    idLabel: function () { return t('paywall.telegramIdLabel', 'Your Telegram User ID') },
    idPlaceholder: function () { return t('paywall.telegramIdPlaceholder', '123456789') },
    verifyBtn: function () { return t('paywall.unlockButton', 'Verify') },
    hint: function () { return t('paywall.hintMyId', '💡 Send <code>/myid</code> to <a href="https://t.me/emdrbilateral_bot" target="_blank" rel="noopener noreferrer">@emdrbilateral_bot</a> to get your ID') },
    success: function () { return t('paywall.successUnlocked', 'Access unlocked! Redirecting…') },
    errorEmpty: function () { return t('paywall.errorEmpty', 'Please enter your Telegram User ID') },
    errorInvalid: function () { return t('paywall.errorInvalid', 'Invalid Telegram User ID format') },
    errorNetwork: function () { return t('paywall.errorNetwork', 'Network error. Please try again.') },
    noSub: function () { return t('paywall.noSubscription', 'No active subscription for this Telegram ID. Subscribe via @emdrbilateral_bot (1⭐ / 30 days).') }
  }

  // ── Build overlay DOM ──
  var overlay = document.createElement('div')
  overlay.id = 'bb-paywall-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:999999',
    'background:rgba(2,6,23,0.72)',
    'backdrop-filter:blur(3px)', '-webkit-backdrop-filter:blur(3px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:1rem'
  ].join(';')

  var card = document.createElement('div')
  card.style.cssText = [
    'background:#0f172a', 'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:20px', 'max-width:420px', 'width:100%',
    'padding:2rem 1.75rem', 'text-align:center', 'color:#e2e8f0',
    'box-shadow:0 20px 60px rgba(0,0,0,0.6)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
  ].join(';')

  var icon = document.createElement('div')
  icon.textContent = '💛'
  icon.style.cssText = 'font-size:3rem;margin-bottom:0.5rem'

  var heading = document.createElement('h2')
  heading.style.cssText = 'font-size:1.35rem;font-weight:600;color:#f1f5f9;margin:0 0 0.6rem;letter-spacing:-0.01em'

  var desc = document.createElement('p')
  desc.style.cssText = 'font-size:0.92rem;color:rgba(255,255,255,0.6);line-height:1.55;margin:0 0 1.25rem'

  var botBtn = document.createElement('a')
  botBtn.href = 'https://t.me/emdrbilateral_bot'
  botBtn.target = '_blank'
  botBtn.rel = 'noopener noreferrer'
  botBtn.style.cssText = [
    'display:inline-flex', 'align-items:center', 'justify-content:center',
    'background:linear-gradient(135deg,#2563eb,#1d4ed8)', 'color:#fff',
    'padding:0.8rem 1.75rem', 'border-radius:50px', 'text-decoration:none',
    'font-weight:500', 'font-size:0.95rem',
    'box-shadow:0 4px 20px rgba(37,99,235,0.35)',
    'margin-bottom:1.25rem'
  ].join(';')

  var divider = document.createElement('div')
  divider.style.cssText = 'font-size:0.78rem;color:rgba(255,255,255,0.3);margin-bottom:1rem;text-transform:uppercase;letter-spacing:0.06em'

  var form = document.createElement('div')
  form.style.cssText = 'text-align:left'

  var label = document.createElement('label')
  label.style.cssText = 'display:block;font-size:0.82rem;color:rgba(255,255,255,0.55);margin-bottom:0.4rem'

  var row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:0.5rem'

  var input = document.createElement('input')
  input.type = 'text'
  input.inputMode = 'numeric'
  input.pattern = '[0-9]*'
  input.style.cssText = [
    'flex:1', 'min-width:0', 'padding:0.7rem 0.9rem', 'border-radius:12px',
    'border:1px solid rgba(255,255,255,0.14)', 'background:rgba(255,255,255,0.06)',
    'color:#e2e8f0', 'font-size:1rem', 'outline:none'
  ].join(';')

  var verifyBtn = document.createElement('button')
  verifyBtn.type = 'button'
  verifyBtn.style.cssText = [
    'padding:0.7rem 1.1rem', 'border-radius:12px', 'border:none',
    'background:linear-gradient(135deg,#3b82f6,#2563eb)', 'color:#fff',
    'font-weight:500', 'font-size:0.9rem', 'cursor:pointer', 'white-space:nowrap'
  ].join(';')

  var hint = document.createElement('div')
  hint.style.cssText = 'font-size:0.76rem;color:rgba(255,255,255,0.35);margin-top:0.6rem;line-height:1.5'
  hint.innerHTML = STRINGS.hint() // contains markup

  var errBox = document.createElement('div')
  errBox.style.cssText = 'display:none;color:#f87171;font-size:0.85rem;margin-top:0.7rem'

  var okBox = document.createElement('div')
  okBox.style.cssText = 'display:none;color:#34d399;font-size:0.9rem;margin-top:0.7rem'

  row.appendChild(input)
  row.appendChild(verifyBtn)
  form.appendChild(label)
  form.appendChild(row)
  form.appendChild(hint)

  card.appendChild(icon)
  card.appendChild(heading)
  card.appendChild(desc)
  card.appendChild(botBtn)
  card.appendChild(divider)
  card.appendChild(form)
  card.appendChild(errBox)
  card.appendChild(okBox)
  overlay.appendChild(card)
  document.body.appendChild(overlay)

  // ── Fill localized strings ──
  function refresh() {
    heading.textContent = STRINGS.heading()
    desc.textContent = STRINGS.description()
    botBtn.textContent = STRINGS.botButton()
    divider.textContent = STRINGS.orVerify()
    label.textContent = STRINGS.idLabel()
    input.placeholder = STRINGS.idPlaceholder()
    verifyBtn.textContent = STRINGS.verifyBtn()
    hint.innerHTML = STRINGS.hint()
  }
  refresh()
  if (globalThis.i18n && typeof globalThis.i18n.ready === 'function') {
    globalThis.i18n.ready(function () { refresh() })
  }

  // ── Block page interaction while overlay is shown ──
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) e.stopPropagation()
  })

  function showError(text) {
    errBox.textContent = text
    errBox.style.display = 'block'
    okBox.style.display = 'none'
  }

  function showSuccess() {
    okBox.textContent = STRINGS.success()
    okBox.style.display = 'block'
    errBox.style.display = 'none'
  }

  async function handleVerify() {
    var raw = input.value.trim()
    if (!raw) {
      showError(STRINGS.errorEmpty())
      return
    }
    var userId = parseInt(raw, 10)
    if (!userId || userId <= 0) {
      showError(STRINGS.errorInvalid())
      return
    }

    verifyBtn.disabled = true
    verifyBtn.textContent = '…'
    errBox.style.display = 'none'
    okBox.style.display = 'none'

    try {
      var fetchFn = globalThis.csrfFetch || fetch
      var resp = await fetchFn('/api/link-access/' + encodeURIComponent(SESSION_ID) + '/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUserId: userId })
      })
      var data = await resp.json().catch(function () { return {} })

      if (resp.ok) {
        showSuccess()
        setTimeout(function () { window.location.reload() }, 1200)
      } else {
        showError(data.i18nKey && STRINGS[data.i18nKey.replace('paywall.', '')]
          ? STRINGS[data.i18nKey.replace('paywall.', '')]()
          : (data.message || data.error || STRINGS.noSub()))
      }
    } catch (err) {
      showError(STRINGS.errorNetwork())
    } finally {
      verifyBtn.disabled = false
      verifyBtn.textContent = STRINGS.verifyBtn()
    }
  }

  verifyBtn.addEventListener('click', handleVerify)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); handleVerify() }
  })
})()
