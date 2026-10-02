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
      let sessionId = null

      /* eslint-disable no-await-in-loop */
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 600 * attempt))
        }
        try {
          let response = await (globalThis.csrfFetch || fetch)('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          if (!response || !response.ok) {
            response = await fetch('/api/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            })
          }
          if (response && response.ok) {
            const contentType = response.headers.get('content-type')
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json()
              if (data && data.sessionId) {
                sessionId = data.sessionId
                break
              }
            } else {
              const text = await response.text()
              if (text && (text.includes('Starting Server') || text.includes('<!doctype'))) {
                console.warn('Server is starting up, retrying attempt ' + (attempt + 1) + '...')
                continue
              }
            }
          }
        } catch (err) {
          console.warn('Session create attempt ' + (attempt + 1) + ' failed:', err)
        }
      }
      /* eslint-enable no-await-in-loop */

      if (!sessionId) {
        console.error('Session created but ID not received')
        alert(
          globalThis.i18n?.t('session.createError') ||
            'Unable to create session. Please wait a moment and try again.'
        )
        return
      }

      // Fire controller connect asynchronously so user transitions immediately
      try {
        const connectPromise = (globalThis.csrfFetch || fetch)(
          '/api/session/' + sessionId + '/controller/connect',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          }
        )
        // Give 150ms for optimistic connect, don't block navigation
        await Promise.race([
          connectPromise,
          new Promise((r) => setTimeout(r, 150))
        ])
      } catch (_) {
        /* Controller page will reconnect automatically on load */
      }

      // Track session creation in Metrika (via event system)
      try {
        globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_created'))
      } catch (_) {
        /* noop */
      }
      saveRecentSession(sessionId)
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
   * Validate client ID format: 3-32 chars, only a-z, 0-9, _ or -
   */
  function validateClientId(clientId) {
    return /^[a-z0-9_-]{3,32}$/.test(clientId)
  }

  const CLIENT_ID_ICONS = {
    success:
      '<svg class="hub-indicator-icon hub-indicator-icon--success" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>',
    error:
      '<svg class="hub-indicator-icon hub-indicator-icon--error" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>',
    warning:
      '<svg class="hub-indicator-icon hub-indicator-icon--warning" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>'
  }

  /**
   * Update visual indicator next to / inside the #customClientId input
   */
  function updateClientIdIndicator(state, tooltip = '') {
    const indicator = document.getElementById('customClientIdIndicator')
    if (!indicator) return

    indicator.classList.remove(
      'hub-input-indicator--visible',
      'hub-input-indicator--success',
      'hub-input-indicator--error',
      'hub-input-indicator--warning'
    )

    if (!state || state === 'none') {
      indicator.innerHTML = ''
      indicator.removeAttribute('title')
      indicator.removeAttribute('aria-label')
      return
    }

    if (CLIENT_ID_ICONS[state]) {
      indicator.innerHTML = CLIENT_ID_ICONS[state]
      indicator.classList.add(
        'hub-input-indicator--visible',
        'hub-input-indicator--' + state
      )
      if (tooltip) {
        indicator.setAttribute('title', tooltip)
        indicator.setAttribute('aria-label', tooltip)
      } else {
        indicator.removeAttribute('title')
        indicator.removeAttribute('aria-label')
      }
    }
  }

  /**
   * Update validation message display, toggle error styling, and update indicator
   */
  function updateValidationMessage(
    message,
    isError,
    isSuccess = false,
    status = null
  ) {
    const msgElement = document.getElementById('linkValidationMessage')
    if (msgElement) {
      msgElement.textContent = message
      msgElement.classList.toggle('hub-validation--error', Boolean(isError))
      msgElement.classList.toggle('hub-validation--success', Boolean(isSuccess))
    }
    const input = document.getElementById('customClientId')
    if (input) {
      input.classList.toggle('hub-input--error', Boolean(isError))
      input.classList.toggle('hub-input--valid', Boolean(isSuccess))
      if (isError) {
        input.setAttribute('aria-invalid', 'true')
      } else {
        input.removeAttribute('aria-invalid')
      }
    }

    const state =
      status || (isError ? 'error' : isSuccess ? 'success' : 'none')
    updateClientIdIndicator(state, message)
  }

  /**
   * Perform real-time validation on #customClientId input.
   * Immediately flags any disallowed characters (not a-z, 0-9, _ or -).
   */
  function validateCustomClientIdInput() {
    const input = document.getElementById('customClientId')
    if (!input) return { valid: false, empty: true }

    const rawValue = input.value || ''

    if (!rawValue) {
      updateValidationMessage(
        globalThis.i18n?.t('links.examples') ||
          'Examples: anna_2025, client-ivan, session42',
        false,
        false,
        'none'
      )
      return { valid: false, empty: true }
    }

    // Check for any characters that are not allowed (not a-z, 0-9, _ or -)
    const illegalMatches = rawValue.match(/[^a-z0-9_-]/g)
    if (illegalMatches && illegalMatches.length > 0) {
      const uniqueIllegal = [...new Set(illegalMatches)]
        .map((c) => (c === ' ' ? 'space' : `"${c}"`))
        .join(', ')

      const template =
        globalThis.i18n?.t('validation.disallowedCharacters') ||
        '❌ Disallowed character: {{chars}}. Only a-z, 0-9, _ or - are allowed'
      const msg = template.replace('{{chars}}', uniqueIllegal)

      updateValidationMessage(msg, true, false, 'error')
      return { valid: false, disallowedChars: uniqueIllegal }
    }

    // Characters are allowed! Check length constraints:
    if (rawValue.length < 3) {
      const template =
        globalThis.i18n?.t('validation.clientIdTooShort') ||
        '⚠️ Enter at least 3 characters (currently {{count}})'
      const msg = template.replace('{{count}}', String(rawValue.length))

      updateValidationMessage(msg, false, false, 'warning')
      return { valid: false, tooShort: true }
    }

    if (rawValue.length > 32) {
      const msg =
        globalThis.i18n?.t('validation.invalidClientId') ||
        '❌ Max 32 characters. Use only a-z, 0-9, _ or -'

      updateValidationMessage(msg, true, false, 'error')
      return { valid: false, tooLong: true }
    }

    // Valid: 3-32 chars of a-z, 0-9, _ or -
    updateValidationMessage(
      globalThis.i18n?.t('validation.clientIdValid') ||
        '✅ Client ID is valid',
      false,
      true,
      'success'
    )
    return { valid: true }
  }

  /**
   * Trigger a CSS shake animation on an input element
   */
  function triggerInputShake(input) {
    if (!input) return
    input.classList.remove('hub-input--shake')
    // Force reflow so animation restarts cleanly on repeated attempts
    void input.offsetWidth
    input.classList.add('hub-input--shake')
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      input.classList.remove('hub-input--shake')
      input.removeEventListener('animationend', cleanup)
    }
    input.addEventListener('animationend', cleanup)
    setTimeout(cleanup, 500)
  }

  const CHECKMARK_ICON_SVG =
    '<svg class="hub-copy-btn__check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" class="hub-checkmark-path"></polyline></svg>'

  /**
   * Trigger checkmark animation and color change on copy button
   */
  function triggerCopySuccessAnimation(btn) {
    if (!btn) return

    // If button is already in copied state, clear existing timer
    if (btn._copyTimeout) {
      clearTimeout(btn._copyTimeout)
      btn._copyTimeout = null
    } else {
      btn._originalHtml = btn.innerHTML
      btn._originalAriaLabel = btn.getAttribute('aria-label') || ''
    }

    btn.innerHTML = CHECKMARK_ICON_SVG
    btn.classList.add('hub-copy-btn--copied')
    btn.setAttribute(
      'aria-label',
      globalThis.i18n?.t('links.copied') || 'Copied!'
    )

    btn._copyTimeout = setTimeout(function () {
      btn.classList.remove('hub-copy-btn--copied')
      if (btn._originalHtml !== undefined && btn._originalHtml !== null) {
        btn.innerHTML = btn._originalHtml
      }
      if (btn._originalAriaLabel) {
        btn.setAttribute('aria-label', btn._originalAriaLabel)
      } else {
        btn.removeAttribute('aria-label')
      }
      btn._copyTimeout = null
      btn._originalHtml = null
      btn._originalAriaLabel = null
    }, 1800)
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
    const rawValue = input.value || ''
    const clientId = rawValue.trim()

    if (!clientId) {
      updateValidationMessage(
        globalThis.i18n?.t('links.validationEmpty') ||
          '❌ Please enter a client ID',
        true,
        false
      )
      triggerInputShake(input)
      input.focus()
      return
    }

    const valResult = validateCustomClientIdInput()
    if (!valResult.valid) {
      if (valResult.tooShort) {
        updateValidationMessage(
          globalThis.i18n?.t('links.validationFormat') ||
            '❌ Invalid format. Use only a-z, 0-9, _ or - (3-32 characters)',
          true,
          false
        )
      }
      triggerInputShake(input)
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
      const response = await globalThis.csrfFetch(
        '/api/session/' + clientId + '/reserve',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(function () {
          return {
            error: globalThis.i18n?.t('links.errorUnknown') || 'Unknown error'
          }
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
          throw new Error(
            globalThis.i18n?.t(errorData.i18nKey) ||
              errorData.error ||
              'HTTP ' + response.status
          )
        }
        throw new Error(errorData.error || 'HTTP ' + response.status)
      }

      const data = await response.json()
      saveRecentSession(clientId)
      if (viewerUrlInput) viewerUrlInput.value = data.viewerUrl
      if (controllerUrlInput) controllerUrlInput.value = data.controllerUrl
      if (container) container.style.display = 'block'
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_metrika_permanent_link_created', {
            detail: { clientId: clientId }
          })
        )
      } catch (_) {
        /* noop */
      }

      // Hide subscription prompt if previously shown
      const prompt = document.getElementById('subscribePrompt')
      if (prompt) prompt.style.display = 'none'

      setupUrlInputClick(viewerUrlInput)
      setupUrlInputClick(controllerUrlInput)

      updateValidationMessage(
        globalThis.i18n?.t('links.createdSuccess') ||
          '✅ Links created successfully!',
        false,
        true
      )

      if (window.showSuccessNotification) {
        window.showSuccessNotification(
          globalThis.i18n?.t('links.createdNotification') ||
            '🎉 Permanent links created!'
        )
      }

      setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 100)
    } catch (error) {
      console.error('❌ Error creating permanent links:', error)
      updateValidationMessage('❌ ' + error.message, true)
      triggerInputShake(input)
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
      saveRecentSession(sessionId)

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

      setTimeout(() => {
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

  const RECENT_SESSIONS_STORAGE_KEY = 'bb_recent_sessions'
  const MAX_RECENT_SESSIONS = 10

  /**
   * Get list of recent sessions from localStorage
   * Returns array of { id: string, timestamp: number }
   */
  function getRecentSessions() {
    try {
      const raw = localStorage.getItem(RECENT_SESSIONS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      const normalized = parsed
        .map(function (item) {
          if (typeof item === 'string' && item.trim()) {
            return { id: item.trim(), timestamp: Date.now() }
          }
          if (item && typeof item.id === 'string' && item.id.trim()) {
            return {
              id: item.id.trim(),
              timestamp:
                typeof item.timestamp === 'number'
                  ? item.timestamp
                  : Date.now()
            }
          }
          return null
        })
        .filter(Boolean)

      const seen = new Set()
      const unique = []
      for (const entry of normalized) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id)
          unique.push(entry)
        }
      }
      return unique.slice(0, MAX_RECENT_SESSIONS)
    } catch (e) {
      console.warn('Failed to parse recent sessions from localStorage:', e)
      return []
    }
  }

  /**
   * Save a session ID to recent sessions
   */
  function saveRecentSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return
    const trimmed = sessionId.trim()
    if (!trimmed) return

    try {
      const existing = getRecentSessions()
      const filtered = existing.filter(function (s) {
        return s.id !== trimmed
      })
      filtered.unshift({ id: trimmed, timestamp: Date.now() })
      const toStore = filtered.slice(0, MAX_RECENT_SESSIONS)
      localStorage.setItem(
        RECENT_SESSIONS_STORAGE_KEY,
        JSON.stringify(toStore)
      )
      renderRecentSessionsUI()
    } catch (e) {
      console.warn('Failed to save recent session to localStorage:', e)
    }
  }

  /**
   * Remove a single session from recent sessions
   */
  function removeRecentSession(sessionId) {
    if (!sessionId) return
    try {
      const existing = getRecentSessions()
      const filtered = existing.filter(function (s) {
        return s.id !== sessionId
      })
      localStorage.setItem(
        RECENT_SESSIONS_STORAGE_KEY,
        JSON.stringify(filtered)
      )
      renderRecentSessionsUI()
    } catch (e) {
      console.warn('Failed to remove recent session from localStorage:', e)
    }
  }

  /**
   * Clear all recent sessions
   */
  function clearRecentSessions() {
    try {
      localStorage.removeItem(RECENT_SESSIONS_STORAGE_KEY)
      renderRecentSessionsUI()
    } catch (e) {
      console.warn('Failed to clear recent sessions from localStorage:', e)
    }
  }

  /**
   * Helper to format relative time for display
   */
  function formatRelativeTime(timestamp) {
    if (!timestamp) return ''
    const diffSec = Math.floor((Date.now() - timestamp) / 1000)
    if (diffSec < 60) {
      return globalThis.i18n?.t('restore.justNow') || 'just now'
    }
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) {
      return `${diffMin}m`
    }
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) {
      return `${diffHours}h`
    }
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) {
      return `${diffDays}d`
    }
    try {
      return new Date(timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      })
    } catch (_) {
      return `${diffDays}d`
    }
  }

  /**
   * Select a session from history and load it
   */
  function selectRecentSession(sessionId) {
    const input = document.getElementById('existingSessionId')
    const messageEl = document.getElementById('loadSessionMessage')
    if (input) {
      input.value = sessionId
      if (messageEl) messageEl.textContent = ''
      loadSession()
    }
  }

  /**
   * Render the recent sessions UI in the Restore section
   */
  function renderRecentSessionsUI() {
    const container = document.getElementById('sessionHistoryContainer')
    const list = document.getElementById('sessionHistoryList')
    if (!container || !list) return

    const sessions = getRecentSessions()
    if (!sessions || sessions.length === 0) {
      container.style.display = 'none'
      list.innerHTML = ''
      return
    }

    container.style.display = 'flex'
    list.innerHTML = ''

    sessions.forEach(function (session) {
      const item = document.createElement('div')
      item.className = 'hub-history__item'
      item.setAttribute('role', 'listitem')

      const chipBtn = document.createElement('button')
      chipBtn.type = 'button'
      chipBtn.className = 'hub-history__chip-btn'
      const tooltip =
        (globalThis.i18n?.t('restore.useSession') || 'Load session') +
        ' ' +
        session.id
      chipBtn.title = tooltip
      chipBtn.setAttribute('aria-label', tooltip)

      const chipIcon = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg'
      )
      chipIcon.setAttribute('class', 'hub-history__chip-icon')
      chipIcon.setAttribute('width', '12')
      chipIcon.setAttribute('height', '12')
      chipIcon.setAttribute('viewBox', '0 0 24 24')
      chipIcon.setAttribute('fill', 'none')
      chipIcon.setAttribute('stroke', 'currentColor')
      chipIcon.setAttribute('stroke-width', '2.2')
      chipIcon.setAttribute('stroke-linecap', 'round')
      chipIcon.setAttribute('stroke-linejoin', 'round')
      chipIcon.setAttribute('aria-hidden', 'true')
      chipIcon.innerHTML =
        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>' +
        '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'

      const idSpan = document.createElement('span')
      idSpan.className = 'hub-history__chip-id'
      idSpan.textContent = session.id

      chipBtn.appendChild(chipIcon)
      chipBtn.appendChild(idSpan)

      const timeText = formatRelativeTime(session.timestamp)
      if (timeText) {
        const timeSpan = document.createElement('span')
        timeSpan.className = 'hub-history__chip-time'
        timeSpan.textContent = timeText
        chipBtn.appendChild(timeSpan)
      }

      chipBtn.addEventListener('click', function () {
        selectRecentSession(session.id)
      })

      const delBtn = document.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'hub-history__del-btn'
      const removeLabel =
        (globalThis.i18n?.t('restore.removeSession') ||
          'Remove from history') +
        ' ' +
        session.id
      delBtn.title = removeLabel
      delBtn.setAttribute('aria-label', removeLabel)

      const delIcon = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg'
      )
      delIcon.setAttribute('width', '10')
      delIcon.setAttribute('height', '10')
      delIcon.setAttribute('viewBox', '0 0 24 24')
      delIcon.setAttribute('fill', 'none')
      delIcon.setAttribute('stroke', 'currentColor')
      delIcon.setAttribute('stroke-width', '2.5')
      delIcon.setAttribute('stroke-linecap', 'round')
      delIcon.setAttribute('stroke-linejoin', 'round')
      delIcon.setAttribute('aria-hidden', 'true')
      delIcon.innerHTML =
        '<line x1="18" y1="6" x2="6" y2="18"/>' +
        '<line x1="6" y1="6" x2="18" y2="18"/>'

      delBtn.appendChild(delIcon)

      delBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        removeRecentSession(session.id)
      })

      item.appendChild(chipBtn)
      item.appendChild(delBtn)
      list.appendChild(item)
    })
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
   * Opens Telegram bot synchronously (to avoid popup blocker), then checks
   * subscription status in background.
   */
  function handleSubscribeClick(e) {
    if (e) e.preventDefault()
    try {
      globalThis.dispatchEvent(new CustomEvent('bb_metrika_subscribe_clicked'))
    } catch (_) {
      /* noop */
    }
    const customId =
      document.getElementById('customClientId')?.value.trim() || ''
    let botLink =
      globalThis.__config?.telegramBotLink || 'https://t.me/emdrbilateral_bot'
    const siteLang = globalThis.i18n?.currentLanguage || 'en'

    if (!customId || !validateClientId(customId)) {
      // No customId — open bot with site language
      botLink += '?start=__lang_' + siteLang
      openTelegramBot(botLink)
      return
    }

    // Build the bot link with customId
    botLink += '?start=' + encodeURIComponent(customId + '__lang_' + siteLang)

    // Open Telegram bot synchronously (bypass popup blocker)
    openTelegramBot(botLink)

    // Start polling subscription status in the background
    startSubscriptionPolling(customId, null)
  }

  /**
   * Open Telegram link in a new tab.
   * Must be called synchronously from a user click handler (no async/await before it).
   */
  function openTelegramBot(url) {
    window.open(url, '_blank', 'noopener,noreferrer')
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
      btn.innerHTML =
        globalThis.i18n?.t('subscription.polling') ||
        '⏳ Waiting for payment...'
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
        const msgEl = document.getElementById('subStatusMessage')
        if (msgEl) {
          msgEl.textContent =
            globalThis.i18n?.t('subscription.pollingTimeout') ||
            '⏰ Payment not detected. Complete payment in Telegram and try again.'
          msgEl.style.color = '#f59e0b'
        }
        const promptMsgEl = document.getElementById('subscribePromptStatus')
        if (promptMsgEl) {
          promptMsgEl.textContent =
            globalThis.i18n?.t('subscription.pollingTimeout') ||
            '⏰ Payment not detected. Complete payment in Telegram and try again.'
          promptMsgEl.style.color = '#f59e0b'
        }
        return
      }

      try {
        const response = await globalThis.csrfFetch(
          '/api/subscription/' + encodeURIComponent(customId) + '/check',
          {
            method: 'POST'
          }
        )
        const data = await response.json()

        if (data.active) {
          clearInterval(poll)
          // Store proof and hide subscribe prompt
          localStorage.setItem('subscriptionProofId', customId)
          const promptHide = document.getElementById('subscribePrompt')
          if (promptHide) promptHide.style.display = 'none'
          const planCard2 = document.getElementById('supporterPlanCard')
          if (planCard2) planCard2.style.display = 'none'
          if (btn) {
            btn.innerHTML =
              globalThis.i18n?.t('subscription.activated') || '✅ Activated!'
            btn.className =
              (btn.className || '') + ' pricing-card__cta--success'
            btn.disabled = true
          }
          const msgEl2 = document.getElementById('subStatusMessage')
          if (msgEl2) {
            msgEl2.textContent =
              globalThis.i18n?.t('subscription.pollingSuccess') ||
              '✅ Payment confirmed! Your Premium is active — create permanent links above!'
            msgEl2.style.color = '#22c55e'
          }
          const promptMsgEl2 = document.getElementById('subscribePromptStatus')
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
    const subscribeBtnTop = document.getElementById('subscribeBtnTop')
    if (subscribeBtnTop) {
      subscribeBtnTop.addEventListener('click', handleSubscribeClick)
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
    const messageEl = document.getElementById('subStatusMessage')
    const checkBtn = document.getElementById('subCheckBtn')

    if (!customId) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.customIdRequired') ||
          '❌ Please enter your custom client ID'
        messageEl.classList.add('hub-validation--error')
      }
      return
    }

    if (!validateClientId(customId)) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('links.validationFormat') || '❌ Invalid format'
        messageEl.classList.add('hub-validation--error')
      }
      return
    }

    if (messageEl) {
      messageEl.textContent = ''
      messageEl.classList.remove('hub-validation--error')
    }

    const originalText = checkBtn ? checkBtn.innerHTML : ''
    try {
      if (checkBtn) {
        checkBtn.innerHTML =
          globalThis.i18n?.t('subscription.checking') || '⏳ Checking...'
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
        // Subscription is active — show active status with expiry
        localStorage.setItem('subscriptionProofId', customId)
        const promptEl = document.getElementById('subscribePrompt')
        if (promptEl) promptEl.style.display = 'none'
        const planCard = document.getElementById('supporterPlanCard')
        if (planCard) planCard.style.display = 'none'
        if (statusEl) {
          statusEl.style.display = 'none'
          statusEl.classList.remove('hub-status--error')
        }
        if (messageEl) {
          messageEl.textContent = ''
          messageEl.classList.remove('hub-validation--error')
        }
        const activationInline = document.getElementById('subActivationInline')
        if (activationInline) activationInline.style.display = 'none'
        // Show active info
        const activeInfo = document.getElementById('subActiveInfo')
        if (activeInfo) activeInfo.style.display = 'block'
        const expiryEl = document.getElementById('subActiveExpiry')
        if (expiryEl && data.subscription?.expiresAt) {
          expiryEl.textContent = new Date(
            data.subscription.expiresAt
          ).toLocaleDateString(globalThis.i18n?.currentLanguage || 'en', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        }
        return
      } else {
        localStorage.removeItem('subscriptionProofId')
        if (statusEl) {
          statusEl.style.display = 'flex'
          statusEl.classList.add('hub-status--error')
        }
        if (statusIcon) {
          statusIcon.textContent = '✗'
        }
        if (statusText) {
          statusText.textContent =
            globalThis.i18n?.t('subscription.required') ||
            'Subscription required'
        }
        const activeInfo = document.getElementById('subActiveInfo')
        if (activeInfo) activeInfo.style.display = 'none'
        const activationInline2 = document.getElementById(
          'subActivationInline'
        )
        if (activationInline2) activationInline2.style.display = 'block'
        if (messageEl) {
          messageEl.textContent =
            globalThis.i18n?.t('subscription.requiredMessage') || ''
          messageEl.classList.add('hub-validation--error')
        }
      }
    } catch (error) {
      console.error('❌ Subscription check error:', error)
      if (statusEl) statusEl.style.display = 'none'
      const activationInlineErr = document.getElementById(
        'subActivationInline'
      )
      if (activationInlineErr) activationInlineErr.style.display = 'none'
      if (messageEl) {
        messageEl.textContent = '❌ ' + error.message
        messageEl.classList.add('hub-validation--error')
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
    const telegramUserId = document
      .getElementById('subActivateTgIdInline')
      ?.value.trim()
    const messageEl = document.getElementById('subActivateMessageInline')
    const activateBtn = document.getElementById('subActivateBtnInline')

    if (!customId) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.customIdRequired') ||
          '❌ Please enter your custom client ID'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    if (!telegramUserId) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.activateTgRequired') ||
          '❌ Please enter your Telegram User ID'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    const tgIdNum = Number.parseInt(telegramUserId, 10)
    if (!tgIdNum || tgIdNum <= 0) {
      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.activateTgInvalid') ||
          '❌ Invalid Telegram User ID — must be a number'
        messageEl.style.color = '#ef4444'
      }
      return
    }

    const originalText = activateBtn ? activateBtn.textContent : ''
    try {
      if (activateBtn) {
        activateBtn.textContent =
          globalThis.i18n?.t('subscription.activating') || '⏳ Activating...'
        activateBtn.disabled = true
      }

      const response = await globalThis.csrfFetch(
        '/api/subscription/activate-by-telegram',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customId, telegramUserId: tgIdNum })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.message || data.error || 'HTTP ' + response.status
        )
      }

      if (messageEl) {
        messageEl.textContent =
          globalThis.i18n?.t('subscription.activated') ||
          '✅ Subscription activated!'
        messageEl.style.color = '#22c55e'
      }

      // Store proof and hide subscribe prompt in permanent links card
      localStorage.setItem('subscriptionProofId', customId)
      const promptEl2 = document.getElementById('subscribePrompt')
      if (promptEl2) promptEl2.style.display = 'none'
      const planCard3 = document.getElementById('supporterPlanCard')
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
    const activateTgIdInputInline = document.getElementById(
      'subActivateTgIdInline'
    )
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
        else if (action === 'clear-history') clearRecentSessions()
        else if (action === 'copy') {
          const targetId = this.getAttribute('data-target')
          const input =
            (targetId ? document.getElementById(targetId) : null) ||
            this.closest(
              '.hub-link-full, .link-group__input-wrapper, .input-group'
            )?.querySelector('input')
          if (input) {
            input.select()
            const textToCopy = input.value || ''
            const copyBtn = this
            const onCopied = () => {
              triggerCopySuccessAnimation(copyBtn)
              if (window.showSuccessNotification) {
                window.showSuccessNotification(
                  globalThis.i18n?.t('links.copied') || 'Link copied!'
                )
              }
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard
                .writeText(textToCopy)
                .then(onCopied)
                .catch(() => {
                  try {
                    document.execCommand('copy')
                    onCopied()
                  } catch (e) {
                    // copy fallback failed
                  }
                })
            } else {
              try {
                document.execCommand('copy')
                onCopied()
              } catch (e) {
                // copy failed
              }
            }
          }
        }
      })
    })

    // Real-time client ID validation
    const clientIdInput = document.getElementById('customClientId')
    if (clientIdInput) {
      clientIdInput.addEventListener('input', validateCustomClientIdInput)
      clientIdInput.addEventListener('change', validateCustomClientIdInput)
      clientIdInput.addEventListener('paste', function () {
        setTimeout(validateCustomClientIdInput, 0)
      })
      clientIdInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          generatePermanentLinks()
        }
      })
      if (clientIdInput.value) {
        validateCustomClientIdInput()
      }
    }

    // Initialize subscription UI
    initSubscriptionUI()
    initSubscriptionManagementUI()

    // If we have a stored subscription proof, hide the subscribe prompt on page load
    // and pre-fill the customId input in subscription management
    const savedProof = localStorage.getItem('subscriptionProofId')
    if (savedProof) {
      const promptEl3 = document.getElementById('subscribePrompt')
      if (promptEl3) promptEl3.style.display = 'none'
      const planCard4 = document.getElementById('supporterPlanCard')
      if (planCard4) planCard4.style.display = 'none'
      // Also pre-fill the subscription management customId for convenience
      const subCustomIdInput = document.getElementById('subCustomId')
      if (subCustomIdInput && !subCustomIdInput.value) {
        subCustomIdInput.value = savedProof
      }
    }

    // Auto-fill customId from ?client= URL param (sent from Telegram bot after payment)
    const urlClient = new URLSearchParams(window.location.search).get('client')
    if (urlClient) {
      const customIdInput = document.getElementById('customClientId')
      if (customIdInput && !customIdInput.value) {
        customIdInput.value = urlClient
        validateCustomClientIdInput()
      }
      const subCustomIdInput = document.getElementById('subCustomId')
      if (subCustomIdInput && !subCustomIdInput.value) {
        subCustomIdInput.value = urlClient
      }
    }

    // Export for global access
    window.subscriptionManagement = {
      checkStatus: checkSubscriptionStatus
    }

    // Initialize session history UI
    renderRecentSessionsUI()

    const restoreDetails = document.getElementById('restoreDetails')
    if (restoreDetails) {
      restoreDetails.addEventListener('toggle', function () {
        if (restoreDetails.open) {
          renderRecentSessionsUI()
        }
      })
    }

    const existingSessionInput = document.getElementById('existingSessionId')
    if (existingSessionInput) {
      existingSessionInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault()
          loadSession()
        }
      })
    }

    window.addEventListener('storage', function (e) {
      if (e.key === RECENT_SESSIONS_STORAGE_KEY) {
        renderRecentSessionsUI()
      }
    })

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
    globalThis.addEventListener('i18nLanguageChanged', function () {
      resetCreateSessionButton()
      validateCustomClientIdInput()
      renderRecentSessionsUI()
    })
    globalThis.addEventListener('pageshow', function (e) {
      if (e.persisted && globalThis.i18n?.applyTranslations) {
        globalThis.i18n.applyTranslations()
      }
      resetCreateSessionButton()
      renderRecentSessionsUI()
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
    loadSession: loadSession,
    triggerCopySuccessAnimation: triggerCopySuccessAnimation,
    triggerInputShake: triggerInputShake,
    validateCustomClientIdInput: validateCustomClientIdInput,
    getRecentSessions: getRecentSessions,
    saveRecentSession: saveRecentSession,
    removeRecentSession: removeRecentSession,
    clearRecentSessions: clearRecentSessions,
    renderRecentSessionsUI: renderRecentSessionsUI
  }
})()
