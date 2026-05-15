/* jshint node: true, esversion: 11, strict: true */
'use strict'

/**
 * Bot translations for all 8 supported languages.
 * Keys match those used in subscriptionController.js bot messages.
 *
 * Supported languages: en, ru, es, fr, de, pt, ja, zh
 */

const TRANSLATIONS = {
  // ── Site URLs ──
  siteUrl: {
    en: 'https://emdrbilateral.online',
    ru: 'https://emdrbilateral.ru',
    es: 'https://emdrbilateral.online',
    fr: 'https://emdrbilateral.online',
    de: 'https://emdrbilateral.online',
    pt: 'https://emdrbilateral.online',
    ja: 'https://emdrbilateral.online',
    zh: 'https://emdrbilateral.online'
  },

  // ── Welcome (plain /start, not subscribed) ──
  welcome_new: {
    en: '<b>👋 Welcome to BilateralBound Premium!</b>\n\n' +
        'This bot handles your EMDR tool subscription.\n\n' +
        '👉 <b>How to subscribe:</b>\n' +
        '1. Go to <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Enter a Client Name (e.g. anna_2025)\n' +
        '3. Click "Subscribe via Telegram"\n\n' +
        '<b>Or pay right now 👇</b>\n' +
        'After payment you can create permanent links for any clients.',
    ru: '<b>👋 Добро пожаловать в BilateralBound Premium!</b>\n\n' +
        'Этот бот управляет подпиской на EMDR-инструмент.\n\n' +
        '👉 <b>Как подписаться:</b>\n' +
        '1. Перейдите на <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Введите название клиента (например, anna_2025)\n' +
        '3. Нажмите «Subscribe via Telegram»\n\n' +
        '<b>Или оплатите прямо сейчас 👇</b>\n' +
        'После оплаты вы сможете создавать постоянные ссылки для любых клиентов.',
    es: '<b>👋 ¡Bienvenido a BilateralBound Premium!</b>\n\n' +
        'Este bot gestiona tu suscripción a la herramienta EMDR.\n\n' +
        '👉 <b>Cómo suscribirse:</b>\n' +
        '1. Ve a <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Ingresa un nombre de cliente (ej. anna_2025)\n' +
        '3. Haz clic en "Subscribe via Telegram"\n\n' +
        '<b>O paga ahora 👇</b>\n' +
        'Después del pago, podrás crear enlaces permanentes para cualquier cliente.',
    fr: '<b>👋 Bienvenue chez BilateralBound Premium!</b>\n\n' +
        'Ce bot gère votre abonnement à l\'outil EMDR.\n\n' +
        '👉 <b>Comment s\'abonner :</b>\n' +
        '1. Allez sur <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Entrez un nom de client (ex. anna_2025)\n' +
        '3. Cliquez sur "Subscribe via Telegram"\n\n' +
        '<b>Ou payez maintenant 👇</b>\n' +
        'Après le paiement, vous pouvez créer des liens permanents pour tous vos clients.',
    de: '<b>👋 Willkommen bei BilateralBound Premium!</b>\n\n' +
        'Dieser Bot verwaltet Ihr EMDR-Tool-Abonnement.\n\n' +
        '👉 <b>So abonnieren Sie:</b>\n' +
        '1. Gehen Sie zu <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Geben Sie einen Kundennamen ein (z.B. anna_2025)\n' +
        '3. Klicken Sie auf "Subscribe via Telegram"\n\n' +
        '<b>Oder zahlen Sie jetzt 👇</b>\n' +
        'Nach der Zahlung können Sie dauerhafte Links für beliebige Kunden erstellen.',
    pt: '<b>👋 Bem-vindo ao BilateralBound Premium!</b>\n\n' +
        'Este bot gerencia sua assinatura da ferramenta EMDR.\n\n' +
        '👉 <b>Como assinar:</b>\n' +
        '1. Acesse <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Insira um nome de cliente (ex. anna_2025)\n' +
        '3. Clique em "Subscribe via Telegram"\n\n' +
        '<b>Ou pague agora 👇</b>\n' +
        'Após o pagamento, você pode criar links permanentes para qualquer cliente.',
    ja: '<b>👋 BilateralBound Premiumへようこそ！</b>\n\n' +
        'このボットはEMDRツールのサブスクリプションを管理します。\n\n' +
        '👉 <b>購読方法：</b>\n' +
        '1. <a href="{siteUrl}">{siteUrl}</a>にアクセス\n' +
        '2. クライアント名を入力（例：anna_2025）\n' +
        '3. 「Subscribe via Telegram」をクリック\n\n' +
        '<b>今すぐ支払う👇</b>\n' +
        '支払い後、任意のクライアント用に永続的なリンクを作成できます。',
    zh: '<b>👋 欢迎使用BilateralBound Premium！</b>\n\n' +
        '此机器人管理您的EMDR工具订阅。\n\n' +
        '👉 <b>如何订阅：</b>\n' +
        '1. 前往<a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. 输入客户名称（例如：anna_2025）\n' +
        '3. 点击"Subscribe via Telegram"\n\n' +
        '<b>立即支付👇</b>\n' +
        '支付后，您可以为任何客户创建永久链接。'
  },

  // ── Already subscribed (plain /start) ──
  already_subscribed: {
    en: '✅ <b>Subscription already active!</b>\n\n' +
        'Expires: {expDate}\n' +
        'Clients: {clients}\n\n' +
        'Go back to the site — links are ready!',
    ru: '✅ <b>Подписка уже активна!</b>\n\n' +
        'Истекает: {expDate}\n' +
        'Клиентов: {clients}\n\n' +
        'Возвращайтесь на сайт — ссылки готовы!',
    es: '✅ <b>¡La suscripción ya está activa!</b>\n\n' +
        'Vence: {expDate}\n' +
        'Clientes: {clients}\n\n' +
        '¡Vuelve al sitio — los enlaces están listos!',
    fr: '✅ <b>L\'abonnement est déjà actif !</b>\n\n' +
        'Expire le : {expDate}\n' +
        'Clients : {clients}\n\n' +
        'Retournez sur le site — les liens sont prêts !',
    de: '✅ <b>Abonnement bereits aktiv!</b>\n\n' +
        'Läuft ab: {expDate}\n' +
        'Kunden: {clients}\n\n' +
        'Zurück zur Website — Links sind bereit!',
    pt: '✅ <b>Assinatura já está ativa!</b>\n\n' +
        'Expira em: {expDate}\n' +
        'Clientes: {clients}\n\n' +
        'Volte ao site — os links estão prontos!',
    ja: '✅ <b>サブスクリプションは既に有効です！</b>\n\n' +
        '期限: {expDate}\n' +
        'クライアント数: {clients}\n\n' +
        'サイトに戻ってください — リンクの準備ができています！',
    zh: '✅ <b>订阅已激活！</b>\n\n' +
        '到期: {expDate}\n' +
        '客户数: {clients}\n\n' +
        '返回网站 — 链接已就绪！'
  },

  // ── Client ID linked (when already subscribed, /start customId) ──
  client_linked: {
    en: '✅ Client <code>{customId}</code> linked to your account!\n\n' +
        'Go back to the site — links are ready.',
    ru: '✅ Клиент <code>{customId}</code> привязан к вашему аккаунту!\n\n' +
        'Возвращайтесь на сайт — ссылки готовы.',
    es: '✅ ¡Cliente <code>{customId}</code> vinculado a tu cuenta!\n\n' +
        'Vuelve al sitio — los enlaces están listos.',
    fr: '✅ Client <code>{customId}</code> lié à votre compte !\n\n' +
        'Retournez sur le site — les liens sont prêts !',
    de: '✅ Kunde <code>{customId}</code> mit Ihrem Konto verknüpft!\n\n' +
        'Zurück zur Website — Links sind bereit!',
    pt: '✅ Cliente <code>{customId}</code> vinculado à sua conta!\n\n' +
        'Volte ao site — os links estão prontos!',
    ja: '✅ クライアント <code>{customId}</code> がアカウントにリンクされました！\n\n' +
        'サイトに戻ってください — リンクの準備ができています！',
    zh: '✅ 客户 <code>{customId}</code> 已链接到您的账户！\n\n' +
        '返回网站 — 链接已就绪！'
  },

  // ── Custom ID already linked to another user ──
  client_already_linked: {
    en: '❌ This Client ID is already linked to another user.',
    ru: '❌ Этот Клиент ID уже привязан к другому пользователю.',
    es: '❌ Este ID de cliente ya está vinculado a otro usuario.',
    fr: '❌ Cet ID client est déjà lié à un autre utilisateur.',
    de: '❌ Diese Kunden-ID ist bereits mit einem anderen Benutzer verknüpft.',
    pt: '❌ Este ID de cliente já está vinculado a outro usuário.',
    ja: '❌ このクライアントIDは既に別のユーザーにリンクされています。',
    zh: '❌ 此客户ID已链接到其他用户。'
  },

  // ── Welcome (when customId is empty after stripping lang) ──
  welcome_short: {
    en: '<b>👋 Welcome to BilateralBound Premium!</b>\n\n' +
        'This bot handles your EMDR tool subscription.\n\n' +
        '👉 <b>How to subscribe:</b>\n' +
        '1. Go to <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Enter a Client Name (e.g. anna_2025)\n' +
        '3. Click "Subscribe via Telegram"\n' +
        '4. Pay 75 Stars here in the bot\n\n' +
        '<b>One payment — all your clients.</b>\n' +
        'After payment you can create unlimited permanent links.',
    ru: '<b>👋 Добро пожаловать в BilateralBound Premium!</b>\n\n' +
        'Этот бот управляет подпиской на EMDR-инструмент.\n\n' +
        '👉 <b>Как подписаться:</b>\n' +
        '1. Перейдите на <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Введите название клиента (например, anna_2025)\n' +
        '3. Нажмите «Subscribe via Telegram»\n' +
        '4. Оплатите 75 ⭐ здесь в боте\n\n' +
        '<b>Один платёж — все ваши клиенты.</b>\n' +
        'После оплаты вы сможете создавать сколько угодно постоянных ссылок.',
    es: '<b>👋 ¡Bienvenido a BilateralBound Premium!</b>\n\n' +
        'Este bot gestiona tu suscripción a la herramienta EMDR.\n\n' +
        '👉 <b>Cómo suscribirse:</b>\n' +
        '1. Ve a <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Ingresa un nombre de cliente (ej. anna_2025)\n' +
        '3. Haz clic en "Subscribe via Telegram"\n' +
        '4. Paga 75 ⭐ aquí en el bot\n\n' +
        '<b>Un pago — todos tus clientes.</b>\n' +
        'Después del pago, puedes crear enlaces permanentes ilimitados.',
    fr: '<b>👋 Bienvenue chez BilateralBound Premium!</b>\n\n' +
        'Ce bot gère votre abonnement à l\'outil EMDR.\n\n' +
        '👉 <b>Comment s\'abonner :</b>\n' +
        '1. Allez sur <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Entrez un nom de client (ex. anna_2025)\n' +
        '3. Cliquez sur "Subscribe via Telegram"\n' +
        '4. Payez 75 ⭐ ici dans le bot\n\n' +
        '<b>Un seul paiement — tous vos clients.</b>\n' +
        'Après le paiement, vous pouvez créer des liens permanents illimités.',
    de: '<b>👋 Willkommen bei BilateralBound Premium!</b>\n\n' +
        'Dieser Bot verwaltet Ihr EMDR-Tool-Abonnement.\n\n' +
        '👉 <b>So abonnieren Sie:</b>\n' +
        '1. Gehen Sie zu <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Geben Sie einen Kundennamen ein (z.B. anna_2025)\n' +
        '3. Klicken Sie auf "Subscribe via Telegram"\n' +
        '4. Zahlen Sie 75 ⭐ hier im Bot\n\n' +
        '<b>Eine Zahlung — alle Ihre Kunden.</b>\n' +
        'Nach der Zahlung können Sie unbegrenzt dauerhafte Links erstellen.',
    pt: '<b>👋 Bem-vindo ao BilateralBound Premium!</b>\n\n' +
        'Este bot gerencia sua assinatura da ferramenta EMDR.\n\n' +
        '👉 <b>Como assinar:</b>\n' +
        '1. Acesse <a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. Insira um nome de cliente (ex. anna_2025)\n' +
        '3. Clique em "Subscribe via Telegram"\n' +
        '4. Pague 75 ⭐ aqui no bot\n\n' +
        '<b>Um pagamento — todos os seus clientes.</b>\n' +
        'Após o pagamento, você pode criar links permanentes ilimitados.',
    ja: '<b>👋 BilateralBound Premiumへようこそ！</b>\n\n' +
        'このボットはEMDRツールのサブスクリプションを管理します。\n\n' +
        '👉 <b>購読方法：</b>\n' +
        '1. <a href="{siteUrl}">{siteUrl}</a>にアクセス\n' +
        '2. クライアント名を入力（例：anna_2025）\n' +
        '3. 「Subscribe via Telegram」をクリック\n' +
        '4. ここで75 ⭐を支払う\n\n' +
        '<b>1回の支払い — すべてのクライアント。</b>\n' +
        '支払い後、無制限に永続的なリンクを作成できます。',
    zh: '<b>👋 欢迎使用BilateralBound Premium！</b>\n\n' +
        '此机器人管理您的EMDR工具订阅。\n\n' +
        '👉 <b>如何订阅：</b>\n' +
        '1. 前往<a href="{siteUrl}">{siteUrl}</a>\n' +
        '2. 输入客户名称（例如：anna_2025）\n' +
        '3. 点击"Subscribe via Telegram"\n' +
        '4. 在机器人中支付75 ⭐\n\n' +
        '<b>一次支付 — 所有客户。</b>\n' +
        '支付后，您可以创建无限数量的永久链接。'
  },

  // ── Invoice ──
  invoice_title: {
    en: 'EMDR Premium Subscription',
    ru: 'EMDR Premium Подписка',
    es: 'Suscripción EMDR Premium',
    fr: 'Abonnement EMDR Premium',
    de: 'EMDR Premium Abonnement',
    pt: 'Assinatura EMDR Premium',
    ja: 'EMDR プレミアムサブスクリプション',
    zh: 'EMDR 高级订阅'
  },
  invoice_description_plain: {
    en: 'Full access for 30 days. Permanent links for all your clients.',
    ru: 'Доступ ко всем функциям на 30 дней. Постоянные ссылки для всех ваших клиентов.',
    es: 'Acceso completo por 30 días. Enlaces permanentes para todos tus clientes.',
    fr: 'Accès complet pendant 30 jours. Liens permanents pour tous vos clients.',
    de: 'Vollzugriff für 30 Tage. Dauerhafte Links für alle Ihre Kunden.',
    pt: 'Acesso completo por 30 dias. Links permanentes para todos os seus clientes.',
    ja: '30日間の完全アクセス。すべてのクライアントに永続的なリンク。',
    zh: '30天完整访问权限。为所有客户提供永久链接。'
  },
  invoice_description_custom: {
    en: 'Permanent links for all your clients. Valid for 30 days.',
    ru: 'Постоянные ссылки для всех ваших клиентов. Действует 30 дней.',
    es: 'Enlaces permanentes para todos tus clientes. Válido por 30 días.',
    fr: 'Liens permanents pour tous vos clients. Valable 30 jours.',
    de: 'Dauerhafte Links für alle Ihre Kunden. Gültig für 30 Tage.',
    pt: 'Links permanentes para todos os seus clientes. Válido por 30 dias.',
    ja: 'すべてのクライアントに永続的なリンク。30日間有効。',
    zh: '为所有客户提供永久链接。有效期为30天。'
  },
  invoice_label_plain: {
    en: 'Premium (30 days)',
    ru: 'Premium (30 дней)',
    es: 'Premium (30 días)',
    fr: 'Premium (30 jours)',
    de: 'Premium (30 Tage)',
    pt: 'Premium (30 dias)',
    ja: 'プレミアム（30日間）',
    zh: '高级（30天）'
  },
  invoice_label_custom: {
    en: 'Premium (30 days)',
    ru: 'Premium (30 дней)',
    es: 'Premium (30 días)',
    fr: 'Premium (30 jours)',
    de: 'Premium (30 Tage)',
    pt: 'Premium (30 dias)',
    ja: 'プレミアム（30日間）',
    zh: '高级（30天）'
  },
  invoice_failed: {
    en: '❌ Failed to create invoice. Try again later.',
    ru: '❌ Не удалось создать счёт. Попробуйте позже.',
    es: '❌ No se pudo crear la factura. Inténtalo más tarde.',
    fr: '❌ Échec de la création de la facture. Réessayez plus tard.',
    de: '❌ Rechnung konnte nicht erstellt werden. Versuchen Sie es später erneut.',
    pt: '❌ Falha ao criar a fatura. Tente novamente mais tarde.',
    ja: '❌ 請求書の作成に失敗しました。後でもう一度お試しください。',
    zh: '❌ 创建发票失败。请稍后重试。'
  },

  // ── /status ──
  status_active: {
    en: '✅ <b>Subscription Active</b>\n\n' +
        'Expires: {expDate}\n' +
        'Clients: {clients}\n' +
        'Auto-renew: {autoRenew}',
    ru: '✅ <b>Подписка активна</b>\n\n' +
        'Истекает: {expDate}\n' +
        'Клиентов: {clients}\n' +
        'Автосписание: {autoRenew}',
    es: '✅ <b>Suscripción Activa</b>\n\n' +
        'Vence: {expDate}\n' +
        'Clientes: {clients}\n' +
        'Renovación automática: {autoRenew}',
    fr: '✅ <b>Abonnement Actif</b>\n\n' +
        'Expire le : {expDate}\n' +
        'Clients : {clients}\n' +
        'Renouvellement auto. : {autoRenew}',
    de: '✅ <b>Abonnement Aktiv</b>\n\n' +
        'Läuft ab: {expDate}\n' +
        'Kunden: {clients}\n' +
        'Auto-Verlängerung: {autoRenew}',
    pt: '✅ <b>Assinatura Ativa</b>\n\n' +
        'Expira em: {expDate}\n' +
        'Clientes: {clients}\n' +
        'Renovação automática: {autoRenew}',
    ja: '✅ <b>サブスクリプション有効</b>\n\n' +
        '期限: {expDate}\n' +
        'クライアント数: {clients}\n' +
        '自動更新: {autoRenew}',
    zh: '✅ <b>订阅已激活</b>\n\n' +
        '到期: {expDate}\n' +
        '客户数: {clients}\n' +
        '自动续费: {autoRenew}'
  },
  status_inactive: {
    en: '❌ <b>No Active Subscription</b>\n\nUse /start to subscribe.',
    ru: '❌ <b>Нет активной подписки</b>\n\nИспользуйте /start для оформления.',
    es: '❌ <b>Sin Suscripción Activa</b>\n\nUsa /start para suscribirte.',
    fr: '❌ <b>Pas d\'abonnement actif</b>\n\nUtilisez /start pour vous abonner.',
    de: '❌ <b>Kein aktives Abonnement</b>\n\nVerwenden Sie /start zum Abonnieren.',
    pt: '❌ <b>Nenhuma Assinatura Ativa</b>\n\nUse /start para assinar.',
    ja: '❌ <b>有効なサブスクリプションがありません</b>\n\n購読するには /start を使用してください。',
    zh: '❌ <b>没有有效的订阅</b>\n\n使用 /start 订阅。'
  },

  // ── /renew (renewal invoice) ──
  renew_invoice_title: {
    en: 'EMDR Premium — Renew',
    ru: 'EMDR Premium — Продление',
    es: 'EMDR Premium — Renovar',
    fr: 'EMDR Premium — Renouveler',
    de: 'EMDR Premium — Verlängern',
    pt: 'EMDR Premium — Renovar',
    ja: 'EMDR プレミアム — 更新',
    zh: 'EMDR 高级 — 续期'
  },
  renew_invoice_description: {
    en: 'Extend your Premium subscription for another 30 days.',
    ru: 'Продлите Premium подписку ещё на 30 дней.',
    es: 'Extiende tu suscripción Premium por otros 30 días.',
    fr: 'Prolongez votre abonnement Premium de 30 jours.',
    de: 'Verlängern Sie Ihr Premium-Abonnement um weitere 30 Tage.',
    pt: 'Estenda sua assinatura Premium por mais 30 dias.',
    ja: 'プレミアムサブスクリプションをさらに30日間延長します。',
    zh: '将您的高级订阅再延长30天。'
  },
  renew_invoice_label: {
    en: 'Renewal (30 days)',
    ru: 'Продление (30 дней)',
    es: 'Renovación (30 días)',
    fr: 'Renouvellement (30 jours)',
    de: 'Verlängerung (30 Tage)',
    pt: 'Renovação (30 dias)',
    ja: '更新（30日間）',
    zh: '续期（30天）'
  },
  renew_payment_success: {
    en: '✅ <b>Subscription renewed!</b>\n\n🎉 Your Premium is extended!\nNew expiry date: {expDate}',
    ru: '✅ <b>Подписка продлена!</b>\n\n🎉 Premium продлён!\nНовая дата истечения: {expDate}',
    es: '✅ <b>¡Suscripción renovada!</b>\n\n🎉 ¡Tu Premium ha sido extendido!\nNueva fecha de vencimiento: {expDate}',
    fr: '✅ <b>Abonnement renouvelé !</b>\n\n🎉 Votre Premium est prolongé !\nNouvelle date d\'expiration : {expDate}',
    de: '✅ <b>Abonnement verlängert!</b>\n\n🎉 Ihr Premium wurde verlängert!\nNeues Ablaufdatum: {expDate}',
    pt: '✅ <b>Assinatura renovada!</b>\n\n🎉 Seu Premium foi estendido!\nNova data de expiração: {expDate}',
    ja: '✅ <b>サブスクリプションが更新されました！</b>\n\n🎉 プレミアムが延長されました！\n新しい期限: {expDate}',
    zh: '✅ <b>订阅已续期！</b>\n\n🎉 您的高级版已延长！\n新到期日: {expDate}'
  },

  // ── /renew (legacy free extension — removed, kept for backward compat) ──
  renew_success: {
    en: '✅ <b>Subscription renewed!</b>\n\nNew expiry date: {expDate}',
    ru: '✅ <b>Подписка продлена!</b>\n\nНовая дата истечения: {expDate}',
    es: '✅ <b>¡Suscripción renovada!</b>\n\nNueva fecha de vencimiento: {expDate}',
    fr: '✅ <b>Abonnement renouvelé !</b>\n\nNouvelle date d\'expiration : {expDate}',
    de: '✅ <b>Abonnement verlängert!</b>\n\nNeues Ablaufdatum: {expDate}',
    pt: '✅ <b>Assinatura renovada!</b>\n\nNova data de expiração: {expDate}',
    ja: '✅ <b>サブスクリプションが更新されました！</b>\n\n新しい期限: {expDate}',
    zh: '✅ <b>订阅已续期！</b>\n\n新到期日: {expDate}'
  },
  renew_no_subscription: {
    en: '❌ <b>No Active Subscription</b>\n\nUse /start to subscribe.',
    ru: '❌ <b>Нет активной подписки</b>\n\nИспользуйте /start для оформления.',
    es: '❌ <b>Sin Suscripción Activa</b>\n\nUsa /start para suscribirte.',
    fr: '❌ <b>Pas d\'abonnement actif</b>\n\nUtilisez /start pour vous abonner.',
    de: '❌ <b>Kein aktives Abonnement</b>\n\nVerwenden Sie /start zum Abonnieren.',
    pt: '❌ <b>Nenhuma Assinatura Ativa</b>\n\nUse /start para assinar.',
    ja: '❌ <b>有効なサブスクリプションがありません</b>\n\n購読するには /start を使用してください。',
    zh: '❌ <b>没有有效的订阅</b>\n\n使用 /start 订阅。'
  },
  renew_failed: {
    en: '❌ Failed to renew subscription. Try again later.',
    ru: '❌ Не удалось продлить подписку. Попробуйте позже.',
    es: '❌ No se pudo renovar la suscripción. Inténtalo más tarde.',
    fr: '❌ Échec du renouvellement de l\'abonnement. Réessayez plus tard.',
    de: '❌ Verlängerung fehlgeschlagen. Versuchen Sie es später erneut.',
    pt: '❌ Falha ao renovar assinatura. Tente novamente mais tarde.',
    ja: '❌ サブスクリプションの更新に失敗しました。後でもう一度お試しください。',
    zh: '❌ 续期失败。请稍后重试。'
  },

  // ── /autorenew ──
  autorenew_enabled: {
    en: '✅ <b>Auto-renew enabled.</b>\n\nYour subscription will renew automatically every 30 days.',
    ru: '✅ <b>Автосписание включено.</b>\n\nПодписка будет продлеваться автоматически каждые 30 дней.',
    es: '✅ <b>Renovación automática activada.</b>\n\nTu suscripción se renovará automáticamente cada 30 días.',
    fr: '✅ <b>Renouvellement automatique activé.</b>\n\nVotre abonnement sera renouvelé automatiquement tous les 30 jours.',
    de: '✅ <b>Auto-Verlängerung aktiviert.</b>\n\nIhr Abonnement verlängert sich automatisch alle 30 Tage.',
    pt: '✅ <b>Renovação automática ativada.</b>\n\nSua assinatura será renovada automaticamente a cada 30 dias.',
    ja: '✅ <b>自動更新が有効になりました。</b>\n\nサブスクリプションは30日ごとに自動更新されます。',
    zh: '✅ <b>自动续费已启用。</b>\n\n您的订阅将每30天自动续期。'
  },
  autorenew_disabled: {
    en: '❌ <b>Auto-renew disabled.</b>\n\nYou will need to manually renew with /renew.',
    ru: '❌ <b>Автосписание выключено.</b>\n\nПодписку нужно продлевать вручную командой /renew.',
    es: '❌ <b>Renovación automática desactivada.</b>\n\nNecesitarás renovar manualmente con /renew.',
    fr: '❌ <b>Renouvellement automatique désactivé.</b>\n\nVous devrez renouveler manuellement avec /renew.',
    de: '❌ <b>Auto-Verlängerung deaktiviert.</b>\n\nSie müssen manuell mit /renew verlängern.',
    pt: '❌ <b>Renovação automática desativada.</b>\n\nVocê precisará renovar manualmente com /renew.',
    ja: '❌ <b>自動更新が無効になりました。</b>\n\n/renew を使用して手動で更新する必要があります。',
    zh: '❌ <b>自动续费已禁用。</b>\n\n您需要使用 /renew 手动续期。'
  },
  autorenew_no_subscription: {
    en: '❌ <b>No Active Subscription</b>\n\nUse /start to subscribe.',
    ru: '❌ <b>Нет активной подписки</b>\n\nИспользуйте /start для оформления.',
    es: '❌ <b>Sin Suscripción Activa</b>\n\nUsa /start para suscribirte.',
    fr: '❌ <b>Pas d\'abonnement actif</b>\n\nUtilisez /start pour vous abonner.',
    de: '❌ <b>Kein aktives Abonnement</b>\n\nVerwenden Sie /start zum Abonnieren.',
    pt: '❌ <b>Nenhuma Assinatura Ativa</b>\n\nUse /start para assinar.',
    ja: '❌ <b>有効なサブスクリプションがありません</b>\n\n購読するには /start を使用してください。',
    zh: '❌ <b>没有有效的订阅</b>\n\n使用 /start 订阅。'
  },
  autorenew_failed: {
    en: '❌ Failed to toggle auto-renew. Try again later.',
    ru: '❌ Не удалось изменить автосписание. Попробуйте позже.',
    es: '❌ No se pudo cambiar la renovación automática. Inténtalo más tarde.',
    fr: '❌ Échec du changement de renouvellement automatique. Réessayez plus tard.',
    de: '❌ Auto-Verlängerung konnte nicht umgeschaltet werden. Versuchen Sie es später erneut.',
    pt: '❌ Falha ao alterar renovação automática. Tente novamente mais tarde.',
    ja: '❌ 自動更新の切り替えに失敗しました。後でもう一度お試しください。',
    zh: '❌ 切换自动续费失败。请稍后重试。'
  },

  // ── Payment ──
  payment_success: {
    en: '✅ <b>Payment successful!</b>\n\n' +
        '🎉 Your subscription is now active!\n' +
        'Expires: {expDate}\n\n' +
        'You can now create permanent links for <b>any clients</b>.\n\n' +
        'Go to <a href="{siteUrl}">{siteUrl}</a>, ' +
        'enter a client name and click "Create" — links are ready! 🎉',
    ru: '✅ <b>Оплата прошла успешно!</b>\n\n' +
        '🎉 Ваша подписка активна!\n' +
        'Истекает: {expDate}\n\n' +
        'Теперь вы можете создавать постоянные ссылки для <b>любых клиентов</b>.\n\n' +
        'Перейдите на <a href="{siteUrl}">{siteUrl}</a>, ' +
        'введите название клиента и нажмите "Create" — ссылки готовы! 🎉',
    es: '✅ <b>¡Pago exitoso!</b>\n\n' +
        '🎉 ¡Tu suscripción ya está activa!\n' +
        'Vence: {expDate}\n\n' +
        'Ahora puedes crear enlaces permanentes para <b>cualquier cliente</b>.\n\n' +
        'Ve a <a href="{siteUrl}">{siteUrl}</a>, ' +
        'ingresa un nombre de cliente y haz clic en "Create" — ¡los enlaces están listos! 🎉',
    fr: '✅ <b>Paiement réussi !</b>\n\n' +
        '🎉 Votre abonnement est maintenant actif !\n' +
        'Expire le : {expDate}\n\n' +
        'Vous pouvez désormais créer des liens permanents pour <b>tous vos clients</b>.\n\n' +
        'Allez sur <a href="{siteUrl}">{siteUrl}</a>, ' +
        'entrez un nom de client et cliquez sur "Create" — les liens sont prêts ! 🎉',
    de: '✅ <b>Zahlung erfolgreich!</b>\n\n' +
        '🎉 Ihr Abonnement ist jetzt aktiv!\n' +
        'Läuft ab: {expDate}\n\n' +
        'Sie können jetzt dauerhafte Links für <b>beliebige Kunden</b> erstellen.\n\n' +
        'Gehen Sie zu <a href="{siteUrl}">{siteUrl}</a>, ' +
        'geben Sie einen Kundennamen ein und klicken Sie auf "Create" — Links sind bereit! 🎉',
    pt: '✅ <b>Pagamento bem-sucedido!</b>\n\n' +
        '🎉 Sua assinatura agora está ativa!\n' +
        'Expira em: {expDate}\n\n' +
        'Agora você pode criar links permanentes para <b>quaisquer clientes</b>.\n\n' +
        'Acesse <a href="{siteUrl}">{siteUrl}</a>, ' +
        'insira um nome de cliente e clique em "Create" — os links estão prontos! 🎉',
    ja: '✅ <b>お支払い成功！</b>\n\n' +
        '🎉 サブスクリプションが有効になりました！\n' +
        '期限: {expDate}\n\n' +
        '<b>任意のクライアント</b>に永続的なリンクを作成できます。\n\n' +
        '<a href="{siteUrl}">{siteUrl}</a>にアクセスし、' +
        'クライアント名を入力して「Create」をクリック — リンクの準備完了！🎉',
    zh: '✅ <b>支付成功！</b>\n\n' +
        '🎉 您的订阅已激活！\n' +
        '到期: {expDate}\n\n' +
        '您现在可以为<b>任何客户</b>创建永久链接。\n\n' +
        '前往<a href="{siteUrl}">{siteUrl}</a>，' +
        '输入客户名称并点击"Create" — 链接已就绪！🎉'
  },
  payment_failed: {
    en: '❌ <b>Activation error:</b>\n\n{error}\n\nPlease contact support.',
    ru: '❌ <b>Ошибка активации:</b>\n\n{error}\n\nПожалуйста, свяжитесь с поддержкой.',
    es: '❌ <b>Error de activación:</b>\n\n{error}\n\nPor favor, contacta al soporte.',
    fr: '❌ <b>Erreur d\'activation :</b>\n\n{error}\n\nVeuillez contacter le support.',
    de: '❌ <b>Aktivierungsfehler:</b>\n\n{error}\n\nBitte kontaktieren Sie den Support.',
    pt: '❌ <b>Erro de ativação:</b>\n\n{error}\n\nEntre em contato com o suporte.',
    ja: '❌ <b>アクティベーションエラー：</b>\n\n{error}\n\nサポートにお問い合わせください。',
    zh: '❌ <b>激活错误：</b>\n\n{error}\n\n请联系支持。'
  },

  // ── Pre-checkout ──
  pre_checkout_invalid: {
    en: 'Invalid request',
    ru: 'Неверный запрос',
    es: 'Solicitud inválida',
    fr: 'Demande invalide',
    de: 'Ungültige Anfrage',
    pt: 'Solicitação inválida',
    ja: '無効なリクエスト',
    zh: '无效请求'
  },

  // ── Bot commands (for setMyCommands) ──
  cmd_start: {
    en: 'Start the bot / get subscription info',
    ru: 'Запустить бота / информация о подписке',
    es: 'Iniciar el bot / obtener info de suscripción',
    fr: 'Démarrer le bot / infos abonnement',
    de: 'Bot starten / Abonnement-Info',
    pt: 'Iniciar o bot / obter informações da assinatura',
    ja: 'ボットを起動 / サブスクリプション情報',
    zh: '启动机器人 / 获取订阅信息'
  },
  cmd_status: {
    en: 'Check your subscription status',
    ru: 'Проверить статус подписки',
    es: 'Verificar el estado de tu suscripción',
    fr: 'Vérifier le statut de votre abonnement',
    de: 'Abonnement-Status prüfen',
    pt: 'Verificar o status da sua assinatura',
    ja: 'サブスクリプションの状態を確認',
    zh: '检查您的订阅状态'
  },
  cmd_renew: {
    en: 'Extend your subscription by 30 days',
    ru: 'Продлить подписку на 30 дней',
    es: 'Extender tu suscripción por 30 días',
    fr: 'Prolonger votre abonnement de 30 jours',
    de: 'Abonnement um 30 Tage verlängern',
    pt: 'Estender sua assinatura por 30 dias',
    ja: 'サブスクリプションを30日間延長',
    zh: '将订阅延长30天'
  },
  cmd_autorenew: {
    en: 'Toggle auto-renew on/off',
    ru: 'Включить/выключить автосписание',
    es: 'Activar/desactivar renovación automática',
    fr: 'Activer/désactiver le renouvellement auto.',
    de: 'Auto-Verlängerung ein/aus',
    pt: 'Ativar/desativar renovação automática',
    ja: '自動更新のオン/オフ切り替え',
    zh: '开启/关闭自动续费'
  },
}

