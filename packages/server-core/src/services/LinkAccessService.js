/* jshint node: true, esversion: 11, strict: true */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Tracks per-browser per-link access for the first-free-then-paywall gating.
 *
 * Data model:
 *   _entries: Map<browserId, Map<sessionId, { firstSeenAt, unlockedUntil }>>
 *
 * firstSeenAt: timestamp of the first visit from this browser to this link.
 * unlockedUntil: if the browser has verified a subscription for this link,
 *   the timestamp until which access is granted (from subscription expiry).
 *   undefined/null if not unlocked.
 */
class LinkAccessService {
  /**
   * @param {Object} options
   * @param {Object} options.logger
   * @param {string} options.dataDir - Path to data directory
   */
  constructor({ logger, dataDir } = {}) {
    this.logger = logger || console;

    /** Map<browserId, Map<sessionId, { firstSeenAt, unlockedUntil }>> */
    this._entries = new Map();

    if (dataDir) {
      this._dataDir = dataDir;
    } else {
      this._dataDir = path.join(__dirname, '..', '..', 'data');
    }
    this._filePath = path.join(this._dataDir, 'link-access.json');

    // Debounce: coalesce multiple saves within 5s into one write
    this._saveTimer = null;
    this._saveDebounceMs = 5000;

    this._ensureDataDir();
    this._loadFromDisk();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns the access state for a browser+sessionId combination.
   * @param {string} browserId
   * @param {string} sessionId
   * @returns {{ firstSeenAt: number|null, unlockedUntil: number|null }}
   */
  get(browserId, sessionId) {
    const perBrowser = this._entries.get(browserId);
    if (!perBrowser) return { firstSeenAt: null, unlockedUntil: null };
    const record = perBrowser.get(sessionId);
    if (!record) return { firstSeenAt: null, unlockedUntil: null };
    return {
      firstSeenAt: record.firstSeenAt,
      unlockedUntil: record.unlockedUntil || null,
    };
  }

  /**
   * Records a first visit for this browser+sessionId.
   * Idempotent — no-op if already seen.
   * @param {string} browserId
   * @param {string} sessionId
   */
  markSeen(browserId, sessionId) {
    // Already recorded — don't overwrite firstSeenAt
    const existing = this.get(browserId, sessionId);
    if (existing.firstSeenAt) return;

    let perBrowser = this._entries.get(browserId);
    if (!perBrowser) {
      perBrowser = new Map();
      this._entries.set(browserId, perBrowser);
    }
    perBrowser.set(sessionId, { firstSeenAt: Date.now(), unlockedUntil: null });
    this._scheduleSave();
  }

  /**
   * Mark a browser+sessionId combination as unlocked until the given timestamp.
   * @param {string} browserId
   * @param {string} sessionId
   * @param {number} untilTs - Timestamp when unlock expires (subscription expiresAt)
   */
  setUnlocked(browserId, sessionId, untilTs) {
    let perBrowser = this._entries.get(browserId);
    if (!perBrowser) {
      perBrowser = new Map();
      this._entries.set(browserId, perBrowser);
    }
    const existing = perBrowser.get(sessionId);
    perBrowser.set(sessionId, {
      firstSeenAt: existing ? existing.firstSeenAt : Date.now(),
      unlockedUntil: untilTs,
    });
    this._scheduleSave();
    this.logger.info(
      { browserId, sessionId, unlockedUntil: new Date(untilTs).toISOString() },
      'Link access unlocked',
    );
  }

  /**
   * Checks if a browser+sessionId currently has valid unlock.
   * @param {string} browserId
   * @param {string} sessionId
   * @param {number} now - Current timestamp for comparison
   * @returns {boolean}
   */
  isUnlocked(browserId, sessionId, now = Date.now()) {
    const state = this.get(browserId, sessionId);
    if (!state.unlockedUntil) return false;
    return state.unlockedUntil > now;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _ensureDataDir() {
    try {
      if (!fs.existsSync(this._dataDir)) {
        fs.mkdirSync(this._dataDir, { recursive: true });
      }
    } catch (err) {
      this.logger.warn(
        { err },
        'Could not create data directory for link-access',
      );
    }
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(this._filePath)) {
        this.logger.info('No link-access file found, starting fresh');
        return;
      }
      const raw = fs.readFileSync(this._filePath, 'utf-8');
      const data = JSON.parse(raw);

      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

      // Format: { entries: { browserId: { sessionId: { firstSeenAt, unlockedUntil } } } }
      if (data.entries && typeof data.entries === 'object') {
        for (const [browserId, perBrowser] of Object.entries(data.entries)) {
          // Skip stale browser entries (no per-link records)
          if (!perBrowser || typeof perBrowser !== 'object') continue;
          const clean = new Map();
          let hasValid = false;
          for (const [sessionId, record] of Object.entries(perBrowser)) {
            if (!record || typeof record !== 'object') continue;
            // Drop if unlock expired AND firstSeenAt too old (no reason to keep)
            const expired = record.unlockedUntil && record.unlockedUntil <= now;
            const tooOld =
              record.firstSeenAt && now - record.firstSeenAt > maxAge;
            if (expired && tooOld) continue;
            clean.set(sessionId, {
              firstSeenAt: record.firstSeenAt || null,
              unlockedUntil:
                record.unlockedUntil && record.unlockedUntil > now
                  ? record.unlockedUntil
                  : null,
            });
            hasValid = true;
          }
          if (hasValid) {
            this._entries.set(browserId, clean);
          }
        }
      }

      this.logger.info(
        { browsers: this._entries.size },
        'Link access data loaded from disk',
      );
    } catch (err) {
      this.logger.warn(
        { err },
        'Failed to load link-access data, starting fresh',
      );
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._cleanupExpired();
      this._saveToDisk();
    }, this._saveDebounceMs);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  _cleanupExpired() {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    for (const [browserId, perBrowser] of this._entries) {
      for (const [sessionId, record] of perBrowser) {
        const expired = record.unlockedUntil && record.unlockedUntil <= now;
        const tooOld = record.firstSeenAt && now - record.firstSeenAt > maxAge;
        if (expired && tooOld) {
          perBrowser.delete(sessionId);
        }
      }
      if (perBrowser.size === 0) {
        this._entries.delete(browserId);
      }
    }
  }

  _saveToDisk() {
    const entries = {};
    for (const [browserId, perBrowser] of this._entries) {
      const obj = {};
      for (const [sessionId, record] of perBrowser) {
        obj[sessionId] = {
          firstSeenAt: record.firstSeenAt,
          unlockedUntil: record.unlockedUntil || null,
        };
      }
      entries[browserId] = obj;
    }
    const data = { entries };
    const tmpPath = this._filePath + '.tmp';
    try {
      // Atomic write: write to temp file, then rename (filesystem-level atomic)
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this._filePath);
    } catch (err) {
      this.logger.error({ err }, 'Failed to save link-access data to disk');
      // Clean up temp file on error
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = LinkAccessService;
