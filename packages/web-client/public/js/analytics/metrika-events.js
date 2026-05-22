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
 *   bb_metrika_session_created   — new session created
 *   bb_metrika_session_started   — play pressed
 *   bb_metrika_session_stopped   — pause pressed
 *   bb_metrika_viewer_connected  — viewer joined session
 *   bb_metrika_viewer_disconnected — viewer left
 *   bb_metrika_ws_reconnect      — WebSocket reconnected
 *   bb_metrika_breathing_started — breathing exercise started
 *   bb_metrika_session_duration  — detail: { seconds: number }
 */
(function () {
  'use strict'

  var YM_ID = 104698530

  /**
   * Safe ym() call — silently no-op if Metrika not loaded (consent not given)
   */
  function reachGoal(name, params) {
    try {
      if (typeof globalThis.ym === 'function') {
        globalThis.ym(YM_ID, 'reachGoal', name, params || {})
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
    'bb_metrika_breathing_started': 'breathing_started',
    'bb_metrika_session_duration': null, // special handler
    'bb_metrika_settings_changed': 'settings_changed',
    'bb_metrika_permanent_link_created': 'permanent_link_created',
    'bb_metrika_subscribe_clicked': 'subscribe_clicked'
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

  // Also handle when consent is granted after page load (re-fire page view context)
  globalThis.addEventListener('bb_cookie_consent_accepted', function () {
    reachGoal('cookie_accepted')
  })

  // Expose for direct calls if needed
  globalThis.MetrikaEvents = {
    reachGoal: reachGoal,
    ymId: YM_ID
  }
})()
