(function () {
  'use strict'

  let isCreatingSession = false

  /**
   * Create new EMDR session
   */
  async function createSession() {
    const btn = document.getElementById('createSessionBtn')
    if (btn.disabled) {
      console.log('⚠️ Session creation already in progress...')
      return
    }
    isCreatingSession = true
    try {
      btn.innerHTML = globalThis.i18n?.t('session.loading') || '⏳ Loading...'
      btn.disabled = true
      btn.innerHTML =
        globalThis.i18n?.t('session.creating') || '🔄 Creating session...'

      console.log('🔄 Creating session...')
      const response = await globalThis.csrfFetch('/api/session', { method: 'POST' })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Response error:', errorText)
        alert(
          'HTTP ' +
            response.status +
            ': ' +
            (errorText ||
              globalThis.i18n?.t('session.createError') ||
              'Failed to create session')
        )
        return
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('❌ Response not JSON:', text.substring(0, 200))
        alert(
          globalThis.i18n?.t('session.jsonError') ||
            'Server returned non-JSON response'
        )
        return
      }

      const data = await response.json()
      console.log('✅ Session data:', data)
      const sessionId = data.sessionId

      if (!sessionId) {
        console.error('Session created but ID not received')
        alert(
          globalThis.i18n?.t('session.noId') ||
            'Session created but ID not received.'
        )
        return
      }

      const connectResponse = await globalThis.csrfFetch(
        '/api/session/' + sessionId + '/controller/connect',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      )

      if (!connectResponse.ok) {
        const connectError = await connectResponse.text()
        console.error('Controller connect error:', connectError)
        alert(
          (globalThis.i18n?.t('session.controllerError') ||
            'Error connecting controller: ') + connectError
        )
        return
      }

      window.location.href = '/c/' + sessionId
    } finally {
      isCreatingSession = false
      resetCreateSessionButton()
    }
  }

  /**
   * Reset create session button state
   */
  function resetCreateSessionButton() {
    const btn = document.getElementById('createSessionBtn')
    if (!btn || isCreatingSession) return
    const wasDisabled = btn.disabled
    btn.disabled = false
    if (wasDisabled && globalThis.i18n?.applyTranslations) {
      globalThis.i18n.applyTranslations()
    }
  }

  /**
   * Validate client ID format
   */
  function validateClientId(clientId) {
    return /^[A-Za-z0-9_-]{3,32}$/.test(clientId)
  }

  /**
   * Update validation message display
   */
  function updateValidationMessage(message, isError) {
    const msgElement = document.getElementById('linkValidationMessage')
    if (msgElement) {
      msgElement.textContent = message
      msgElement.style.color = isError ? '#ef4444' : '#94a3b8'
    }
  }

  /**
   * Setup auto-select on click/focus for URL inputs
   */
  function setupUrlInputClick(input) {
    if (input) {
      input.addEventListener('click', function () {
        input.select()
      })
      input.addEventListener('focus', function () {
        input.select()
      })
    }
  }

  /**
   * Generate permanent links for client
   */
  async function generatePermanentLinks() {
    const input = document.getElementById('customClientId')
    const btn = document.getElementById('generateLinksBtn')
    const container = document.getElementById('generatedLinksContainer')
    const viewerUrlInput = document.getElementById('generatedViewerUrl')
    const controllerUrlInput = document.getElementById(
      'generatedControllerUrl'
    )

    if (!input || !btn) return
    const clientId = input.value.trim()

    if (!clientId) {
      updateValidationMessage(
        globalThis.i18n?.t('links.validationEmpty') ||
          '❌ Please enter a client ID',
        true
      )
      input.focus()
      return
    }
    if (!validateClientId(clientId)) {
      updateValidationMessage(
        globalThis.i18n?.t('links.validationFormat') ||
          '❌ Invalid format. Use only latin letters, numbers, _ or - (3-32 characters)',
        true
      )
      input.focus()
      return
    }

    const originalBtnText = btn.innerHTML
    try {
      btn.innerHTML = globalThis.i18n?.t('links.creating') || '⏳ Creating...'
      btn.disabled = true
      updateValidationMessage(
        globalThis.i18n?.t('links.creatingLinks') ||
          'Creating permanent links...',
        false
      )

      const response = await globalThis.csrfFetch('/api/session/' + clientId + '/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(function () {
          return {
            error: globalThis.i18n?.t('links.errorUnknown') || 'Unknown error'
          }
        })
        throw new Error(errorData.error || 'HTTP ' + response.status)
      }

      const data = await response.json()
      if (viewerUrlInput) viewerUrlInput.value = data.viewerUrl
      if (controllerUrlInput) controllerUrlInput.value = data.controllerUrl
      if (container) container.style.display = 'block'

      setupUrlInputClick(viewerUrlInput)
      setupUrlInputClick(controllerUrlInput)

      updateValidationMessage(
        globalThis.i18n?.t('links.createdSuccess') ||
          '✅ Links created successfully!',
        false
      )

      if (window.showSuccessNotification) {
        window.showSuccessNotification(
          globalThis.i18n?.t('links.createdNotification') ||
            '🎉 Permanent links created!'
        )
      }

      setTimeout(function () {
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } catch (error) {
      console.error('❌ Error creating permanent links:', error)
      updateValidationMessage('❌ ' + error.message, true)
      if (window.showErrorNotification) {
        window.showErrorNotification(
          (globalThis.i18n?.t('links.errorCreating') ||
            'Error creating links: ') + error.message
        )
      } else {
        alert(
          (globalThis.i18n?.t('links.errorCreating') ||
            'Error creating links: ') + error.message
        )
      }
    } finally {
      btn.innerHTML = originalBtnText
      btn.disabled = false
    }
  }

  /**
   * Load existing session by ID
   */
  async function loadSession() {
    const input = document.getElementById('existingSessionId')
    const btn = document.getElementById('loadSessionBtn')
    const messageEl = document.getElementById('loadSessionMessage')
    const container = document.getElementById('restoredLinksContainer')
    const viewerUrlInput = document.getElementById('restoredViewerUrl')
    const controllerUrlInput = document.getElementById('restoredControllerUrl')

    if (
      !input ||
      !btn ||
      !messageEl ||
      !container ||
      !viewerUrlInput ||
      !controllerUrlInput
    ) {
      console.error('Session restore elements not found')
      return
    }

    const sessionId = input.value.trim()
    container.style.display = 'none'

    if (!sessionId) {
      messageEl.textContent =
        globalThis.i18n?.t('messages.enterSessionId') ||
        '❌ Please enter a session ID.'
      messageEl.style.color = '#ef4444'
      input.focus()
      return
    }

    const originalBtnText = btn.innerHTML
    try {
      btn.innerHTML = globalThis.i18n?.t('restore.loading') || '⏳ Loading...'
      btn.disabled = true
      messageEl.textContent =
        globalThis.i18n?.t('messages.checkingSession') || 'Checking session...'
      messageEl.style.color = '#94a3b8'

      const response = await fetch('/api/session/' + sessionId + '/state')
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            globalThis.i18n?.t('restore.notFound') ||
              'Session with this ID not found.'
          )
        }
        throw new Error(
          (globalThis.i18n?.t('restore.serverError') || 'Server error: ') +
            response.status
        )
      }

      const data = await response.json()
      console.log('✅ Session found:', data)
      messageEl.textContent = ''

      const baseUrl = window.location.protocol + '//' + window.location.host
      viewerUrlInput.value = baseUrl + '/s/' + sessionId
      controllerUrlInput.value = baseUrl + '/c/' + sessionId
      // eslint-disable-next-line require-atomic-updates
      container.style.display = 'block'

      setupUrlInputClick(viewerUrlInput)
      setupUrlInputClick(controllerUrlInput)

      if (window.showSuccessNotification) {
        window.showSuccessNotification(
          globalThis.i18n?.t('notifications.sessionFound') ||
            '🎉 Session found!'
        )
      }

      setTimeout(function () {
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } catch (error) {
      console.error('❌ Session load error:', error)
      messageEl.textContent = '❌ ' + error.message
      messageEl.style.color = '#ef4444'
    } finally {
      btn.innerHTML = originalBtnText
      btn.disabled = false
    }
  }

  /**
   * Initialize theme toggle
   */
  function initThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggleBtn')
    if (themeToggleBtn && window.themeManager) {
      const newBtn = themeToggleBtn.cloneNode(true)
      themeToggleBtn.parentNode.replaceChild(newBtn, themeToggleBtn)
      newBtn.addEventListener('click', function () {
        window.themeManager.toggleTheme()
      })
      return true
    }
    return false
  }

  /**
   * Subscription-related state
   */
  let __currentCheckedCustomId = null

  /**
   * Check subscription status for a custom ID
   */
  async function checkSubscriptionStatus(customId) {
    const statusEl = document.getElementById('subscriptionStatus')
    const activateEl = document.getElementById('activateSubscription')
    const msgEl = document.getElementById('activationMessage')

    if (!customId || !validateClientId(customId)) {
      if (statusEl) statusEl.hidden = true
      if (activateEl) activateEl.hidden = true
      return
    }

    __currentCheckedCustomId = customId

    try {
      const response = await fetch(
        '/api/subscription/' + encodeURIComponent(customId) + '/check',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      )

      if (!response.ok) {
        if (statusEl) statusEl.hidden = true
        if (activateEl) activateEl.hidden = true
        return
      }

      const data = await response.json()

      if (statusEl) {
        if (data.active) {
          statusEl.hidden = false
          const expiryEl = document.getElementById('subscriptionExpiry')
          if (expiryEl && data.subscription?.expiresAt) {
            expiryEl.textContent = new Date(
              data.subscription.expiresAt
            ).toLocaleDateString()
          }
        } else {
          statusEl.hidden = true
        }
      }

      if (activateEl) {
        activateEl.hidden = data.active
      }

      if (msgEl) msgEl.textContent = ''
    } catch (err) {
      console.error('⚠️ Subscription check failed:', err)
      if (statusEl) statusEl.hidden = true
      if (activateEl) activateEl.hidden = true
    }
  }

  /**
   * Activate subscription with payment code
   */
  async function activateSubscription() {
    const input = document.getElementById('activationCode')
    const btn = document.getElementById('activateBtn')
    const msgEl = document.getElementById('activationMessage')

    if (!input || !btn || !msgEl) return

    const code = input.value.trim()
    const customId = __currentCheckedCustomId

    if (!code) {
      msgEl.textContent =
        globalThis.i18n?.t('subscription.activatePlaceholder') ||
        'Please enter your activation code'
      msgEl.style.color = '#f87171'
      return
    }

    if (!customId || !validateClientId(customId)) {
      msgEl.textContent =
        globalThis.i18n?.t('subscription.sessionIdLabel') ||
        'Please enter a valid Client ID first'
      msgEl.style.color = '#f87171'
      return
    }

    const originalBtnText = btn.innerHTML
    try {
      btn.innerHTML =
        globalThis.i18n?.t('subscription.activating') || '⏳ Activating...'
      btn.disabled = true
      msgEl.textContent = ''
      msgEl.style.color = ''

      const response = await globalThis.csrfFetch(
        '/api/subscription/' + encodeURIComponent(customId) + '/activate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentToken: code })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(function () {
          return { error: 'Activation failed' }
        })
        throw new Error(errorData.error || 'HTTP ' + response.status)
      }

      const data = await response.json()
      if (data.success) {
        msgEl.textContent =
          globalThis.i18n?.t('subscription.activated') ||
          '✅ Subscription activated!'
        msgEl.style.color = '#4ade80'

        // Re-check status to show active state
        checkSubscriptionStatus(customId)
      }
    } catch (err) {
      console.error('❌ Activation error:', err)
      msgEl.textContent = '❌ ' + err.message
      msgEl.style.color = '#f87171'
    } finally {
      btn.innerHTML = originalBtnText
      btn.disabled = false
    }
  }

  /**
   * Handle subscribe button click — open Telegram bot
   */
  function handleSubscribeClick() {
    const customId = document.getElementById('customClientId')?.value.trim()
    let botLink =
      globalThis.__config?.telegramBotLink ||
      'https://t.me/emdrbilateral_bot'

    // Pass custom ID to bot if entered
    if (customId && validateClientId(customId)) {
      botLink += '?start=' + encodeURIComponent(customId)
    }

    window.open(botLink, '_blank')
  }

  /**
   * Initialize subscription UI
   */
  function initSubscriptionUI() {
    // Subscribe button
    const subscribeBtn = document.getElementById('subscribeBtn')
    if (subscribeBtn) {
      subscribeBtn.addEventListener('click', handleSubscribeClick)
    }

    // Activate button
    const activateBtn = document.getElementById('activateBtn')
    if (activateBtn) {
      activateBtn.addEventListener('click', activateSubscription)
    }

    // Check subscription on client ID input
    const clientIdInput = document.getElementById('customClientId')
    if (clientIdInput) {
      let checkTimer = null
      clientIdInput.addEventListener('input', function (e) {
        clearTimeout(checkTimer)
        checkTimer = setTimeout(function () {
          checkSubscriptionStatus(e.target.value.trim())
        }, 500)
      })
    }

    // Also check subscription when links are generated successfully
    // (handled in generatePermanentLinks success path)
  }

  /**
   * Initialize main page functionality
   */
  function init() {
    resetCreateSessionButton()

    // Data-action button handlers
    document.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const action = this.getAttribute('data-action')
        if (action === 'create-session') createSession()
        else if (action === 'generate-links') generatePermanentLinks()
        else if (action === 'load-session') loadSession()
        else if (action === 'copy') {
          const input = this.closest(
            '.link-group__input-wrapper, .input-group'
          )?.querySelector('input')
          if (input) {
            input.select()
            document.execCommand('copy')
          }
        }
      })
    })

    // Real-time client ID validation
    const clientIdInput = document.getElementById('customClientId')
    if (clientIdInput) {
      clientIdInput.addEventListener('input', function (e) {
        const value = (e.target?.value || '').trim()
        if (!value) {
          updateValidationMessage(
            'Examples: anna_2025, client-ivan, session42',
            false
          )
        } else if (validateClientId(value)) {
          updateValidationMessage(
            globalThis.i18n?.t('validation.clientIdValid') ||
              '✅ Client ID is valid',
            false
          )
        } else {
          updateValidationMessage(
            globalThis.i18n?.t('validation.invalidClientId') ||
              '⚠️ Use latin letters, numbers, _ or - (3-32 characters)',
            true
          )
        }
      })
      clientIdInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          generatePermanentLinks()
        }
      })
    }

    // Initialize subscription UI
    initSubscriptionUI()

    // Theme toggle initialization with retry
    if (!initThemeToggle()) {
      setTimeout(initThemeToggle, 100)
    }

    // Visibility change handler
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) resetCreateSessionButton()
    })
    window.addEventListener('focus', resetCreateSessionButton)

    // Language change handlers
    globalThis.addEventListener(
      'i18nLanguageChanged',
      resetCreateSessionButton
    )
    globalThis.addEventListener('pageshow', function (e) {
      if (e.persisted && globalThis.i18n?.applyTranslations) {
        globalThis.i18n.applyTranslations()
      }
      resetCreateSessionButton()
    })
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // Export for global access
  window.mainPage = {
    createSession: createSession,
    generatePermanentLinks: generatePermanentLinks,
    loadSession: loadSession
  }
})()
