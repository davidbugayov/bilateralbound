'use strict';

const crypto = require('node:crypto');

/**
 * Validates Telegram Mini App initData and Login Widget hash signatures.
 *
 * Telegram WebApp.initData is a URL-encoded query string signed by Telegram.
 * The signature is HMAC-SHA256 of the sorted key-value pairs (excluding hash),
 * using the bot token's SHA256 digest as the HMAC key.
 *
 * Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
class TelegramAuthService {
  /**
   * @param {Object} opts
   * @param {string} opts.botToken — Telegram bot token (from @BotFather)
   * @param {Object} opts.logger
   */
  constructor({ botToken, logger } = {}) {
    this._botToken = botToken || '';
    this._logger = logger || console;
    // Pre-compute the secret key: SHA256(botToken)
    this._secretKey = this._botToken
      ? crypto.createHash('sha256').update(this._botToken).digest()
      : Buffer.alloc(0);
  }

  get isConfigured() {
    return this._botToken.length > 0;
  }

  /**
   * Verify initData string from Telegram.WebApp.initData or Login Widget.
   * Returns parsed user data on success, null on failure.
   *
   * @param {string} initData — raw initData query string
   * @returns {{ userId: number, firstName?: string, lastName?: string, username?: string }|null}
   */
  verifyInitData(initData) {
    if (!initData || typeof initData !== 'string') return null;
    if (!this.isConfigured) {
      this._logger.warn(
        'TelegramAuthService.verifyInitData: botToken not configured',
      );
      return null;
    }

    // Parse URL-encoded query string
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      this._logger.debug('verifyInitData: missing hash');
      return null;
    }

    // Build data-check-string: sorted keys (except hash), joined by \n
    const checkParts = [];
    for (const [key, value] of params) {
      if (key !== 'hash') {
        checkParts.push(`${key}=${value}`);
      }
    }
    checkParts.sort();
    const dataCheckString = checkParts.join('\n');

    // Compute expected HMAC
    const expectedHmac = crypto
      .createHmac('sha256', this._secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Compare using timing-safe comparison to prevent timing attacks
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    const actualBuf = Buffer.from(hash, 'hex');
    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      this._logger.debug('verifyInitData: hash mismatch');
      return null;
    }

    // Extract user info
    // initData can contain: user={"id":123,"first_name":"..."} (JSON-encoded)
    // or for older format: id=123&first_name=... (flat query params)
    let userId, firstName, lastName, username;

    const userJson = params.get('user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        userId = user.id;
        firstName = user.first_name;
        lastName = user.last_name;
        username = user.username;
      } catch {
        this._logger.debug('verifyInitData: failed to parse user JSON');
        return null;
      }
    } else {
      // Flat format (older Login Widget)
      const idStr = params.get('id');
      userId = idStr ? Number.parseInt(idStr, 10) : null;
      firstName = params.get('first_name') || undefined;
      lastName = params.get('last_name') || undefined;
      username = params.get('username') || undefined;
    }

    if (!userId || !Number.isFinite(userId) || userId <= 0) {
      this._logger.debug('verifyInitData: invalid or missing user ID');
      return null;
    }

    return { userId, firstName, lastName, username };
  }
}

module.exports = TelegramAuthService;