// ── Supported languages list ──
const SUPPORTED_LANGUAGES = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh']

/**
 * Get a translation for a key in the specified language.
 * Falls back to English if the key or language is missing.
 *
 * @param {string} key - Translation key (e.g. 'welcome_new', 'status_active')
 * @param {string} [lang='en'] - Language code
 * @param {Object} [placeholders] - Optional key-value pairs for {placeholder} substitution
 * @returns {string} Translated text
 */
function t(key, lang, placeholders) {
  const l = (lang && SUPPORTED_LANGUAGES.includes(lang)) ? lang : 'en'
  const entry = TRANSLATIONS[key]
  if (!entry) return key

  let text = entry[l]
  if (!text) {
    text = entry['en'] || key
  }

  if (placeholders) {
    for (const [k, v] of Object.entries(placeholders)) {
      text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), v)
    }
  }

  return text
}

/**
 * Get the site URL for a given language.
 */
function siteUrl(lang) {
  return t('siteUrl', lang)
}

/**
 * Get locale string for Date formatting based on language.
 */
function dateLocale(lang) {
  const map = {
    ru: 'ru-RU',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    pt: 'pt-BR',
    ja: 'ja-JP',
    zh: 'zh-CN'
  }
  return map[lang] || 'en-US'
}

/**
 * Format auto-renew status text for display.
 */
function autoRenewText(lang, enabled) {
  if (lang === 'ru') return enabled ? '✅ Вкл' : '❌ Выкл'
  if (lang === 'es') return enabled ? '✅ Sí' : '❌ No'
  if (lang === 'fr') return enabled ? '✅ Oui' : '❌ Non'
  if (lang === 'de') return enabled ? '✅ An' : '❌ Aus'
  if (lang === 'pt') return enabled ? '✅ Sim' : '❌ Não'
  if (lang === 'ja') return enabled ? '✅ オン' : '❌ オフ'
  if (lang === 'zh') return enabled ? '✅ 开' : '❌ 关'
  return enabled ? '✅ On' : '❌ Off'
}

/**
 * Get command set descriptions for setMyCommands in a specific language.
 */
function getCommandsForLang(lang) {
  return [
    { command: 'start', description: t('cmd_start', lang) },
    { command: 'status', description: t('cmd_status', lang) },
    { command: 'renew', description: t('cmd_renew', lang) },
    { command: 'autorenew', description: t('cmd_autorenew', lang) }
  ]
}

module.exports = {
  TRANSLATIONS,
  SUPPORTED_LANGUAGES,
  t,
  siteUrl,
  dateLocale,
  autoRenewText,
  getCommandsForLang
}
