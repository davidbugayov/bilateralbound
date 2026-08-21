/* jshint node: true, esversion: 11, strict: true */
'use strict';

/**
 * Minimal Telegram Bot API client for Star payments + subscription flow.
 * Node.js native — no external dependencies.
 *
 * API docs: https://core.telegram.org/bots/api#payments
 * Stars: https://core.telegram.org/bots/payments#stars
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const { getCommandsForLang } = require('./bot-translations');

class TelegramBotService {
  /**
   * @param {Object} opts
   * @param {string} opts.token — Bot token from @BotFather
   * @param {string} opts.providerToken — Telegram Star provider token (usually empty for Stars)
   * @param {string} opts.webhookUrl — Public HTTPS URL for webhook
   * @param {string} opts.botUsername — Bot username (for deep links)
   * @param {Object} opts.logger
   */
  constructor({
    token,
    providerToken,
    webhookUrl,
    webhookSecret,
    botUsername,
    logger,
  } = {}) {
    this.token = token || '';
    this.providerToken = providerToken || '';
    this.webhookUrl = webhookUrl || '';
    this.webhookSecret = webhookSecret || '';
    this.botUsername = botUsername || '';
    this.logger = logger || console;
    this._apiBase = TELEGRAM_API_BASE + this.token;
  }

  get isConfigured() {
    return this.token.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Webhook setup
  // ---------------------------------------------------------------------------

  /** Register (or update) the webhook URL */
  async setWebhook() {
    if (!this.isConfigured) return false;
    if (!this.webhookUrl) {
      this.logger.warn('Webhook URL not configured — cannot set webhook');
      return false;
    }
    try {
      const params = {
        url: this.webhookUrl + '/api/subscription/webhook',
        max_connections: 10,
        allowed_updates: [
          'message',
          'callback_query',
          'pre_checkout_query',
          'successful_payment',
        ],
      };
      // Pass secret_token for webhook authentication (X-Telegram-Bot-Api-Secret-Token header)
      if (this.webhookSecret) {
        params.secret_token = this.webhookSecret;
      } else {
        this.logger.warn(
          'WEBHOOK_SECRET not set — webhook will accept unauthenticated requests',
        );
      }
      const res = await this._call('setWebhook', params);
      if (res.ok) {
        this.logger.info(
          { webhookUrl: this.webhookUrl },
          'Telegram webhook set',
        );
      } else {
        this.logger.error({ res }, 'Failed to set Telegram webhook');
      }
      return res.ok;
    } catch (err) {
      this.logger.error({ err }, 'Telegram setWebhook error');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /** Send a text message to a chat */
  async sendMessage(chatId, text, opts = {}) {
    if (!this.isConfigured) return null;
    try {
      return await this._call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...opts,
      });
    } catch (err) {
      this.logger.error({ err, chatId }, 'sendMessage failed');
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Payments (Telegram Stars)
  // ---------------------------------------------------------------------------

  /**
   * Answer a pre_checkout_query (required for Star payments).
   * @param {string} queryId — pre_checkout_query.id
   * @param {boolean} ok — true to accept, false to reject
   * @param {string} [errorMessage] — required if ok=false
   */
  async answerPreCheckoutQuery(queryId, ok, errorMessage) {
    if (!this.isConfigured) return false;
    try {
      const res = await this._call('answerPreCheckoutQuery', {
        pre_checkout_query_id: queryId,
        ok,
        error_message: errorMessage || undefined,
      });
      return res.ok;
    } catch (err) {
      this.logger.error({ err, queryId }, 'answerPreCheckoutQuery failed');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Callback queries
  // ---------------------------------------------------------------------------

  /**
   * Answer a callback query (required when using inline keyboards).
   * @param {string} queryId — callback_query.id
   * @param {Object} [opts] — optional { text: string, show_alert: boolean, url: string }
   */
  async answerCallbackQuery(queryId, opts = {}) {
    if (!this.isConfigured) return false;
    try {
      const res = await this._call('answerCallbackQuery', {
        callback_query_id: queryId,
        ...opts,
      });
      return res.ok;
    } catch (err) {
      this.logger.error({ err, queryId }, 'answerCallbackQuery failed');
      return false;
    }
  }

  /**
   * Create a payment invoice and send it to a chat.
   * Uses Telegram Stars as currency (XTR).
   *
   * @param {number} chatId
   * @param {string} sessionId — payload for pre_checkout_query
   * @param {number} starsAmount
   * @param {Object} opts
   */
  async sendInvoice(chatId, sessionId, starsAmount, opts = {}) {
    if (!this.isConfigured) return null;
    const providerToken = this.providerToken || undefined;
    try {
      const payload = {
        chat_id: chatId,
        title: opts.title || 'EMDR Premium Subscription',
        description:
          opts.description ||
          'Permanent session links for your clients. Valid for 30 days.',
        payload: sessionId,
        currency: 'XTR',
        prices: [
          {
            label: opts.label || 'Premium Plan (30 days)',
            amount: starsAmount,
          },
        ],
        max_tip_amount: 0,
        suggested_tip_amounts: [],
        need_email: false,
        need_phone_number: false,
        need_shipping_address: false,
        is_flexible: false,
      };
      // provider_token is optional for XTR (Telegram Stars) — omit entirely if empty
      if (providerToken) {
        payload.provider_token = providerToken;
      }

      const res = await this._call('sendInvoice', payload);
      this.logger.info(
        { chatId, sessionId, starsAmount, ok: res?.ok },
        'sendInvoice result',
      );
      return res;
    } catch (err) {
      this.logger.error(
        { err, chatId, sessionId, starsAmount },
        'sendInvoice failed',
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Bot commands menu
  // ---------------------------------------------------------------------------

  /**
   * Set the bot's command list (shown in Telegram menu).
   * When lang is omitted or 'en', commands apply to ALL users (default, no language_code sent).
   * When a non-English lang is provided, commands apply ONLY to users with that Telegram language.
   *
   * @param {string} [lang='en'] - Language for command descriptions.
   *   'en' or omitted → default commands for all users.
   *   'ru', 'es', etc. → language-specific overrides.
   */
  async setMyCommands(lang = 'en') {
    if (!this.isConfigured) return false;
    try {
      const payload = {
        commands: getCommandsForLang(lang),
        scope: { type: 'all_private_chats' },
      };
      // Only send language_code for non-English; English is the default (no code = all users)
      if (lang && lang !== 'en') {
        payload.language_code = lang;
      }
      const res = await this._call('setMyCommands', payload);
      if (res.ok) {
        this.logger.info(
          { lang, language_code: payload.language_code || 'default' },
          'Bot commands menu set',
        );
      } else {
        this.logger.error({ res }, 'Failed to set bot commands');
      }
      return res.ok;
    } catch (err) {
      this.logger.error({ err }, 'setMyCommands error');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Deep link helpers
  // ---------------------------------------------------------------------------

  /** Generate a deep link: https://t.me/bot?start=payload */
  getDeepLink(payload) {
    const bot = this.botUsername || 'emdrbilateral_bot';
    return `https://t.me/${bot}?start=${encodeURIComponent(payload || '')}`;
  }

  // ---------------------------------------------------------------------------
  // Private — raw API call
  // ---------------------------------------------------------------------------

  async _call(method, params) {
    if (!this.isConfigured) {
      throw new Error('Telegram bot not configured — token missing');
    }
    const url = `${this._apiBase}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API ${method}: ${response.status} ${text}`);
    }
    return response.json();
  }
}

module.exports = TelegramBotService;
