'use strict'

const crypto = require('node:crypto')

/**
 * Issues and verifies short-lived HMAC-signed tokens for WebSocket authentication.
 *
 * Token format: <sessionId>.<role>.<expiresAt>.<hmac>
 * HMAC = HMAC-SHA256(sessionId + '.' + role + '.' + expiresAt, secret)
 *
 * Tokens are embedded in HTML pages and sent as ?token= query param on WS connect.
 * This prevents role spoofing (role comes from the token, not the client) and
 * unauthorized WS connections (no token = no connect).
 */
class WsTokenService {
  /**
   * @param {Object} opts
   * @param {string} opts.secret — HMAC secret (default: random 32 bytes at startup)
   * @param {number} opts.ttlMs — Token lifetime in ms (default: 24 hours)
   * @param {Object} opts.logger
   */
  constructor({ secret, ttlMs, logger } = {}) {
    this._secret = secret || crypto.randomBytes(32).toString('hex')
    this._ttlMs = ttlMs || 24 * 60 * 60 * 1000 // 24 hours
    this._logger = logger || console
  }

  /**
   * Generate a WS auth token for a session+role combination.
   * @param {string} sessionId
   * @param {'controller'|'viewer'} role
   * @returns {string} token
   */
  generate(sessionId, role) {
    const expiresAt = Date.now() + this._ttlMs
    const payload = `${sessionId}.${role}.${expiresAt}`
    const hmac = crypto
      .createHmac('sha256', this._secret)
      .update(payload)
      .digest('hex')
    return `${payload}.${hmac}`
  }

  /**
   * Verify a WS auth token. Returns decoded payload or null if invalid/expired.
   * @param {string} token
   * @returns {{ sessionId: string, role: string, expiresAt: number }|null}
   */
  verify(token) {
    if (!token || typeof token !== 'string') return null

    const lastDot = token.lastIndexOf('.')
    if (lastDot === -1) return null

    const payload = token.slice(0, lastDot)
    const claimedHmac = token.slice(lastDot + 1)

    const expectedHmac = crypto
      .createHmac('sha256', this._secret)
      .update(payload)
      .digest('hex')

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(
      Buffer.from(claimedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    )) {
      return null
    }

    const parts = payload.split('.')
    if (parts.length !== 3) return null

    const [sessionId, role, expiresStr] = parts
    const expiresAt = Number.parseInt(expiresStr, 10)

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return null
    }

    if (role !== 'controller' && role !== 'viewer') {
      return null
    }

    // Validate sessionId format (alphanumeric, dash, underscore, 3-64 chars)
    if (!sessionId || !/^[A-Za-z0-9_-]{3,64}$/.test(sessionId)) {
      return null
    }

    return { sessionId, role, expiresAt }
  }
}

module.exports = WsTokenService
