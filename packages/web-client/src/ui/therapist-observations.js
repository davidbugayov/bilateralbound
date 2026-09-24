/**
 * Therapist Observations (Local-Only, Confidential)
 *
 * Provides a private scratchpad/notes area for therapists during active EMDR sessions.
 * PRIVACY GUARANTEES:
 * - Local-only: content stays exclusively in browser DOM memory during the active session.
 * - Zero persistence: never saved to localStorage, indexedDB, or cookies.
 * - Zero network sync: never sent via WebSockets, REST endpoints, or telemetry.
 * - Auto-destroy on session end: wiped completely on resetSession() and page unload.
 */

'use strict'

let textareaEl = null
let charCountEl = null
let clearBtnEl = null
let copyBtnEl = null
let timestampBtnEl = null

function updateCharCount() {
  if (!textareaEl || !charCountEl) return
  const len = textareaEl.value.length
  const words = textareaEl.value.trim() ? textareaEl.value.trim().split(/\s+/).length : 0
  const charLabel = globalThis.i18n?.t('controller.observationsChars') || 'chars'
  const wordLabel = globalThis.i18n?.t('controller.observationsWords') || 'words'
  charCountEl.textContent = `${len} ${charLabel} • ${words} ${wordLabel}`
}

function autoResize() {
  if (!textareaEl) return
  textareaEl.style.height = 'auto'
  const newHeight = Math.min(Math.max(textareaEl.scrollHeight, 96), 260)
  textareaEl.style.height = `${newHeight}px`
}

function insertTimestamp() {
  if (!textareaEl) return
  const timerEl = document.getElementById('bbTimer')
  let timeStr = ''

  if (timerEl && timerEl.textContent && timerEl.textContent.trim() !== '0:00') {
    timeStr = `[${timerEl.textContent.trim()}] `
  } else {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    timeStr = `[${hh}:${mm}:${ss}] `
  }

  const start = textareaEl.selectionStart
  const end = textareaEl.selectionEnd
  const val = textareaEl.value

  const prefix = (start > 0 && val[start - 1] !== '\n') ? '\n' : ''
  const insertion = `${prefix}${timeStr}`
  textareaEl.value = val.substring(0, start) + insertion + val.substring(end)
  const newCursor = start + insertion.length
  textareaEl.setSelectionRange(newCursor, newCursor)
  textareaEl.focus()

  updateCharCount()
  autoResize()
}

async function copyObservations() {
  if (!textareaEl) return
  const text = textareaEl.value
  if (!text) {
    if (typeof globalThis.showNotification === 'function') {
      const msg = globalThis.i18n?.t('controller.observationsEmptyNotice') || 'No observations to copy'
      globalThis.showNotification(msg, 'info')
    }
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      textareaEl.select()
      document.execCommand('copy')
    }

    if (copyBtnEl) {
      const origText = copyBtnEl.innerHTML
      copyBtnEl.innerHTML = `✅ <span data-i18n="controller.observationsCopied">${globalThis.i18n?.t('controller.observationsCopied') || 'Copied!'}</span>`
      setTimeout(() => {
        if (copyBtnEl) copyBtnEl.innerHTML = origText
      }, 1800)
    }

    if (typeof globalThis.showNotification === 'function') {
      const msg = globalThis.i18n?.t('controller.observationsCopied') || 'Observations copied to clipboard'
      globalThis.showNotification(msg, 'success')
    }
  } catch (err) {
    console.error('Failed to copy observations:', err)
  }
}

function clearTherapistObservations() {
  if (textareaEl) {
    textareaEl.value = ''
    autoResize()
    updateCharCount()
  }
}

function handleManualClear() {
  if (!textareaEl) return
  if (!textareaEl.value) return

  clearTherapistObservations()

  if (typeof globalThis.showNotification === 'function') {
    const msg = globalThis.i18n?.t('controller.observationsCleared') || 'Observations cleared'
    globalThis.showNotification(msg, 'info')
  }
}

function initTherapistObservations() {
  textareaEl = document.getElementById('therapistObservationsTextarea')
  charCountEl = document.getElementById('observationsCharCount')
  clearBtnEl = document.getElementById('observationsClearBtn')
  copyBtnEl = document.getElementById('observationsCopyBtn')
  timestampBtnEl = document.getElementById('observationsTimestampBtn')

  if (!textareaEl) return

  textareaEl.addEventListener('input', () => {
    updateCharCount()
    autoResize()
  })

  if (timestampBtnEl) {
    timestampBtnEl.addEventListener('click', insertTimestamp)
  }

  if (copyBtnEl) {
    copyBtnEl.addEventListener('click', copyObservations)
  }

  if (clearBtnEl) {
    clearBtnEl.addEventListener('click', handleManualClear)
  }

  // Ensure observations are destroyed on page unload / navigation away
  window.addEventListener('pagehide', clearTherapistObservations)
  window.addEventListener('beforeunload', clearTherapistObservations)

  // Listen for custom session reset events
  window.addEventListener('bb_session_reset', clearTherapistObservations)

  updateCharCount()
}

// Expose on globalThis for convenient integration with resetSession
globalThis.clearTherapistObservations = clearTherapistObservations
globalThis.initTherapistObservations = initTherapistObservations

module.exports = {
  initTherapistObservations,
  clearTherapistObservations
}
