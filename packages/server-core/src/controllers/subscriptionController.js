/* jshint node: true, esversion: 11, strict: true */
'use strict'

/**
 * Subscription routes: check/status + Telegram webhook.
 * All subscription logic lives in SubscriptionService — this is just HTTP glue.
 *
 * Key change: subscriptions are tied to telegramUserId, NOT to customId.
 * After payment, the customId is linked to the user's Telegram account.
 *
 * Bot messages support 8 languages via bot-translations.js.
 */

const { t, siteUrl, dateLocale, autoRenewText } = require('../services/bot-translations')

function registerSubscriptionRoutes(app, subscriptionService, { logger, telegramBot }) {
  if (!subscriptionService) {
    logger.warn('SubscriptionService not provided — subscription routes disabled')
    return
  }

  // ------------------------------------------------------------------
  // POST /api/subscription/:customId/check
  // Check if a custom ID is linked to an active subscription.
  // Returns { active: boolean, subscription: { expiresAt, ... } | null }
  // ------------------------------------------------------------------
  app.post('/api/subscription/:customId/check', (req, res) => {
    const { customId } = req.params
    if (!customId || !/^[A-Za-z0-9_-]{3,32}$/.test(customId)) {
      return res.status(400).json({ error: 'Invalid customId format' })
    }

    const allowed = subscriptionService.isCustomIdAllowed(customId)
    if (!allowed) {
      return res.json({
        active: false,
        subscription: null
      })
    }

    // Find the owner and get full status
    // We need to look up the telegramUserId from the custom ID index
    const status = subscriptionService.getStatusForCustomId
      ? subscriptionService.getStatusForCustomId(customId)
      : null

    res.json({
      active: true,
      subscription: status || { expiresAt: null }
    })
  })

  // ------------------------------------------------------------------
  // POST /api/subscription/activate-by-telegram
  // Called from main page after payment: links customId to telegramUserId
  // Body: { customId, telegramUserId }
  // ------------------------------------------------------------------
  app.post('/api/subscription/activate-by-telegram', (req, res) => {
    const { customId, telegramUserId } = req.body || {}
    if (!customId || !telegramUserId) {
      return res.status(400).json({ error: 'Missing customId or telegramUserId' })
    }

    // Check that the user has an active subscription
    if (!subscriptionService.isActive(telegramUserId)) {
      return res.status(402).json({
        error: 'No active subscription',
        message: 'Please subscribe via Telegram first'
      })
    }

    // Link custom ID to user
    const result = subscriptionService.linkCustomId(customId, telegramUserId)
    if (!result.success) {
      return res.status(409).json({ error: result.error })
    }

    res.json({ success: true, customId, telegramUserId })
  })

  // ------------------------------------------------------------------
  // GET /api/subscription/status/:telegramUserId
  // Check subscription status for a Telegram user
  // ------------------------------------------------------------------
  app.get('/api/subscription/status/:telegramUserId', (req, res) => {
    const userId = Number.parseInt(req.params.telegramUserId, 10)
    if (!userId) {
      return res.status(400).json({ error: 'Invalid telegramUserId' })
    }
    const status = subscriptionService.getStatus(userId)
    res.json(status)
  })

  // ------------------------------------------------------------------
  // POST /api/subscription/:customId/renew
  // Renew subscription for a custom ID owner
  // ------------------------------------------------------------------
  app.post('/api/subscription/:customId/renew', (req, res) => {
    const { customId } = req.params
    if (!customId || !/^[A-Za-z0-9_-]{3,32}$/.test(customId)) {
      return res.status(400).json({ error: 'Invalid customId format' })
    }
    const status = subscriptionService.getStatusForCustomId
      ? subscriptionService.getStatusForCustomId(customId)
      : null
    if (!status || !status.active || !status.telegramUserId) {
      return res.status(402).json({ error: 'No active subscription for this custom ID' })
    }
    const result = subscriptionService.renew(status.telegramUserId)
    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }
    res.json(result)
  })

  // ------------------------------------------------------------------
  // POST /api/subscription/:customId/cancel
  // Cancel subscription for a custom ID owner
  // ------------------------------------------------------------------
  app.post('/api/subscription/:customId/cancel', (req, res) => {
    const { customId } = req.params
    if (!customId || !/^[A-Za-z0-9_-]{3,32}$/.test(customId)) {
      return res.status(400).json({ error: 'Invalid customId format' })
    }
    const status = subscriptionService.getStatusForCustomId
      ? subscriptionService.getStatusForCustomId(customId)
      : null
    if (!status || !status.telegramUserId) {
      return res.status(402).json({ error: 'No subscription linked to this custom ID' })
    }
    const cancelResult = subscriptionService.cancel(status.telegramUserId)
    if (!cancelResult.success) {
      return res.status(400).json({ error: cancelResult.error })
    }
    res.json(cancelResult)
  })

  // ------------------------------------------------------------------
  // POST /api/subscription/:customId/autorenew
  // Toggle auto-renew for a custom ID owner
  // Body: { enabled: boolean }
  // ------------------------------------------------------------------
  app.post('/api/subscription/:customId/autorenew', (req, res) => {
    const { customId } = req.params
    if (!customId || !/^[A-Za-z0-9_-]{3,32}$/.test(customId)) {
      return res.status(400).json({ error: 'Invalid customId format' })
    }
    const enabled = req.body?.enabled === true
    const status = subscriptionService.getStatusForCustomId
      ? subscriptionService.getStatusForCustomId(customId)
      : null
    if (!status || !status.telegramUserId) {
      return res.status(402).json({ error: 'No subscription linked to this custom ID' })
    }
    const arResult = subscriptionService.setAutoRenew(status.telegramUserId, enabled)
    if (!arResult.success) {
      return res.status(400).json({ error: arResult.error })
    }
    res.json(arResult)
  })

  // ------------------------------------------------------------------
  // Helper: detect user language from update and persist it
  // Priority: 1) stored preference, 2) __lang_XX from payload, 3) Telegram language_code, 4) 'en'
  // ------------------------------------------------------------------
  function detectLanguage(update) {
    let lang = update.message?.from?.language_code || 'en'
    let langFromPayload = null
    if (update.message?.text && update.message.text.startsWith('/start ')) {
      const payloadMatch = update.message.text.match(/__lang_([a-z]{2}(-[A-Z]{2})?)$/)
      if (payloadMatch) {
        langFromPayload = payloadMatch[1]
        lang = langFromPayload
        const senderId = update.message?.from?.id
        if (senderId) {
          subscriptionService.setUserLanguage(senderId, lang)
        }
      }
    }
    // Resolve stored language preference (overrides Telegram locale)
    const telegramUserId = update.message?.from?.id
    if (telegramUserId) {
      const storedLang = subscriptionService.getUserLanguage(telegramUserId)
      if (storedLang) lang = storedLang
    }
    return lang
  }

  // ------------------------------------------------------------------
  // POST /api/subscription/webhook
  // Telegram Bot webhook endpoint (Telegram Stars payments)
  // Body: Telegram Update object — https://core.telegram.org/bots/api#update
  // ------------------------------------------------------------------
  app.post('/api/subscription/webhook', (req, res) => {
    const update = req.body || {}

    // Respond quickly — Telegram expects 200 within a few seconds
    res.status(200).json({ ok: true })

    // Detect user language
    const lang = detectLanguage(update)

    // ---- /start command — send welcome + invoice ----
    if (update.message?.text) {
      const { chat, from } = update.message
      const chatId = chat.id

      const msgText = update.message.text

      if (msgText === '/start') {
        const sUrl = siteUrl(lang)
        const telegramUserId = from.id

        // Check if already subscribed
        const isSubscribed = subscriptionService.isActive(telegramUserId)

        if (isSubscribed) {
          // Already subscribed — show status
          const status = subscriptionService.getStatus(telegramUserId)
          const expDate = new Date(status.expiresAt).toLocaleDateString(dateLocale(lang))
          const statusMsg = t('already_subscribed', lang, {
            expDate,
            clients: String(status.customIds?.length || 0)
          })
          telegramBot?.sendMessage(chatId, statusMsg)
          return
        }

        // Not subscribed — send welcome + invoice
        const msg = t('welcome_new', lang, { siteUrl: sUrl })
        const msgResult = telegramBot?.sendMessage(chatId, msg)
        logger.info({ chatId, msgSent: !!msgResult }, '/start welcome sent')

        // Send invoice directly for plain /start (payload = telegramUserId)
        telegramBot?.sendInvoice(chatId, String(telegramUserId), 75, {
          title: t('invoice_title', lang),
          description: t('invoice_description_plain', lang),
          label: t('invoice_label_plain', lang)
        }).then(function (resp) {
          logger.info({ chatId, respOk: resp?.ok, respCode: resp?.error_code }, '/start invoice response')
          if (!resp?.ok) {
            telegramBot?.sendMessage(chatId, t('invoice_failed', lang))
          }
        })
        return
      }


      // Handle /start customId deep links from the site
      if (msgText.startsWith('/start ')) {
        const telegramUserId = from.id
        let rest = msgText.slice(7).trim()
        // Strip language suffix from customId if present (e.g. "anna_2025__lang_ru" → "anna_2025")
        const payloadMatch = msgText.match(/__lang_([a-z]{2}(-[A-Z]{2})?)$/)
        if (payloadMatch) {
          rest = rest.replace(/__lang_[a-z]{2}(-[A-Z]{2})?$/, '')
        }

        // If after stripping lang suffix rest is empty, treat as plain /start (welcome message)
        if (!rest) {
          const sUrl = siteUrl(lang)
          const msg = t('welcome_short', lang, { siteUrl: sUrl })
          telegramBot?.sendMessage(chatId, msg)
          return
        }

        // Check if already subscribed
        const isSubscribed = subscriptionService.isActive(telegramUserId)

        if (isSubscribed) {
          // Already subscribed — link this customId automatically
          const linkResult = subscriptionService.linkCustomId(rest, telegramUserId)
          const msg = linkResult.success
            ? t('client_linked', lang, { customId: rest })
            : t('client_already_linked', lang)
          telegramBot?.sendMessage(chatId, msg)
          return
        }

        // Not subscribed — send invoice
        telegramBot?.sendInvoice(chatId, rest, 75, {
          title: t('invoice_title', lang),
          description: t('invoice_description_custom', lang),
          label: t('invoice_label_custom', lang)
        }).then(function (resp) {
          if (!resp?.ok) {
            telegramBot?.sendMessage(chatId, t('invoice_failed', lang))
          }
        })
        return
      }

      // ---- /status — check subscription status ----
      if (msgText === '/status') {
        const telegramUserId = from.id
        const status = subscriptionService.getStatus(telegramUserId)
        let statusMsg
        if (status.active) {
          const expDate = new Date(status.expiresAt).toLocaleDateString(dateLocale(lang))
          statusMsg = t('status_active', lang, {
            expDate,
            clients: String(status.customIds?.length || 0),
            autoRenew: autoRenewText(lang, status.autoRenew)
          })
        } else {
          statusMsg = t('status_inactive', lang)
        }
        telegramBot?.sendMessage(chatId, statusMsg)
        return
      }

      // ---- /renew — extend subscription ----
      if (msgText === '/renew') {
        const telegramUserId = from.id
        const renewResult = subscriptionService.renew(telegramUserId)
        let renewMsg
        if (renewResult.success) {
          const newExp = new Date(renewResult.expiresAt).toLocaleDateString(dateLocale(lang))
          renewMsg = t('renew_success', lang, { expDate: newExp })
        } else {
          // Translate known errors from SubscriptionService (always English)
          if (renewResult.error?.includes('No subscription')) {
            renewMsg = t('renew_no_subscription', lang)
          } else {
            renewMsg = t('renew_failed', lang)
          }
        }
        telegramBot?.sendMessage(chatId, renewMsg)
        return
      }

      // ---- /cancel — cancel subscription ----
      if (msgText === '/cancel') {
        const telegramUserId = from.id
        const cancelResult = subscriptionService.cancel(telegramUserId)
        let cancelMsg
        if (cancelResult.success) {
          cancelMsg = t('cancel_success', lang)
        } else {
          // Translate known errors from SubscriptionService (always English)
          if (cancelResult.error?.includes('No subscription')) {
            cancelMsg = t('cancel_no_subscription', lang)
          } else {
            cancelMsg = t('cancel_failed', lang)
          }
        }
        telegramBot?.sendMessage(chatId, cancelMsg)
        return
      }

      // ---- /autorenew — toggle auto-renew ----
      if (msgText === '/autorenew') {
        const telegramUserId = from.id
        const status2 = subscriptionService.getStatus(telegramUserId)
        const newVal = !(status2.autoRenew || false)
        const arResult = subscriptionService.setAutoRenew(telegramUserId, newVal)
        let arMsg
        if (arResult.success) {
          arMsg = arResult.autoRenew
            ? t('autorenew_enabled', lang)
            : t('autorenew_disabled', lang)
        } else {
          // Translate known errors from SubscriptionService (always English)
          if (arResult.error?.includes('No subscription')) {
            arMsg = t('autorenew_no_subscription', lang)
          } else {
            arMsg = t('autorenew_failed', lang)
          }
        }
        telegramBot?.sendMessage(chatId, arMsg)
        return
      }
    }

    // ---- pre_checkout_query — validate ----
    if (update.pre_checkout_query) {
      const { id, invoice_payload: customId } = update.pre_checkout_query
      const qLang = update.pre_checkout_query.from?.language_code || 'en'
      const storedQLang = subscriptionService.getUserLanguage(update.pre_checkout_query.from?.id)
      const effectiveQLang = storedQLang || qLang

      if (customId && subscriptionService.canAcceptPayment(customId)) {
        telegramBot?.answerPreCheckoutQuery(id, true)
        logger.info({ preCheckoutQueryId: id, customId }, 'Pre-checkout approved')
      } else {
        telegramBot?.answerPreCheckoutQuery(id, false, t('pre_checkout_invalid', effectiveQLang))
        logger.warn({ preCheckoutQueryId: id, customId }, 'Pre-checkout rejected')
      }
      return
    }

    // ---- successful_payment — activate by telegramUserId ----
    if (update.message?.successful_payment) {
      const chatId = update.message.chat.id
      const telegramUserId = update.message.from.id
      const {
        invoice_payload: customId,
        telegram_payment_charge_id: chargeId,
        total_amount: starsAmount
      } = update.message.successful_payment
      const pLang = subscriptionService.getUserLanguage(telegramUserId) || 'en'

      logger.info(
        { telegramUserId, customId, chargeId, starsAmount },
        'Telegram Stars payment received'
      )

      // 1. Activate subscription for this Telegram user
      const result = subscriptionService.activate(telegramUserId, chargeId, starsAmount)

      if (result.success) {
        // 2. Link the customId to this user
        // Skip for plain /start — payload is telegramUserId as numeric string, not a real customId
        const isNumericPayload = /^\d+$/.test(customId) && String(customId) === String(telegramUserId)
        if (!isNumericPayload) {
          subscriptionService.linkCustomId(customId, telegramUserId)
        }

        logger.info(
          { telegramUserId, customId, chargeId, expiresAt: new Date(result.expiresAt).toISOString() },
          isNumericPayload
            ? 'Subscription activated (plain /start, no customId to link)'
            : 'Subscription activated and customId linked'
        )

        const msg = t('payment_success', pLang, {
          expDate: new Date(result.expiresAt).toLocaleDateString(dateLocale(pLang)),
          siteUrl: siteUrl(pLang)
        })

        telegramBot?.sendMessage(chatId, msg)
      } else {
        logger.warn({ telegramUserId, chargeId, error: result.error }, 'Activation failed')

        const msg = t('payment_failed', pLang, { error: result.error || 'Unknown error' })

        telegramBot?.sendMessage(chatId, msg)
      }
      return
    }
  })
}

module.exports = { registerSubscriptionRoutes }
