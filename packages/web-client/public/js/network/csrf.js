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
   * On 403, automatically retries once with the fresh token set by the server.
   * @param {string} url - The URL to fetch.
   * @param {object} [options={}] - Fetch options.
   * @returns {Promise<Response>} The fetch response.
   */
  async function csrfFetch(url, options) {
    options = options || {}
    let token = getCsrfToken()

    // If no token exists yet, try to obtain one
    if (!token && !url.includes('/api/csrf-token')) {
      try {
        await fetch('/api/csrf-token', { credentials: 'same-origin' })
        token = getCsrfToken()
      } catch (_) {
        /* proceed */
      }
    }

    if (token) {
      options.headers = Object.assign({}, options.headers || {}, {
        'X-CSRF-Token': token
      })
    }
    options.credentials = options.credentials || 'same-origin'

    const response = await fetch(url, options)

    // On 403, the server sets a fresh csrfToken cookie — retry once with the new token
    if (response.status === 403) {
      const newToken = getCsrfToken()
      if (newToken && newToken !== token) {
        options.headers = Object.assign({}, options.headers || {}, {
          'X-CSRF-Token': newToken
        })
        return fetch(url, options)
      }
    }

    return response
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
