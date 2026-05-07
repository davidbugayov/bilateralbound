/* jshint node: true, esversion: 11, strict: true */
'use strict'

/**
 * Subscription routes: activation/status query + Telegram webhook.
 * All subscription logic lives in SubscriptionService — this is just HTTP glue.
 */

function registerSubscriptionRoutes(app, subscriptionService, { logger, telegramBot }) {
  if (!subscriptionService) {
    logger.warn('SubscriptionService not provided — subscription routes disabled')
    return
  }

  // ------------------------------------------------------------------
  // POST /api/subscription/activate
  // Manual activation by token (used from main page or after payment)
  // Body: { sessionId, token, starsAmount }
  // ------------------------------------------------------------------
  app.post('/api/subscription/activate', (req, res) => {
    const { sessionId, token, starsAmount } = req.body || {}
    if (!sessionId || !token) {
      return res.status(400).json({ error: 'Missing sessionId or token' })
    }

    const result = subscriptionService.activate(
      sessionId,
      token,
      Number.parseInt(starsAmount, 10) || 0
    )

    if (!result.success) {
      return res.status(409).json({ error: result.error })
    }

    res.json({
      success: true,
      expiresAt: result.expiresAt
    })
  })

  // ------------------------------------------------------------------
  // GET /api/subscription/status/:sessionId
  // Check subscription status for a session
  // ------------------------------------------------------------------
  app.get('/api/subscription/status/:sessionId', (req, res) => {
    const { sessionId } = req.params
    const status = subscriptionService.getStatus(sessionId)
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

    // Detect user language from Telegram (ru / en / other → fallback to en)
    const lang = update.message?.from?.language_code || 'en'

    // ---- /start command — send welcome + invoice ----
    if (update.message?.text) {
      const { chat, text } = update.message
      const chatId = chat.id

      if (text === '/start') {
        const siteUrl = lang === 'ru'
          ? 'https://emdrbilateral.ru'
          : 'https://emdrbilateral.online'

        const msg = lang === 'ru'
          ? '<b>👋 Добро пожаловать в BilateralBound Premium!</b>\n\n' +
            'Этот бот управляет подпиской на EMDR-инструмент.\n\n' +
            '👉 <b>Как подписаться:</b>\n' +
            '1. Перейдите на <a href="' + siteUrl + '">' + siteUrl + '</a>\n' +
            '2. Введите ID клиента (например, anna_2025)\n' +
            '3. Нажмите «Subscribe via Telegram»\n' +
            '4. Оплатите 75 ⭐ здесь в боте\n\n' +
            'Или отправьте /subscribe с вашим ID клиента:\n' +
            '<code>/subscribe anna_2025</code>'
          : '<b>👋 Welcome to BilateralBound Premium!</b>\n\n' +
            'This bot handles your EMDR tool subscription.\n\n' +
            '👉 <b>How to subscribe:</b>\n' +
            '1. Go to <a href="' + siteUrl + '">' + siteUrl + '</a>\n' +
            '2. Enter your Client ID (e.g. anna_2025)\n' +
            '3. Click "Subscribe via Telegram"\n' +
            '4. Pay 75 Stars here in the bot\n\n' +
            'Or send /subscribe with your Client ID:\n' +
            '<code>/subscribe anna_2025</code>'

        telegramBot?.sendMessage(chatId, msg)
        return
      }

      if (text.startsWith('/start subscribe_') || text.startsWith('/subscribe ')) {
        // Extract sessionId: /start subscribe_SESSIONID or /subscribe SESSIONID
        const parts = text.split(/\s+|_/).filter(Boolean)
        const sessionId = parts[1] || (text.includes('subscribe_') ? text.split('subscribe_')[1]?.trim() : '')

        if (!sessionId || sessionId.length < 3) {
          const msg = lang === 'ru'
            ? '❌ <b>Неверный ID клиента.</b>\n\n' +
              'Перейдите на emdrbilateral.ru, введите ID клиента ' +
              'и нажмите «Subscribe via Telegram».'
            : '❌ <b>Invalid Client ID.</b>\n\n' +
              'Please go to emdrbilateral.ru, enter your Client ID, ' +
              'and click "Subscribe via Telegram" to get the correct link.'

          telegramBot?.sendMessage(chatId, msg)
          return
        }

        const payText = lang === 'ru' ? '💎 Оплатить 75 ⭐' : '💎 Pay 75 ⭐'
        const msg = lang === 'ru'
          ? '📋 <b>Оформление подписки для:</b> <code>' + sessionId + '</code>\n\n' +
            'Premium Plan — <b>75 ⭐/мес</b>\n' +
            '✅ Постоянные ID сессий\n' +
            '✅ Ссылки никогда не истекают\n' +
            '✅ Приоритетная поддержка\n\n' +
            'Нажмите кнопку ниже для оплаты Telegram Stars.'
          : '📋 <b>Subscribing for:</b> <code>' + sessionId + '</code>\n\n' +
            'Premium Plan — <b>75 ⭐/month</b>\n' +
            '✅ Custom permanent session IDs\n' +
            '✅ Links never expire\n' +
            '✅ Priority support\n\n' +
            'Click the button below to pay with Telegram Stars.'

        telegramBot?.sendMessage(chatId, msg, {
          reply_markup: JSON.stringify({
            inline_keyboard: [[
              { text: payText, pay: true }
            ]]
          })
        })
        return
      }
    }

    // ---- pre_checkout_query — validate ----
    if (update.pre_checkout_query) {
      const { id, invoice_payload: sessionId } = update.pre_checkout_query
      const qLang = update.pre_checkout_query.from?.language_code || 'en'
      const errMsg = qLang === 'ru' ? 'Неверная сессия' : 'Invalid session'

      if (sessionId && subscriptionService.canAcceptPayment(sessionId)) {
        telegramBot?.answerPreCheckoutQuery(id, true)
        logger.info({ preCheckoutQueryId: id, sessionId }, 'Pre-checkout approved')
      } else {
        telegramBot?.answerPreCheckoutQuery(id, false, errMsg)
        logger.warn({ preCheckoutQueryId: id, sessionId }, 'Pre-checkout rejected')
      }
      return
    }

    // ---- successful_payment — activate ----
    if (update.message?.successful_payment) {
      const chatId = update.message.chat.id
      const {
        invoice_payload: payload,
        telegram_payment_charge_id: chargeId,
        total_amount: starsAmount
      } = update.message.successful_payment
      const pLang = update.message.from?.language_code || 'en'

      logger.info(
        { payload, chargeId, starsAmount },
        'Telegram Stars payment received'
      )

      const result = subscriptionService.activate(payload, chargeId, starsAmount)

      if (result.success) {
        logger.info(
          { sessionId: payload, chargeId, expiresAt: new Date(result.expiresAt).toISOString() },
          'Subscription activated'
        )

        const msg = pLang === 'ru'
          ? '✅ <b>Оплата прошла успешно!</b>\n\n' +
            'Ваша подписка для <code>' + payload + '</code> активна.\n' +
            'Истекает: ' + new Date(result.expiresAt).toLocaleDateString('ru-RU') + '\n\n' +
            'Перейдите на <a href="https://emdrbilateral.ru">emdrbilateral.ru</a> ' +
            'и введите ID клиента, чтобы пользоваться Premium! 🎉'
          : '✅ <b>Payment successful!</b>\n\n' +
            'Your subscription for <code>' + payload + '</code> is now active.\n' +
            'Expires: ' + new Date(result.expiresAt).toLocaleDateString() + '\n\n' +
            'Go to <a href="https://emdrbilateral.ru">emdrbilateral.ru</a> ' +
            'and enter your Client ID to start using premium features! 🎉'

        telegramBot?.sendMessage(chatId, msg)
      } else {
        logger.warn({ payload, chargeId, error: result.error }, 'Activation failed')

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
