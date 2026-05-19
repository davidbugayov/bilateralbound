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

function registerSubscriptionRoutes(app, subscriptionService, { logger, telegramBot, priceStars, testMode, baseUrl }) {
  const STARS_PRICE = priceStars || 75
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
  // POST /api/subscription/test-activate (TEST MODE ONLY)
  // Simulates a successful payment — activates subscription and links customId.
  // Only available when SUBSCRIPTION_TEST_MODE=true and only from localhost.
  // Body: { telegramUserId: number, customId: string }
  // ------------------------------------------------------------------
  app.post('/api/subscription/test-activate', (req, res) => {
    if (!testMode) {
      return res.status(404).json({ error: 'Not found' })
    }
    const remoteAddr = req.socket?.remoteAddress
    const isLocal =
      remoteAddr === '127.0.0.1' ||
      remoteAddr === '::1' ||
      remoteAddr === '::ffff:127.0.0.1'
    if (!isLocal) {
      return res.status(403).json({ error: 'Localhost only' })
    }

    const { telegramUserId, customId } = req.body || {}
    const tgId = Number.parseInt(telegramUserId, 10)
    if (!tgId || !customId) {
      return res.status(400).json({ error: 'Missing telegramUserId or customId' })
    }

    // Use a fake charge ID for test
    const testToken = 'test_' + Date.now()
    const result = subscriptionService.activate(tgId, testToken, 75)
    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    subscriptionService.linkCustomId(customId, tgId)
    logger.info({ telegramUserId: tgId, customId, testToken }, 'TEST: subscription activated')

    res.json({
      success: true,
      customId,
      telegramUserId: tgId,
      expiresAt: new Date(result.expiresAt).toISOString()
    })
  })

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
          // Already subscribed — show renewal prompt with inline button
          const status = subscriptionService.getStatus(telegramUserId)
          const expDate = new Date(status.expiresAt).toLocaleDateString(dateLocale(lang))
          const statusMsg = t('already_subscribed_renewal', lang, {
            expDate,
            clients: String(status.customIds?.length || 0)
          })
          telegramBot?.sendMessage(chatId, statusMsg, {
            reply_markup: {
              inline_keyboard: [[
                { text: t('support_button', lang), callback_data: 'support_renew' }
              ]]
            }
          })
          return
        }

        // Not subscribed — send welcome + invoice
        const msg = t('welcome_new', lang, { siteUrl: sUrl })
        const msgResult = telegramBot?.sendMessage(chatId, msg)
        logger.info({ chatId, msgSent: !!msgResult }, '/start welcome sent')

        // Send invoice directly for plain /start (payload = telegramUserId)
        telegramBot?.sendInvoice(chatId, String(telegramUserId), STARS_PRICE, {
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

        // If after stripping lang suffix rest is empty, treat as from site
        if (!rest) {
          // Check if already subscribed before sending invoice
          const isSubscribed = subscriptionService.isActive(telegramUserId)

          if (isSubscribed) {
            // Already subscribed — show renewal prompt with inline button
            const status = subscriptionService.getStatus(telegramUserId)
            const expDate = new Date(status.expiresAt).toLocaleDateString(dateLocale(lang))
            const statusMsg = t('already_subscribed_renewal', lang, {
              expDate,
              clients: String(status.customIds?.length || 0)
            })
            telegramBot?.sendMessage(chatId, statusMsg, {
              reply_markup: {
                inline_keyboard: [[
                  { text: t('support_button', lang), callback_data: 'support_renew' }
                ]]
              }
            })
          } else {
            // Not subscribed — send invoice immediately
            telegramBot?.sendInvoice(chatId, String(telegramUserId), STARS_PRICE, {
              title: t('invoice_title', lang),
              description: t('invoice_description_plain', lang),
              label: t('invoice_label_plain', lang)
            }).then(function (resp) {
              if (!resp?.ok) {
                telegramBot?.sendMessage(chatId, t('invoice_failed', lang))
              }
            })
          }
          return
        }

        // Check if already subscribed
        const isSubscribed = subscriptionService.isActive(telegramUserId)

        if (isSubscribed) {
          // Already subscribed — link this customId automatically, then show renewal prompt
          const linkResult = subscriptionService.linkCustomId(rest, telegramUserId)
          const linkMsg = linkResult.success
            ? t('client_linked', lang, { customId: rest })
            : t('client_already_linked', lang)
          telegramBot?.sendMessage(chatId, linkMsg)

          // Also show renewal prompt with inline button
          const status = subscriptionService.getStatus(telegramUserId)
          const expDate = new Date(status.expiresAt).toLocaleDateString(dateLocale(lang))
          const statusMsg = t('already_subscribed_renewal', lang, {
            expDate,
            clients: String(status.customIds?.length || 0)
          })
          telegramBot?.sendMessage(chatId, statusMsg, {
            reply_markup: {
              inline_keyboard: [[
                { text: t('support_button', lang), callback_data: 'support_renew' }
              ]]
            }
          })
          return
        }

        // Check if this is a renewal request (renew_ prefix)
        if (rest.startsWith('renew_')) {
          // remove 'renew_' prefix
          // Send renewal invoice
          telegramBot?.sendInvoice(chatId, 'renew_' + String(telegramUserId), STARS_PRICE, {
            title: t('renew_invoice_title', lang),
            description: t('renew_invoice_description', lang),
            label: t('renew_invoice_label', lang)
          }).then(function (resp) {
            if (!resp?.ok) {
              telegramBot?.sendMessage(chatId, t('invoice_failed', lang))
            }
          })
          return
        }

        // Not subscribed — send invoice
        telegramBot?.sendInvoice(chatId, rest, STARS_PRICE, {
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

      // ---- /renew — send renewal invoice ----
      if (msgText === '/renew') {
        const telegramUserId = from.id

        // Check that user has a subscription to renew
        if (!subscriptionService.isActive(telegramUserId)) {
          telegramBot?.sendMessage(chatId, t('renew_no_subscription', lang))
          return
        }

        // Send renewal invoice — payment will extend the subscription
        telegramBot?.sendInvoice(chatId, 'renew_' + String(telegramUserId), STARS_PRICE, {
          title: t('renew_invoice_title', lang),
          description: t('renew_invoice_description', lang),
          label: t('renew_invoice_label', lang)
        }).then(function (resp) {
          if (!resp?.ok) {
            telegramBot?.sendMessage(chatId, t('invoice_failed', lang))
          }
        })
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

                  // ---- /breathe — launch coherent breathing Mini App ----
      if (msgText === '/breathe') {
        const bUrl = baseUrl || 'https://emdrbilateral.online'
        const webAppUrl = bUrl + '/breathing'

        telegramBot?.sendMessage(chatId,
          '🌬 <b>Когерентное дыхание</b>\n\n' +
          'Вдох 5с / Выдох 5с — оптимальный ритм для успокоения нервной системы.\n\n' +
          '🦋 Скрести руки на груди (Butterfly Hug) и дыши в ритм анимации.',
          {
            reply_markup: {
              inline_keyboard: [[
                {
                  text: '🌬 Открыть сессию дыхания',
                  web_app: { url: webAppUrl }
                }
              ]]
            }
          }
        )
        return
      }

      // ---- /myid — show user's Telegram User ID ----
      if (msgText === '/myid') {
        const telegramUserId = from.id
        const myIdMsg = t('myid_response', lang, { userId: String(telegramUserId) })
        telegramBot?.sendMessage(chatId, myIdMsg)
        return
      }
    }

    // ---- callback_query — handle inline keyboard button clicks ----
    if (update.callback_query) {
      const { id: callbackId, data: callbackData, message: cbMessage, from: cbFrom } = update.callback_query
      const chatId = cbMessage.chat.id
      const telegramUserId = cbFrom.id
      const cbLang = subscriptionService.getUserLanguage(telegramUserId) || 'en'

      // Answer callback query immediately (Telegram requires this)
      telegramBot?.answerCallbackQuery(callbackId)
        .catch(function (err) {
          logger.error({ err, callbackId }, 'answerCallbackQuery error')
        })

      if (callbackData === 'support_renew') {
        // User clicked "Support with 75 ⭐" — send renewal invoice
        logger.info({ telegramUserId, chatId }, 'Support button clicked — sending renewal invoice')

        telegramBot?.sendInvoice(chatId, 'renew_' + String(telegramUserId), STARS_PRICE, {
          title: t('renew_invoice_title', cbLang),
          description: t('renew_invoice_description', cbLang),
          label: t('renew_invoice_label', cbLang)
        }).then(function (resp) {
          if (!resp?.ok) {
            telegramBot?.sendMessage(chatId, t('invoice_failed', cbLang))
          }
        })
      }
      return
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

      // Check if this is a renewal (payload starts with 'renew_')
      const isRenewal = typeof customId === 'string' && customId.startsWith('renew_')

      let result
      if (isRenewal) {
        // Renewal — extend existing subscription
        result = subscriptionService.renew(telegramUserId)
      } else {
        // New subscription
        result = subscriptionService.activate(telegramUserId, chargeId, starsAmount)

        if (result.success) {
          // Link the customId to this user (skip for plain /start — payload is telegramUserId)
          const isNumericPayload = /^\d+$/.test(customId) && String(customId) === String(telegramUserId)
          if (!isNumericPayload) {
            subscriptionService.linkCustomId(customId, telegramUserId)
          }
        }
      }

      if (result.success) {
        logger.info(
          { telegramUserId, customId, chargeId, expiresAt: new Date(result.expiresAt).toISOString() },
          isRenewal ? 'Subscription renewed via payment' : 'Subscription activated and customId linked'
        )

        const msg = isRenewal
          ? t('renew_payment_success', pLang, {
              expDate: new Date(result.expiresAt).toLocaleDateString(dateLocale(pLang))
            })
          : t('payment_success', pLang, {
              expDate: new Date(result.expiresAt).toLocaleDateString(dateLocale(pLang)),
              siteUrl: siteUrl(pLang)
            })

        telegramBot?.sendMessage(chatId, msg)
      } else {
        logger.warn({ telegramUserId, chargeId, error: result.error }, 'Activation/renewal failed')

        const msg = t('payment_failed', pLang, { error: result.error || 'Unknown error' })

        telegramBot?.sendMessage(chatId, msg)
      }
      return
    }
  })

  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // POST /api/admin/set-commands
  // Force-update the bot command list without restart
  // ------------------------------------------------------------------
  app.post("/api/admin/set-commands", (req, res) => {
    const remoteAddr = req.socket?.remoteAddress
    const isLocal = remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "::ffff:127.0.0.1"
    if (!isLocal && !testMode) {
      return res.status(403).json({ error: "Localhost only" })
    }
    if (!telegramBot) {
      return res.status(400).json({ error: "Telegram bot not configured" })
    }
    const { SUPPORTED_LANGUAGES } = require("../services/bot-translations")
    let results = []
    // Step 1: set English as the default (no language_code) — applies to all users
    telegramBot.setMyCommands('en')
      .then(ok => results.push({ lang: 'en_default', ok }))
      .catch(() => results.push({ lang: 'en_default', ok: false }))
      .then(() => {
        // Step 2: set language-specific overrides (with language_code)
        return Promise.all(SUPPORTED_LANGUAGES.filter(l => l !== 'en').map(lang =>
          telegramBot.setMyCommands(lang)
            .then(ok => { results.push({ lang, ok }); return ok })
            .catch(() => { results.push({ lang, ok: false }) })
        ))
      })
      .then(() => {
        logger.info({ results }, "Admin: bot commands updated")
        res.json({ success: true, results })
      })
      .catch(err => {
        logger.error({ err }, "Admin: set commands error")
        res.status(500).json({ error: err.message })
      })
  })

  // Auto-renew checker — runs every hour, sends invoices to users
  // with autoRenew=true whose subscription expires within 24 hours
  // ------------------------------------------------------------------
  if (telegramBot) {
    const CHECK_INTERVAL = 60 * 60 * 1000 // 1 hour
    const EXPIRY_THRESHOLD = 24 * 60 * 60 * 1000 // 24 hours
    const COOLDOWN = 24 * 60 * 60 * 1000 // 24 hours

    async function checkAutoRenew() {
      try {
        const expiring = subscriptionService.getExpiringAutoRenewSubscriptions(EXPIRY_THRESHOLD, COOLDOWN)
        if (expiring.length === 0) return

        logger.info({ count: expiring.length }, 'Auto-renew checker: sending renewal invoices')

        for (const user of expiring) {
          try {
            const lang = subscriptionService.getUserLanguage(user.telegramUserId) || 'en'
            // eslint-disable-next-line no-await-in-loop
            const result = await telegramBot.sendInvoice(
              user.chatId,
              'renew_' + String(user.telegramUserId),
              STARS_PRICE,
              {
                title: t('renew_invoice_title', lang),
                description: t('renew_invoice_description', lang),
                label: t('renew_invoice_label', lang)
              }
            )
            if (result?.ok) {
              subscriptionService.markAutoRenewInvoiceSent(user.telegramUserId)
              logger.info(
                { telegramUserId: user.telegramUserId, expiresAt: new Date(user.expiresAt).toISOString() },
                'Auto-renew invoice sent'
              )
            }
          } catch (err) {
            logger.error({ err, telegramUserId: user.telegramUserId }, 'Auto-renew invoice failed')
          }
        }
      } catch (err) {
        logger.error({ err }, 'Auto-renew checker error')
      }
    }

    // Run immediately on startup, then every hour
    checkAutoRenew()
    setInterval(checkAutoRenew, CHECK_INTERVAL)
    logger.info({ intervalMs: CHECK_INTERVAL }, 'Auto-renew checker started')
  } else {
    logger.info('No Telegram bot configured — auto-renew checker disabled')
  }
}

module.exports = { registerSubscriptionRoutes }
