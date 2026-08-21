/**
 * CSRF token helper for double-submit cookie pattern.
 * Reads the csrfToken cookie and returns it for use in X-CSRF-Token header.
 * Standalone version for non-bundled scripts (main-page.js, etc.)
 */
(function () {
  'use strict'

  /**
   * Get CSRF token from the cookie.
   * @returns {string|null} The CSRF token or null if not found.
   */
  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/)
    return match ? decodeURIComponent(match[1]) : null
  }

  /**
   * Fetch wrapper that automatically adds the CSRF token header.
   * @param {string} url - The URL to fetch.
   * @param {object} [options={}] - Fetch options.
   * @returns {Promise<Response>} The fetch response.
   */
  async function csrfFetch(url, options) {
    options = options || {}
    const token = getCsrfToken()
    if (token) {
      options.headers = Object.assign({}, options.headers || {}, {
        'X-CSRF-Token': token
      })
    }
    return fetch(url, options)
  }

  // Expose on globalThis/window
  if (typeof globalThis !== 'undefined') {
    globalThis.csrfFetch = csrfFetch
    globalThis.getCsrfToken = getCsrfToken
  }
  if (typeof window !== 'undefined') {
    window.csrfFetch = csrfFetch
    window.getCsrfToken = getCsrfToken
  }
})()
