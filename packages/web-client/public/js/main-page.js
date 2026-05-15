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

      // Send proofCustomId if we have a linked subscription — allows auto-linking new IDs
      const proofCustomId = localStorage.getItem('subscriptionProofId') || null
      const body = proofCustomId ? JSON.stringify({ proofCustomId }) : '{}'
      const response = await globalThis.csrfFetch('/api/session/' + clientId + '/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      })

      if (!response.ok) {
        const errorData = await response.json().catch(function () {
          return { error: globalThis.i18n?.t('links.errorUnknown') || 'Unknown error' }
        })

        // Subscription required (402) — show inline support prompt
        if (response.status === 402) {
          const prompt = document.getElementById('subscribePrompt')
          if (prompt) prompt.style.display = 'flex'
          if (container) container.style.display = 'none'
          updateValidationMessage('', false)
          return
        }

        if (errorData.i18nKey) {
          throw new Error(globalThis.i18n?.t(errorData.i18nKey) || errorData.error || 'HTTP ' + response.status)
        }
        throw new Error(errorData.error || 'HTTP ' + response.status)
      }

      const data = await response.json()
      if (viewerUrlInput) viewerUrlInput.value = data.viewerUrl
      if (controllerUrlInput) controllerUrlInput.value = data.controllerUrl
      if (container) container.style.display = 'block'

      // Hide subscription prompt if previously shown
      const prompt = document.getElementById('subscribePrompt')
      if (prompt) prompt.style.display = 'none'

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
   * Handle subscribe button click.
   * 1. If customId is entered, check if already linked to active subscription.
   * 2. If already active → show message, don't redirect (no repeat payment).
   * 3. If not active → open Telegram bot with /start customId.
   */
  async function handleSubscribeClick() {
    const customId = document.getElementById('customClientId')?.value.trim()
    const subscribeBtn = document.getElementById('subscribeBtn')
    let botLink =
      globalThis.__config?.telegramBotLink ||
      'https://t.me/emdrbilateral_bot'

    if (!customId || !validateClientId(customId)) {
      // No customId — open bot with site language
      const siteLang = globalThis.i18n?.currentLanguage || 'en'
      botLink += '?start=__lang_' + siteLang
      window.open(botLink, '_blank')
      return
    }

    // Check if this customId is already linked to an active subscription
    const originalText = subscribeBtn ? subscribeBtn.innerHTML : ''
    try {
      if (subscribeBtn) {
        subscribeBtn.innerHTML = globalThis.i18n?.t('subscription.checking') || '⏳ Checking...'
        subscribeBtn.disabled = true
      }

      const response = await fetch('/api/subscription/' + encodeURIComponent(customId) + '/check', {
        method: 'POST'
      })
      const data = await response.json()

      if (data.active) {
        // Already subscribed — no need to open Telegram
        localStorage.setItem('subscriptionProofId', customId)
        var promptHide2 = document.getElementById('subscribePrompt')
        if (promptHide2) promptHide2.style.display = 'none'
        var messageEl = document.getElementById('subStatusMessage')
        if (messageEl) {
          messageEl.textContent =
            globalThis.i18n?.t('subscription.alreadyActive') || '✅ Premium Active — create permanent links above!'
          messageEl.style.color = '#22c55e'
        }
        var promptStatusEl = document.getElementById('subscribePromptStatus')
        if (promptStatusEl) {
          promptStatusEl.textContent =
            globalThis.i18n?.t('subscription.alreadyActive') || '✅ Premium Active — create permanent links above!'
          promptStatusEl.style.color = '#22c55e'
        }
        return
      }
    } catch (_err) {
      // If check fails, proceed to Telegram anyway
      console.warn('⚠️ Subscription check failed, proceeding to Telegram:', _err)
    } finally {
      if (subscribeBtn) {
        subscribeBtn.innerHTML = originalText
        subscribeBtn.disabled = false
      }
    }

    // Not subscribed — open Telegram bot with customId + site language
    const siteLang = globalThis.i18n?.currentLanguage || 'en'
    botLink += '?start=' + encodeURIComponent(customId + '__lang_' + siteLang)
    window.open(botLink, '_blank')

    // Start polling subscription status — user pays in bot and returns here
    startSubscriptionPolling(customId, subscribeBtn)
  }

  /**
   * Poll subscription check after opening Telegram bot.
   * Polls every 3 seconds for up to 2 minutes (40 attempts).
   * Shows progress feedback on the subscribe button.
   */
  function startSubscriptionPolling(customId, btn) {
    const MAX_POLLS = 40
    const POLL_INTERVAL = 3000
    let attempts = 0
    const originalText = btn ? btn.innerHTML : ''

    // Show initial polling state
    if (btn) {
      btn.innerHTML = globalThis.i18n?.t('subscription.polling') || '⏳ Waiting for payment...'
      btn.disabled = true
    }

    const poll = setInterval(async function () {
      attempts++
      if (attempts > MAX_POLLS) {
        clearInterval(poll)
        if (btn) {
          btn.innerHTML = originalText
          btn.disabled = false
        }
        var msgEl = document.getElementById('subStatusMessage')
        if (msgEl) {
          msgEl.textContent =
            globalThis.i18n?.t('subscription.pollingTimeout') ||
            '⏰ Payment not detected. Complete payment in Telegram and try again.'
          msgEl.style.color = '#f59e0b'
        }
        var promptMsgEl = document.getElementById('subscribePromptStatus')
        if (promptMsgEl) {
          promptMsgEl.textContent =
            globalThis.i18n?.t('subscription.pollingTimeout') ||
            '⏰ Payment not detected. Complete payment in Telegram and try again.'
          promptMsgEl.style.color = '#f59e0b'
        }
        return
      }

      try {
        const response = await fetch('/api/subscription/' + encodeURIComponent(customId) + '/check', {
          method: 'POST'
        })
        const data = await response.json()

        if (data.active) {
          clearInterval(poll)
          // Store proof and hide subscribe prompt
          localStorage.setItem('subscriptionProofId', customId)
          var promptHide = document.getElementById('subscribePrompt')
          if (promptHide) promptHide.style.display = 'none'
          var planCard2 = document.getElementById('supporterPlanCard')
          if (planCard2) planCard2.style.display = 'none'
          if (btn) {
            btn.innerHTML = globalThis.i18n?.t('subscription.activated') || '✅ Activated!'
            btn.className = (btn.className || '') + ' pricing-card__cta--success'
            btn.disabled = true
          }
          var msgEl2 = document.getElementById('subStatusMessage')
          if (msgEl2) {
            msgEl2.textContent =
              globalThis.i18n?.t('subscription.pollingSuccess') ||
              '✅ Payment confirmed! Your Premium is active — create permanent links above!'
            msgEl2.style.color = '#22c55e'
          }
          var promptMsgEl2 = document.getElementById('subscribePromptStatus')
          if (promptMsgEl2) {
            promptMsgEl2.textContent =
              globalThis.i18n?.t('subscription.pollingSuccess') ||
              '✅ Payment confirmed! Your Premium is active — create permanent links above!'
            promptMsgEl2.style.color = '#22c55e'
          }
        }
        // Otherwise keep polling
      } catch (_err) {
        // Silently retry
      }
    }, POLL_INTERVAL)
  }

  /**
   * Initialize subscription UI — just wire up the subscribe button
   */
  function initSubscriptionUI() {
    const subscribeBtn = document.getElementById('subscribeBtn')
    if (subscribeBtn) {
      subscribeBtn.addEventListener('click', handleSubscribeClick)
    }
  }

  /* ── Subscription Management ── */

  /**
   * Check subscription status for a custom ID
   */
  async function checkSubscriptionStatus() {
    const customId = document.getElementById('subCustomId')?.value.trim()
    const statusEl = document.getElementById('subStatus')
    const statusIcon = document.getElementById('subStatusIcon')
    const statusText = document.getElementById('subStatusText')
    const actionsEl = document.getElementById('subActions')
    const messageEl = document.getElementById('subStatusMessage')
    const checkBtn = document.getElementById('subCheckBtn')

    if (!customId) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.customIdRequired') || '❌ Please enter your custom client ID'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    if (!validateClientId(customId)) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('links.validationFormat') || '❌ Invalid format'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    if (messageEl) messageEl.textContent = ''

    const originalText = checkBtn ? checkBtn.innerHTML : ''
    try {
      if (checkBtn) {
        checkBtn.innerHTML = globalThis.i18n?.t('subscription.checking') || '⏳ Checking...'
        checkBtn.disabled = true
      }

      const response = await globalThis.csrfFetch(
        '/api/subscription/' + encodeURIComponent(customId) + '/check',
        { method: 'POST' }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'HTTP ' + response.status)
      }

      if (data.active) {
        // Subscription is active — hide all subscription/support info
        localStorage.setItem('subscriptionProofId', customId)
        var promptEl = document.getElementById('subscribePrompt')
        if (promptEl) promptEl.style.display = 'none'
        var planCard = document.getElementById('supporterPlanCard')
        if (planCard) planCard.style.display = 'none'
        var managePanel = document.getElementById('subscriptionManagement')
        if (managePanel) managePanel.style.display = 'none'
        if (statusEl) statusEl.style.display = 'none'
        if (actionsEl) actionsEl.style.display = 'none'
        if (messageEl) messageEl.textContent = ''
        return
      } else {
        localStorage.removeItem('subscriptionProofId')
        if (statusEl) statusEl.style.display = 'flex'
        if (statusIcon) {
          statusIcon.innerHTML = '<span style="color:#ef4444;font-size:1.5rem;">✗</span>'
        }
        if (statusText) {
          statusText.innerHTML =
            '<span style="color:#ef4444">' +
            (globalThis.i18n?.t('subscription.required') || 'Subscription required') +
            '</span>'
        }
        if (actionsEl) actionsEl.style.display = 'none'
        const activationInline = document.getElementById('subActivationInline')
        if (activationInline) activationInline.style.display = 'block'
        if (messageEl) {
          messageEl.textContent = globalThis.i18n?.t('subscription.requiredMessage') || ''
          messageEl.style.color = '#ef4444'
        }
      }
    } catch (error) {
      console.error('❌ Subscription check error:', error)
      if (statusEl) statusEl.style.display = 'none'
      if (actionsEl) actionsEl.style.display = 'none'
      const activationInlineErr = document.getElementById('subActivationInline')
      if (activationInlineErr) activationInlineErr.style.display = 'none'
      if (messageEl) {
        messageEl.textContent = '❌ ' + error.message
        messageEl.style.color = '#ef4444'
      }
    } finally {
      if (checkBtn) {
        checkBtn.innerHTML = originalText
        checkBtn.disabled = false
      }
    }
  }

  /**
   * Activate subscription — link customId to an existing paid subscription
   */
  async function activateSubscription() {
    const customId = document.getElementById('subCustomId')?.value.trim()
    const telegramUserId = document.getElementById('subActivateTgIdInline')?.value.trim()
    const messageEl = document.getElementById('subActivateMessageInline')
    const activateBtn = document.getElementById('subActivateBtnInline')

    if (!customId) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.customIdRequired') || '❌ Please enter your custom client ID'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    if (!telegramUserId) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.activateTgRequired') || '❌ Please enter your Telegram User ID'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    const tgIdNum = Number.parseInt(telegramUserId, 10)
    if (!tgIdNum || tgIdNum <= 0) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.activateTgInvalid') || '❌ Invalid Telegram User ID — must be a number'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    const originalText = activateBtn ? activateBtn.textContent : ''
    try {
      if (activateBtn) {
        activateBtn.textContent = globalThis.i18n?.t('subscription.activating') || '⏳ Activating...'
        activateBtn.disabled = true
      }

      const response = await globalThis.csrfFetch('/api/subscription/activate-by-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customId, telegramUserId: tgIdNum })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || data.error || 'HTTP ' + response.status)
      }

      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.activated') || '✅ Subscription activated!'
        messageEl.style.color = '#22c55e'
      }

      // Store proof and hide subscribe prompt in permanent links card
      localStorage.setItem('subscriptionProofId', customId)
      var promptEl2 = document.getElementById('subscribePrompt')
      if (promptEl2) promptEl2.style.display = 'none'
      var planCard3 = document.getElementById('supporterPlanCard')
      if (planCard3) planCard3.style.display = 'none'

      // Refresh status to show management UI
      await checkSubscriptionStatus()
    } catch (error) {
      console.error('❌ Subscription activation error:', error)
      if (messageEl) {
        messageEl.textContent = '❌ ' + error.message
        messageEl.style.color = '#ef4444'
      }
    } finally {
      if (activateBtn) {
        activateBtn.textContent = originalText
        activateBtn.disabled = false
      }
    }
  }

  /**
   * Initialize subscription management UI handlers
   */
  function initSubscriptionManagementUI() {
    const checkBtn = document.getElementById('subCheckBtn')

    // Inline activation button (shown when no subscription found)
    const activateBtnInline = document.getElementById('subActivateBtnInline')
    if (activateBtnInline) {
      activateBtnInline.addEventListener('click', activateSubscription)
    }
    const activateTgIdInputInline = document.getElementById('subActivateTgIdInline')
    if (activateTgIdInputInline) {
      activateTgIdInputInline.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          activateSubscription()
        }
      })
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', checkSubscriptionStatus)
    }

    const customIdInput = document.getElementById('subCustomId')
    if (customIdInput) {
      customIdInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          checkSubscriptionStatus()
        }
      })
    }


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
          var input = this.closest('.hub-link-full, .link-group__input-wrapper, .input-group')?.querySelector('input')
          if (input) {
            input.select()
            document.execCommand('copy')
            if (window.showSuccessNotification) {
              window.showSuccessNotification(
                globalThis.i18n?.t('links.copied') || 'Link copied!'
              )
            }
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
    initSubscriptionManagementUI()

    // If we have a stored subscription proof, hide the subscribe prompt on page load
    // and pre-fill the customId input in subscription management
    var savedProof = localStorage.getItem('subscriptionProofId')
    if (savedProof) {
      var promptEl3 = document.getElementById('subscribePrompt')
      if (promptEl3) promptEl3.style.display = 'none'
      var planCard4 = document.getElementById('supporterPlanCard')
      if (planCard4) planCard4.style.display = 'none'
      // Also pre-fill the subscription management customId for convenience
      var subCustomIdInput = document.getElementById('subCustomId')
      if (subCustomIdInput && !subCustomIdInput.value) {
        subCustomIdInput.value = savedProof
      }
    }

    // Export for global access
    window.subscriptionManagement = {
      checkStatus: checkSubscriptionStatus
    }

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
