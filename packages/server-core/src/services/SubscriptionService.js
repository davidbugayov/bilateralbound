/* jshint node: true, esversion: 11, strict: true */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * In-memory subscription store with JSON file persistence.
 *
 * Subscriptions are tied to a Telegram user ID (telegramUserId from Telegram API),
 * NOT to a custom session ID. A user can have multiple custom IDs linked to one
 * subscription (e.g. anna_2025, client-ivan, session42 — all under one Telegram account).
 *
 * Data model:
 *   _subscriptions: Map<telegramUserId, { token, activatedAt, expiresAt, starsAmount, autoRenew }>
 *   _customIdIndex: Map<customId, telegramUserId>
 *   totalStars: number
 */
class SubscriptionService {
  /**
   * @param {Object} options
   * @param {Object} options.logger
   * @param {number} options.durationMs - Subscription validity (default 30 days)
   * @param {string} options.dataDir - Path to data directory
   */
  constructor({ logger, durationMs, dataDir } = {}) {
    this.logger = logger || console
    this.durationMs = durationMs || DEFAULT_DURATION_MS

    /** Map<telegramUserId, { token, activatedAt, expiresAt, starsAmount, autoRenew }> */
    this._subscriptions = new Map()

    /** Map<customId, telegramUserId> — links customer IDs to a Telegram user */
    this._customIdIndex = new Map()

    /** Map<token, telegramUserId> — dedup and lookup by payment token */
    this._tokenIndex = new Map()

    /** Map<telegramUserId, string> — user's language preference (from /start payload) */
    this._userLanguages = new Map()

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
   * Activate subscription for a Telegram user.
   * Tokens must be unique — reusing a token is idempotent.
   * @param {number} telegramUserId - Telegram user ID
   * @param {string} token - Telegram payment charge ID
   * @param {number} starsAmount - Stars paid
   * @returns {{ success: boolean, expiresAt: number, error?: string }}
   */
  activate(telegramUserId, token, starsAmount) {
    if (!telegramUserId || !token) {
      return { success: false, error: 'Missing telegramUserId or token' }
    }

    // Dedup: if token already used, return existing subscription info
    const existingUserId = this._tokenIndex.get(token)
    if (existingUserId) {
      const existing = this._subscriptions.get(existingUserId)
      if (existing && existing.expiresAt > Date.now()) {
        if (existingUserId === telegramUserId) {
          return { success: true, expiresAt: existing.expiresAt, reactivated: false }
        }
        return { success: false, error: 'This payment token is already used for another user' }
      }
      // Token used but expired — clean up
      this._removeByToken(token)
    }

    const now = Date.now()
    const expiresAt = now + this.durationMs

    this._subscriptions.set(telegramUserId, {
      token,
      activatedAt: now,
      expiresAt,
      starsAmount: starsAmount || 0,
      autoRenew: false
    })
    this._tokenIndex.set(token, telegramUserId)
    this.totalStars += starsAmount || 0

    this._saveToDisk()
    this.logger.info(
      { telegramUserId, token, expiresAt: new Date(expiresAt).toISOString(), stars: starsAmount },
      'Subscription activated'
    )

    return { success: true, expiresAt }
  }

  /**
   * Check if a Telegram user has an active subscription.
   * @param {number} telegramUserId
   * @returns {boolean}
   */
  isActive(telegramUserId) {
    this._purgeExpired()
    const sub = this._subscriptions.get(telegramUserId)
    if (!sub) return false
    if (sub.expiresAt <= Date.now()) {
      this._subscriptions.delete(telegramUserId)
      this._tokenIndex.delete(sub.token)
      this._removeCustomIdsForUser(telegramUserId)
      this._saveToDisk()
      return false
    }
    return true
  }

  /**
   * Check if a custom session ID can be used (its owner has active subscription).
   * @param {string} customId
   * @returns {boolean}
   */
  isCustomIdAllowed(customId) {
    if (!customId) return false
    const telegramUserId = this._customIdIndex.get(customId)
    if (!telegramUserId) return false
    return this.isActive(telegramUserId)
  }

  /**
   * Link a custom ID to a Telegram user.
   * Idempotent — if already linked to the same user, returns success.
   * @param {string} customId
   * @param {number} telegramUserId
   * @returns {{ success: boolean, error?: string }}
   */
  linkCustomId(customId, telegramUserId) {
    if (!customId || !telegramUserId) {
      return { success: false, error: 'Missing customId or telegramUserId' }
    }

    const existingOwner = this._customIdIndex.get(customId)
    if (existingOwner === telegramUserId) {
      return { success: true } // Already linked to this user
    }
    if (existingOwner) {
      return { success: false, error: 'This Client ID is already linked to another user' }
    }

    this._customIdIndex.set(customId, telegramUserId)
    this._saveToDisk()
    this.logger.info({ customId, telegramUserId }, 'Custom ID linked to user')
    return { success: true }
  }

  /**
   * Get subscription info for a Telegram user.
   * @param {number} telegramUserId
     * @returns {{ active: boolean, activatedAt: number|null, expiresAt: number|null, starsAmount: number|null, autoRenew: boolean, customIds: string[] }}
   */
  getStatus(telegramUserId) {
    this._purgeExpired()
    const sub = this._subscriptions.get(telegramUserId)
    if (!sub || sub.expiresAt <= Date.now()) {
      if (sub) {
        this._subscriptions.delete(telegramUserId)
        this._tokenIndex.delete(sub.token)
        this._removeCustomIdsForUser(telegramUserId)
        this._saveToDisk()
      }
      return {
        active: false,
        activatedAt: null,
        expiresAt: null,
        starsAmount: null,
        autoRenew: false,
        customIds: []
      }
    }
    // Collect all custom IDs linked to this user
    const customIds = []
    for (const [cid, uid] of this._customIdIndex) {
      if (uid === telegramUserId) customIds.push(cid)
    }
    return {
      active: true,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      starsAmount: sub.starsAmount,
      autoRenew: sub.autoRenew || false,
      customIds
    }
  }

  /**
   * Get subscription status for a custom ID.
   * Looks up the telegramUserId from the customId index and returns full status.
   * @param {string} customId
   * @returns {{ active: boolean, activatedAt: number|null, expiresAt: number|null, starsAmount: number|null, telegramUserId: number|null }}
   */
  getStatusForCustomId(customId) {
    if (!customId) {
      return { active: false, activatedAt: null, expiresAt: null, starsAmount: null, telegramUserId: null }
    }
    const telegramUserId = this._customIdIndex.get(customId)
    if (!telegramUserId) {
      return { active: false, activatedAt: null, expiresAt: null, starsAmount: null, telegramUserId: null }
    }
    return this.getStatus(telegramUserId)
  }

  /**
   * Get total number of unique users with active subscriptions.
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
   * @param {string} customId
   * @returns {boolean}
   */
  canAcceptPayment(customId) {
    // Always true — no limits on how many subscriptions we can sell
    return true
  }

  /**
   * Store the user's language preference (from /start __lang_ru payload).
   * Persisted to disk for use in subsequent commands (status/renew/cancel/autorenew).
   * @param {number} telegramUserId
   * @param {string} lang - Language code (e.g. 'ru', 'en')
   */
  setUserLanguage(telegramUserId, lang) {
    if (!telegramUserId || !lang) return
    this._userLanguages.set(telegramUserId, lang)
    this._saveToDisk()
    this.logger.info({ telegramUserId, lang }, 'User language stored')
  }

  /**
   * Retrieve stored language preference for a user.
   * Falls back to 'en' if not set.
   * @param {number} telegramUserId
   * @returns {string} Language code (e.g. 'ru', 'en')
   */
  getUserLanguage(telegramUserId) {
    return this._userLanguages.get(telegramUserId) || 'en'
  }

  /**
   * Renew a subscription — extend expiresAt by durationMs from now.
   * If subscription does not exist, returns error.
   * @param {number} telegramUserId
   * @returns {{ success: boolean, expiresAt: number, error?: string }}
   */
  renew(telegramUserId) {
    if (!telegramUserId) {
      return { success: false, error: 'Missing telegramUserId' }
    }

    const sub = this._subscriptions.get(telegramUserId)
    if (!sub) {
      return { success: false, error: 'No subscription found for this user' }
    }

    const now = Date.now()
    // If expired, start from now; otherwise extend from current expiresAt
    const base = sub.expiresAt > now ? sub.expiresAt : now
    sub.expiresAt = base + this.durationMs

    this._saveToDisk()
    this.logger.info(
      { telegramUserId, expiresAt: new Date(sub.expiresAt).toISOString() },
      'Subscription renewed'
    )

    return { success: true, expiresAt: sub.expiresAt }
  }

  /**
   * Cancel a subscription — deactivate immediately and remove all custom IDs.
   * @param {number} telegramUserId
   * @returns {{ success: boolean, error?: string }}
   */
  cancel(telegramUserId) {
    if (!telegramUserId) {
      return { success: false, error: 'Missing telegramUserId' }
    }

    const sub = this._subscriptions.get(telegramUserId)
    if (!sub) {
      return { success: false, error: 'No subscription found for this user' }
    }

    this._subscriptions.delete(telegramUserId)
    this._tokenIndex.delete(sub.token)
    this._removeCustomIdsForUser(telegramUserId)
    this._saveToDisk()

    this.logger.info({ telegramUserId }, 'Subscription cancelled')
    return { success: true }
  }

  /**
   * Enable or disable auto-renew for a subscription.
   * @param {number} telegramUserId
   * @param {boolean} enabled
   * @returns {{ success: boolean, autoRenew: boolean, error?: string }}
   */
  setAutoRenew(telegramUserId, enabled) {
    if (!telegramUserId) {
      return { success: false, error: 'Missing telegramUserId' }
    }

    const sub = this._subscriptions.get(telegramUserId)
    if (!sub) {
      return { success: false, error: 'No subscription found for this user' }
    }

    sub.autoRenew = !!enabled
    this._saveToDisk()

    this.logger.info(
      { telegramUserId, autoRenew: sub.autoRenew },
      'Auto-renew ' + (sub.autoRenew ? 'enabled' : 'disabled')
    )

    return { success: true, autoRenew: sub.autoRenew }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Remove expired subscriptions from memory */
  _purgeExpired() {
    const now = Date.now()
    let dirty = false
    for (const [userId, sub] of this._subscriptions) {
      if (sub.expiresAt <= now) {
        this._subscriptions.delete(userId)
        this._tokenIndex.delete(sub.token)
        this._removeCustomIdsForUser(userId)
        dirty = true
      }
    }
    if (dirty) this._saveToDisk()
  }

  /** Remove subscription by token */
  _removeByToken(token) {
    const userId = this._tokenIndex.get(token)
    if (userId) {
      this._subscriptions.delete(userId)
      this._tokenIndex.delete(token)
      this._removeCustomIdsForUser(userId)
    }
  }

  /** Remove all custom IDs for a user */
  _removeCustomIdsForUser(telegramUserId) {
    for (const [cid, uid] of this._customIdIndex) {
      if (uid === telegramUserId) {
        this._customIdIndex.delete(cid)
      }
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

      // New format: subscriptions keyed by telegramUserId
      if (data.subscriptions && Array.isArray(data.subscriptions)) {
        for (const entry of data.subscriptions) {
          // Support both old (sessionId key) and new (telegramUserId key) formats
          const userId = entry.telegramUserId || entry.sessionId
          this._subscriptions.set(userId, {
            token: entry.token,
            activatedAt: entry.activatedAt,
            expiresAt: entry.expiresAt,
            starsAmount: entry.starsAmount || 0,
            autoRenew: entry.autoRenew || false
          })
          this._tokenIndex.set(entry.token, userId)
        }
      }

      // Load custom ID index
      if (data.customIds && Array.isArray(data.customIds)) {
        for (const link of data.customIds) {
          this._customIdIndex.set(link.customId, link.telegramUserId)
        }
      }

      // Load user language preferences
      if (data.userLanguages && typeof data.userLanguages === 'object') {
        for (const [userId, lang] of Object.entries(data.userLanguages)) {
          this._userLanguages.set(Number(userId), lang)
        }
      }

      this.totalStars = data.totalStars || 0
      this.logger.info(
        { count: this._subscriptions.size, customIds: this._customIdIndex.size, languages: this._userLanguages.size },
        'Subscriptions loaded from disk'
      )
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load subscriptions, starting fresh')
    }
  }

  /** Persist subscriptions to JSON file */
  _saveToDisk() {
    // Serialize userLanguages Map to plain object
    const userLanguages = {}
    for (const [userId, lang] of this._userLanguages) {
      userLanguages[userId] = lang
    }

    const data = {
      totalStars: this.totalStars,
      subscriptions: Array.from(this._subscriptions.entries()).map(([userId, sub]) => ({
        telegramUserId: userId,
        token: sub.token,
        activatedAt: sub.activatedAt,
        expiresAt: sub.expiresAt,
        starsAmount: sub.starsAmount,
        autoRenew: sub.autoRenew || false
      })),
      customIds: Array.from(this._customIdIndex.entries()).map(([customId, userId]) => ({
        customId,
        telegramUserId: userId
      })),
      userLanguages
    }
    try {
      fs.writeFileSync(this._filePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      this.logger.error({ err }, 'Failed to save subscriptions to disk')
    }
  }
}

module.exports = SubscriptionService
