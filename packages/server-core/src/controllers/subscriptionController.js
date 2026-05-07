/* jshint node: true, esversion: 11, strict: true */
'use strict'

/**
 * Subscription routes: check/status + Telegram webhook.
 * All subscription logic lives in SubscriptionService — this is just HTTP glue.
 *
 * Key change: subscriptions are tied to telegramUserId, NOT to customId.
 * After payment, the customId is linked to the user's Telegram account.
 */

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
  // POST /api/subscription/webhook
  // Telegram Bot webhook endpoint (Telegram Stars payments)
  // Body: Telegram Update object — https://core.telegram.org/bots/api#update
  // ------------------------------------------------------------------
  app.post('/api/subscription/webhook', (req, res) => {
    const update = req.body || {}

    // Respond quickly — Telegram expects 200 within a few seconds
    res.status(200).json({ ok: true })

    // Detect user language from Telegram
    const lang = update.message?.from?.language_code || 'en'

    // ---- /start command — send welcome + invoice ----
    if (update.message?.text) {
      const { chat, from } = update.message
      const chatId = chat.id
      const telegramUserId = from.id

      const msgText = update.message.text

      if (msgText === '/start') {
        const siteUrl = lang === 'ru'
          ? 'https://emdrbilateral.ru'
          : 'https://emdrbilateral.online'

        const msg = lang === 'ru'
          ? '<b>👋 Добро пожаловать в BilateralBound Premium!</b>\n\n' +
            'Этот бот управляет подпиской на EMDR-инструмент.\n\n' +
            '👉 <b>Как подписаться:</b>\n' +
            '1. Перейдите на <a href="' + siteUrl + '">' + siteUrl + '</a>\n' +
            '2. Введите название клиента (например, anna_2025)\n' +
            '3. Нажмите «Subscribe via Telegram»\n' +
            '4. Оплатите 75 ⭐ здесь в боте\n\n' +
            '<b>Один платёж — все ваши клиенты.</b>\n' +
            'После оплаты вы сможете создавать сколько угодно постоянных ссылок.'
          : '<b>👋 Welcome to BilateralBound Premium!</b>\n\n' +
            'This bot handles your EMDR tool subscription.\n\n' +
            '👉 <b>How to subscribe:</b>\n' +
            '1. Go to <a href="' + siteUrl + '">' + siteUrl + '</a>\n' +
            '2. Enter a Client Name (e.g. anna_2025)\n' +
            '3. Click "Subscribe via Telegram"\n' +
            '4. Pay 75 Stars here in the bot\n\n' +
            '<b>One payment — all your clients.</b>\n' +
            'After payment you can create unlimited permanent links.'

        telegramBot?.sendMessage(chatId, msg)
        return
      }

      // Handle /start customId deep links from the site
      if (msgText.startsWith('/start ')) {
        const rest = msgText.slice(7).trim()

        // Check if already subscribed
        const isSubscribed = subscriptionService.isActive(telegramUserId)

        if (isSubscribed) {
          // Already subscribed — link this customId automatically
          const linkResult = subscriptionService.linkCustomId(rest, telegramUserId)
          const msg = linkResult.success
            ? (lang === 'ru'
                ? '✅ Клиент <code>' + rest + '</code> привязан к вашему аккаунту!\n\n' +
                  'Возвращайтесь на сайт — ссылки готовы.'
                : '✅ Client <code>' + rest + '</code> linked to your account!\n\n' +
                  'Go back to the site — links are ready.')
            : '❌ ' + linkResult.error
          telegramBot?.sendMessage(chatId, msg)
          return
        }

        // Not subscribed — send invoice
        const title = lang === 'ru' ? 'EMDR Premium Подписка' : 'EMDR Premium Subscription'
        const description = lang === 'ru'
          ? 'Постоянные ссылки для всех ваших клиентов. Действует 30 дней.'
          : 'Permanent links for all your clients. Valid for 30 days.'
        const label = lang === 'ru' ? 'Premium (30 дней)' : 'Premium (30 days)'

        telegramBot?.sendInvoice(chatId, rest, 75, {
          title,
          description,
          label
        }).then(function (resp) {
          if (!resp?.ok) {
            telegramBot?.sendMessage(
              chatId,
              lang === 'ru'
                ? '❌ Не удалось создать счёт. Попробуйте позже.'
                : '❌ Failed to create invoice. Try again later.'
            )
          }
        })
        return
      }
    }

    // ---- pre_checkout_query — validate ----
    if (update.pre_checkout_query) {
      const { id, invoice_payload: customId } = update.pre_checkout_query
      const qLang = update.pre_checkout_query.from?.language_code || 'en'
      const errMsg = qLang === 'ru' ? 'Неверный запрос' : 'Invalid request'

      if (customId && subscriptionService.canAcceptPayment(customId)) {
        telegramBot?.answerPreCheckoutQuery(id, true)
        logger.info({ preCheckoutQueryId: id, customId }, 'Pre-checkout approved')
      } else {
        telegramBot?.answerPreCheckoutQuery(id, false, errMsg)
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
      const pLang = update.message.from?.language_code || 'en'

      logger.info(
        { telegramUserId, customId, chargeId, starsAmount },
        'Telegram Stars payment received'
      )

      // 1. Activate subscription for this Telegram user
      const result = subscriptionService.activate(telegramUserId, chargeId, starsAmount)

      if (result.success) {
        // 2. Link the customId to this user
        subscriptionService.linkCustomId(customId, telegramUserId)

        logger.info(
          { telegramUserId, customId, chargeId, expiresAt: new Date(result.expiresAt).toISOString() },
          'Subscription activated and customId linked'
        )

        const msg = pLang === 'ru'
          ? '✅ <b>Оплата прошла успешно!</b>\n\n' +
            '🎉 Ваша подписка активна!\n' +
            'Истекает: ' + new Date(result.expiresAt).toLocaleDateString('ru-RU') + '\n\n' +
            'Теперь вы можете создавать постоянные ссылки для <b>любых клиентов</b>.\n\n' +
            'Перейдите на <a href="https://emdrbilateral.ru">emdrbilateral.ru</a>, ' +
            'введите название клиента и нажмите "Create" — ссылки готовы! 🎉'
          : '✅ <b>Payment successful!</b>\n\n' +
            '🎉 Your subscription is now active!\n' +
            'Expires: ' + new Date(result.expiresAt).toLocaleDateString() + '\n\n' +
            'You can now create permanent links for <b>any clients</b>.\n\n' +
            'Go to <a href="https://emdrbilateral.ru">emdrbilateral.ru</a>, ' +
            'enter a client name and click "Create" — links are ready! 🎉'

        telegramBot?.sendMessage(chatId, msg)
      } else {
        logger.warn({ telegramUserId, chargeId, error: result.error }, 'Activation failed')

        const msg = pLang === 'ru'
          ? '❌ <b>Ошибка активации:</b>\n\n' + result.error + '\n\n' +
            'Пожалуйста, свяжитесь с поддержкой.'
          : '❌ <b>Activation error:</b>\n\n' + result.error + '\n\n' +
            'Please contact support.'

        telegramBot?.sendMessage(chatId, msg)
      }
      return
    }
  })
}

module.exports = { registerSubscriptionRoutes }
