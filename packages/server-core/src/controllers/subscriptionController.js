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
  // POST /api/subscription/webhook
  // Telegram Bot webhook endpoint (Telegram Stars payments)
  // Body: Telegram Update object — https://core.telegram.org/bots/api#update
  // ------------------------------------------------------------------
  app.post('/api/subscription/webhook', (req, res) => {
    const update = req.body || {}

    // Respond quickly — Telegram expects 200 within a few seconds
    res.status(200).json({ ok: true })

    // Detect user language: prefer site language from start payload over Telegram locale
    let lang = update.message?.from?.language_code || 'en'
    let langFromPayload = null
    if (update.message?.text && update.message.text.startsWith('/start ')) {
      const payloadMatch = update.message.text.match(/__lang_([a-z]{2}(-[A-Z]{2})?)$/)
      if (payloadMatch) {
        langFromPayload = payloadMatch[1]
        lang = langFromPayload
        // Persist language preference for this user
        const senderId = update.message?.from?.id
        if (senderId) {
          subscriptionService.setUserLanguage(senderId, lang)
        }
      }
    }

    // ---- /start command — send welcome + invoice ----
    if (update.message?.text) {
      const { chat, from } = update.message
      const chatId = chat.id
      const telegramUserId = from.id

      const msgText = update.message.text

      // Resolve stored language preference (from previous /start __lang_ru payload)
      const storedLang = subscriptionService.getUserLanguage(telegramUserId)
      if (storedLang) lang = storedLang

      if (msgText === '/start') {
        const siteUrl = lang === 'ru'
          ? 'https://emdrbilateral.ru'
          : 'https://emdrbilateral.online'

        // Check if already subscribed
        const isSubscribed = subscriptionService.isActive(telegramUserId)

        if (isSubscribed) {
          // Already subscribed — show status
          const status = subscriptionService.getStatus(telegramUserId)
          const expDate = new Date(status.expiresAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
          const statusMsg = lang === 'ru'
            ? '✅ <b>Подписка уже активна!</b>\n\n' +
              'Истекает: ' + expDate + '\n' +
              'Клиентов: ' + (status.customIds?.length || 0) + '\n\n' +
              'Возвращайтесь на сайт — ссылки готовы!'
            : '✅ <b>Subscription already active!</b>\n\n' +
              'Expires: ' + expDate + '\n' +
              'Clients: ' + (status.customIds?.length || 0) + '\n\n' +
              'Go back to the site — links are ready!'
          telegramBot?.sendMessage(chatId, statusMsg)
          return
        }

        // Not subscribed — send welcome + invoice
        const msg = lang === 'ru'
          ? '<b>👋 Добро пожаловать в BilateralBound Premium!</b>\n\n' +
            'Этот бот управляет подпиской на EMDR-инструмент.\n\n' +
            '👉 <b>Как подписаться:</b>\n' +
            '1. Перейдите на <a href="' + siteUrl + '">' + siteUrl + '</a>\n' +
            '2. Введите название клиента (например, anna_2025)\n' +
            '3. Нажмите «Subscribe via Telegram»\n\n' +
            '<b>Или оплатите прямо сейчас 👇</b>\n' +
            'После оплаты вы сможете создавать постоянные ссылки для любых клиентов.'
          : '<b>👋 Welcome to BilateralBound Premium!</b>\n\n' +
            'This bot handles your EMDR tool subscription.\n\n' +
            '👉 <b>How to subscribe:</b>\n' +
            '1. Go to <a href="' + siteUrl + '">' + siteUrl + '</a>\n' +
            '2. Enter a Client Name (e.g. anna_2025)\n' +
            '3. Click "Subscribe via Telegram"\n\n' +
            '<b>Or pay right now 👇</b>\n' +
            'After payment you can create permanent links for any clients.'

        telegramBot?.sendMessage(chatId, msg)

        // Send invoice directly for plain /start (payload = telegramUserId)
        const title = lang === 'ru' ? 'EMDR Premium Подписка' : 'EMDR Premium Subscription'
        const description = lang === 'ru'
          ? 'Доступ ко всем функциям на 30 дней. Постоянные ссылки для всех ваших клиентов.'
          : 'Full access for 30 days. Permanent links for all your clients.'
        const label = lang === 'ru' ? 'Premium (30 дней)' : 'Premium (30 days)'

        telegramBot?.sendInvoice(chatId, String(telegramUserId), 75, {
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


      // Handle /start customId deep links from the site
      if (msgText.startsWith('/start ')) {
        let rest = msgText.slice(7).trim()
        // Strip language suffix from customId if present (e.g. "anna_2025__lang_ru" → "anna_2025")
        if (langFromPayload) {
          rest = rest.replace(/__lang_[a-z]{2}(-[A-Z]{2})?$/, '')
        }

        // If after stripping lang suffix rest is empty, treat as plain /start (welcome message)
        if (!rest) {
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

      // ---- /status — check subscription status ----
      if (msgText === '/status') {
        const status = subscriptionService.getStatus(telegramUserId)
        let statusMsg
        if (status.active) {
          const expDate = new Date(status.expiresAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
          statusMsg = (lang === 'ru'
            ? '✅ <b>Подписка активна</b>\n\n' +
              'Истекает: ' + expDate + '\n' +
              'Клиентов: ' + (status.customIds?.length || 0) + '\n' +
              'Автосписание: ' + (status.autoRenew ? '✅ Вкл' : '❌ Выкл')
            : '✅ <b>Subscription Active</b>\n\n' +
              'Expires: ' + expDate + '\n' +
              'Clients: ' + (status.customIds?.length || 0) + '\n' +
              'Auto-renew: ' + (status.autoRenew ? '✅ On' : '❌ Off'))
        } else {
          statusMsg = lang === 'ru'
            ? '❌ <b>Нет активной подписки</b>\n\n' +
              'Используйте /start для оформления.'
            : '❌ <b>No Active Subscription</b>\n\n' +
              'Use /start to subscribe.'
        }
        telegramBot?.sendMessage(chatId, statusMsg)
        return
      }

      // ---- /renew — extend subscription ----
      if (msgText === '/renew') {
        const renewResult = subscriptionService.renew(telegramUserId)
        let renewMsg
        if (renewResult.success) {
          const newExp = new Date(renewResult.expiresAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
          renewMsg = lang === 'ru'
            ? '✅ <b>Подписка продлена!</b>\n\nНовая дата истечения: ' + newExp
            : '✅ <b>Subscription renewed!</b>\n\nNew expiry date: ' + newExp
        } else {
          renewMsg = lang === 'ru'
            ? '❌ ' + (renewResult.error || 'Не удалось продлить подписку')
            : '❌ ' + (renewResult.error || 'Failed to renew subscription')
        }
        telegramBot?.sendMessage(chatId, renewMsg)
        return
      }

      // ---- /cancel — cancel subscription ----
      if (msgText === '/cancel') {
        const cancelResult = subscriptionService.cancel(telegramUserId)
        let cancelMsg
        if (cancelResult.success) {
          cancelMsg = lang === 'ru'
            ? '❌ <b>Подписка отменена.</b>\n\nВсе ваши клиенты отвязаны. Если передумаете — используйте /start.'
            : '❌ <b>Subscription cancelled.</b>\n\nAll clients unlinked. Change your mind? Use /start.'
        } else {
          cancelMsg = lang === 'ru'
            ? '❌ ' + (cancelResult.error || 'Не удалось отменить подписку')
            : '❌ ' + (cancelResult.error || 'Failed to cancel subscription')
        }
        telegramBot?.sendMessage(chatId, cancelMsg)
        return
      }

      // ---- /autorenew — toggle auto-renew ----
      if (msgText === '/autorenew') {
        const status2 = subscriptionService.getStatus(telegramUserId)
        const newVal = !(status2.autoRenew || false)
        const arResult = subscriptionService.setAutoRenew(telegramUserId, newVal)
        let arMsg
        if (arResult.success) {
          arMsg = lang === 'ru'
            ? (arResult.autoRenew
                ? '✅ <b>Автосписание включено.</b>\n\nПодписка будет продлеваться автоматически каждые 30 дней.'
                : '❌ <b>Автосписание выключено.</b>\n\nПодписку нужно продлевать вручную командой /renew.')
            : (arResult.autoRenew
                ? '✅ <b>Auto-renew enabled.</b>\n\nYour subscription will renew automatically every 30 days.'
                : '❌ <b>Auto-renew disabled.</b>\n\nYou will need to manually renew with /renew.')
        } else {
          arMsg = lang === 'ru'
            ? '❌ ' + (arResult.error || 'Не удалось изменить автосписание')
            : '❌ ' + (arResult.error || 'Failed to toggle auto-renew')
        }
        telegramBot?.sendMessage(chatId, arMsg)
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
      const pLang = subscriptionService.getUserLanguage(telegramUserId)

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
