/**
 * CSRF token helper for double-submit cookie pattern.
 * Reads the csrfToken cookie and returns it for use in X-CSRF-Token header.
 */
'use strict';

/**
 * Get CSRF token from the cookie.
 * @returns {string|null} The CSRF token or null if not found.
 */
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch wrapper that automatically adds the CSRF token header.
 * @param {string} url - The URL to fetch.
 * @param {object} [options={}] - Fetch options.
 * @returns {Promise<Response>} The fetch response.
 */
async function csrfFetch(url, options = {}) {
  const token = getCsrfToken();
  if (token) {
    options.headers = {
      ...options.headers,
      'X-CSRF-Token': token,
    };
  }
  return fetch(url, options);
}

module.exports = { getCsrfToken, csrfFetch };

// Expose on globalThis for use in bundled code
if (typeof globalThis !== 'undefined') {
  globalThis.csrfFetch = csrfFetch;
  globalThis.getCsrfToken = getCsrfToken;
}
