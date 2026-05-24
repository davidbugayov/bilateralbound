/* jshint esversion: 11, browser: true */
/**
 * Metrika Events Helper — safely calls Yandex.Metrica goals.
 * Listens for bb_metrika_* CustomEvents dispatched by app code.
 *
 * Usage from any module:
 *   globalThis.dispatchEvent(new CustomEvent('bb_metrika_session_created'))
 *   globalThis.dispatchEvent(new CustomEvent('bb_metrika_viewer_connected'))
 *
 * Events:
 *   bb_metrika_session_created    — new session created
 *   bb_metrika_session_started    — play pressed
 *   bb_metrika_session_stopped    — pause pressed
 *   bb_metrika_viewer_connected   — viewer joined session
 *   bb_metrika_viewer_disconnected — viewer left
 *   bb_metrika_ws_reconnect       — WebSocket reconnected
 *   bb_metrika_ws_error           — WebSocket error
 *   bb_metrika_breathing_started  — breathing exercise started
 *   bb_metrika_session_duration   — detail: { seconds: number }
 *   bb_metrika_settings_changed   — detail: { setting, value }
 *   bb_metrika_permanent_link_created — detail: { clientId }
 *   bb_metrika_subscribe_clicked  — subscribe button clicked
 *   bb_metrika_feature_used       — detail: { feature } (fullscreen, infinity, theme)
 *   bb_metrika_viewer_error       — detail: { message }
 *   bb_metrika_sync_drift         — detail: { driftPx, jitterMs, role }
 *   bb_metrika_session_ready      — viewer+controller both connected
 *
 * Queue behaviour:
 *   Events dispatched before cookie consent (ym not loaded) are queued
 *   and flushed when consent is granted. This prevents silent data loss.
 */
(function () {
  'use strict'

  // Skip analytics on dev/local — prevents polluting production Metrika data
  if (/dev\.emdrbilateral|localhost|127\.0\.0\.1/.test(globalThis.location?.hostname || '')) {
    return
  }

  var YM_ID = 104698530
  var MAX_QUEUE_SIZE = 200

  // Queue of {name, params} for events that arrived before Metrika was loaded
  var pendingEvents = []
  var queueFlushed = false

  /**
   * Push to pending queue — bounded to prevent memory leaks
   */
  function enqueue(name, params) {
    if (pendingEvents.length >= MAX_QUEUE_SIZE) {
      // Drop oldest to make room (shouldn't happen in practice)
      pendingEvents.shift()
    }
    pendingEvents.push({ name: name, params: params || {} })
  }

  /**
   * Drain the pending queue into Metrika
   */
  function flushQueue() {
    if (queueFlushed || typeof globalThis.ym !== 'function') return
    queueFlushed = true

    var events = pendingEvents
    pendingEvents = []

    for (var i = 0; i < events.length; i++) {
      try {
        globalThis.ym(YM_ID, 'reachGoal', events[i].name, events[i].params)
      } catch (_) { /* ignore individual failures */ }
    }

    if (events.length > 0) {
      console.log('[MetrikaEvents] Flushed ' + events.length + ' queued events after consent')
    }
  }

  /**
   * Safe ym() call — queues if Metrika not yet loaded
   */
  function reachGoal(name, params) {
    try {
      if (typeof globalThis.ym === 'function') {
        // Flush any pending events first (belt-and-suspenders)
        flushQueue()
        globalThis.ym(YM_ID, 'reachGoal', name, params || {})
      } else if (!queueFlushed) {
        // ym not loaded yet and consent not yet granted — queue it
        enqueue(name, params)
      }
    } catch (_) { /* ignore */ }
  }

  /**
   * Track session duration when session ends
   */
  function onSessionDuration(e) {
    var seconds = (e.detail && e.detail.seconds) || 0
    if (seconds > 0) {
      reachGoal('session_duration', { seconds: Math.round(seconds) })
    }
  }

  // Map event names to Metrika goal names
  var eventMap = {
    'bb_metrika_session_created': 'session_created',
    'bb_metrika_session_started': 'session_started',
    'bb_metrika_session_stopped': 'session_stopped',
    'bb_metrika_viewer_connected': 'viewer_connected',
    'bb_metrika_viewer_disconnected': 'viewer_disconnected',
    'bb_metrika_ws_reconnect': 'ws_reconnect',
    'bb_metrika_ws_error': 'ws_error',
    'bb_metrika_breathing_started': 'breathing_started',
    'bb_metrika_session_duration': null, // special handler
    'bb_metrika_settings_changed': 'settings_changed',
    'bb_metrika_permanent_link_created': 'permanent_link_created',
    'bb_metrika_subscribe_clicked': 'subscribe_clicked',
    'bb_metrika_feature_used': 'feature_used',
    'bb_metrika_viewer_error': 'viewer_error',
    'bb_metrika_sync_drift': 'sync_drift',
    'bb_metrika_session_ready': 'session_ready'
  }

  function handleEvent(e) {
    var goal = eventMap[e.type]
    if (goal) {
      reachGoal(goal, e.detail || {})
    }
  }

  // Register listeners for all known events
  Object.keys(eventMap).forEach(function (evt) {
    if (evt === 'bb_metrika_session_duration') {
      globalThis.addEventListener(evt, onSessionDuration)
    } else {
      globalThis.addEventListener(evt, handleEvent)
    }
  })

  // Track whether we've sent the initial page_view hit
  var pageViewSent = false

  // When consent is granted after page load — flush queue + fire page_view + cookie_accepted
  globalThis.addEventListener('bb_cookie_consent_accepted', function () {
    flushQueue()
    // Send page_view hit so Metrika knows this page was visited
    // (automatic tracking only works after ym loads, so first visit is lost otherwise)
    if (!pageViewSent) {
      pageViewSent = true
      try {
        if (typeof globalThis.ym === 'function') {
          // Set user params BEFORE hit so they attach to the pageview
          globalThis.ym(YM_ID, 'userParams', {
            screenWidth: globalThis.screen?.width || 0,
            screenHeight: globalThis.screen?.height || 0,
            viewportWidth: globalThis.innerWidth || 0,
            viewportHeight: globalThis.innerHeight || 0
          })
          // Manual hit required because init uses ssr:true (no auto-pageview)
          globalThis.ym(YM_ID, 'hit', globalThis.location.href, {
            referer: document.referrer || undefined
          })
        }
      } catch (_) { /* ignore */ }
    }
    reachGoal('cookie_accepted')
  })

  // When user declines — discard queue, stop collecting (no Metrika, no tracking)
  globalThis.addEventListener('bb_cookie_consent_declined', function () {
    pendingEvents = []
    queueFlushed = true
  })

  // Expose for direct calls and testing
  globalThis.MetrikaEvents = {
    reachGoal: reachGoal,
    flushQueue: flushQueue,
    getPendingCount: function () { return pendingEvents.length },
    ymId: YM_ID
  }
})()
