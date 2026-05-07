/* jshint node: true, esversion: 11, strict: true */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const SUBSCRIPTIONS_FILE = path.join(__dirname, '..', '..', 'data', 'subscriptions.json')
const DEFAULT_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * In-memory subscription store with JSON file persistence.
 * Survives server restarts by writing to subscriptions.json on every change.
 * Subscriptions are tied to a token (Telegram-generated) and tracked per session.
 */
class SubscriptionService {
  /**
   * @param {Object} options
   * @param {Object} options.logger
   * @param {number} options.durationMs - Subscription validity (default 30 days)
   * @param {string} options.dataDir - Path to data directory (default: server-core/data/)
   */
  constructor({ logger, durationMs, dataDir } = {}) {
    this.logger = logger || console
    this.durationMs = durationMs || DEFAULT_DURATION_MS

    // Map<sessionId, { token, activatedAt, expiresAt }>
    this._subscriptions = new Map()

    // Map<token, sessionId> — for dedup and lookup by token
    this._tokenIndex = new Map()

    // Total Stars received (for analytics)
    this.totalStars = 0

    if (dataDir) {
      this._dataDir = dataDir
    } else {
      this._dataDir = path.join(__dirname, '..', '..', 'data')
    }
    this._filePath = path.join(this._dataDir, 'subscriptions.json')

    this._ensureDataDir()
    this._loadFromDisk()
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Activate subscription for a session using a Telegram payment token.
   * Tokens must be unique — reusing a token is idempotent (returns same sessionId).
   * @param {string} sessionId
   * @param {string} token - Telegram invoice token
   * @param {number} starsAmount - Stars paid
   * @returns {{ success: boolean, expiresAt: number, error?: string }}
   */
  activate(sessionId, token, starsAmount) {
    if (!sessionId || !token) {
      return { success: false, error: 'Missing sessionId or token' }
    }

    // Dedup: if token already used, return existing subscription info
    const existingSessionId = this._tokenIndex.get(token)
    if (existingSessionId) {
      const existing = this._subscriptions.get(existingSessionId)
      if (existing && existing.expiresAt > Date.now()) {
        // If the same session, just return success. If different, error.
        if (existingSessionId === sessionId) {
          return { success: true, expiresAt: existing.expiresAt, reactivated: false }
        }
        return { success: false, error: 'This payment token is already used for another session' }
      }
      // Token used but expired — clean up and allow reuse
      this._removeByToken(token)
    }

    const now = Date.now()
    const expiresAt = now + this.durationMs

    this._subscriptions.set(sessionId, {
      token,
      activatedAt: now,
      expiresAt,
      starsAmount: starsAmount || 0
    })
    this._tokenIndex.set(token, sessionId)
    this.totalStars += starsAmount || 0

    this._saveToDisk()
    this.logger.info(
      { sessionId, token, expiresAt: new Date(expiresAt).toISOString(), stars: starsAmount },
      'Subscription activated'
    )

    return { success: true, expiresAt }
  }

  /**
   * Check if a session has an active subscription.
   * Cleans up expired entries on access.
   * @param {string} sessionId
   * @returns {boolean}
   */
  isActive(sessionId) {
    this._purgeExpired()
    const sub = this._subscriptions.get(sessionId)
    if (!sub) return false
    if (sub.expiresAt <= Date.now()) {
      this._subscriptions.delete(sessionId)
      this._tokenIndex.delete(sub.token)
      this._saveToDisk()
      return false
    }
    return true
  }

  /**
   * Check if a specific premium feature is allowed for a session.
   * @param {string} sessionId
   * @param {string} feature - Feature name: 'permanent_links', 'session_management', 'extended_session', 'priority_support'
   * @returns {boolean}
   */
  isFeatureAllowed(sessionId, feature) {
    // All features require an active subscription
    return this.isActive(sessionId)
  }

  /**
   * Get subscription info for a session.
   * @param {string} sessionId
   * @returns {{ active: boolean, activatedAt: number|null, expiresAt: number|null, starsAmount: number|null }|null}
   */
  getStatus(sessionId) {
    this._purgeExpired()
    const sub = this._subscriptions.get(sessionId)
    if (!sub || sub.expiresAt <= Date.now()) {
      if (sub) {
        this._subscriptions.delete(sessionId)
        this._tokenIndex.delete(sub.token)
        this._saveToDisk()
      }
      return { active: false, activatedAt: null, expiresAt: null, starsAmount: null }
    }
    return {
      active: true,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      starsAmount: sub.starsAmount
    }
  }

  /**
   * Get total number of active subscriptions.
   * @returns {number}
   */
  getActiveCount() {
    this._purgeExpired()
    return this._subscriptions.size
  }

  /**
   * Get total Stars revenue.
   * @returns {number}
   */
  getTotalStars() {
    return this.totalStars
  }

  /**
   * Handle Telegram pre_checkout_query (validate availability).
   * @param {string} sessionId
   * @returns {boolean}
   */
  canAcceptPayment(sessionId) {
    // Always true — no limits on how many subscriptions we can sell
    return true
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Remove expired subscriptions from memory */
  _purgeExpired() {
    const now = Date.now()
    let dirty = false
    for (const [sessionId, sub] of this._subscriptions) {
      if (sub.expiresAt <= now) {
        this._subscriptions.delete(sessionId)
        this._tokenIndex.delete(sub.token)
        dirty = true
      }
    }
    if (dirty) this._saveToDisk()
  }

  /** Remove subscription by token */
  _removeByToken(token) {
    const sessionId = this._tokenIndex.get(token)
    if (sessionId) {
      this._subscriptions.delete(sessionId)
      this._tokenIndex.delete(token)
    }
  }

  /** Ensure data directory exists */
  _ensureDataDir() {
    try {
      if (!fs.existsSync(this._dataDir)) {
        fs.mkdirSync(this._dataDir, { recursive: true })
      }
    } catch (err) {
      this.logger.warn({ err }, 'Could not create data directory for subscriptions')
    }
  }

  /** Load subscriptions from JSON file */
  _loadFromDisk() {
    try {
      if (!fs.existsSync(this._filePath)) {
        this.logger.info('No subscriptions file found, starting fresh')
        return
      }
      const raw = fs.readFileSync(this._filePath, 'utf-8')
      const data = JSON.parse(raw)
      if (data.subscriptions && Array.isArray(data.subscriptions)) {
        for (const entry of data.subscriptions) {
          this._subscriptions.set(entry.sessionId, {
            token: entry.token,
            activatedAt: entry.activatedAt,
            expiresAt: entry.expiresAt,
            starsAmount: entry.starsAmount || 0
          })
          this._tokenIndex.set(entry.token, entry.sessionId)
        }
      }
      this.totalStars = data.totalStars || 0
      this.logger.info(
        { count: this._subscriptions.size },
        'Subscriptions loaded from disk'
      )
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load subscriptions, starting fresh')
    }
  }

  /** Persist subscriptions to JSON file */
  _saveToDisk() {
    const data = {
      totalStars: this.totalStars,
      subscriptions: Array.from(this._subscriptions.entries()).map(([sessionId, sub]) => ({
        sessionId,
        token: sub.token,
        activatedAt: sub.activatedAt,
        expiresAt: sub.expiresAt,
        starsAmount: sub.starsAmount
      }))
    }
    try {
      fs.writeFileSync(this._filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      this.logger.error({ err }, 'Failed to save subscriptions to disk')
    }
  }
}

module.exports = SubscriptionService
