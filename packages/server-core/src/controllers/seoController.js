'use strict'

function registerSeoRoutes(app) {
  // Dynamic robots.txt per domain (.ru gets Host directive, .online does not)
  app.get('/robots.txt', (req, res) => {
    const host = req.get('host') || ''
    const isRu = host.endsWith('.ru')
    const base = isRu
      ? 'https://emdrbilateral.ru'
      : 'https://emdrbilateral.online'
    const lines = [
      '# Robots.txt - BilateralBound EMDR Therapy',
      '',
      'User-agent: *',
      'Allow: /',
      '',
      'Disallow: /admin/',
      'Disallow: /private/',
      'Disallow: /config/',
      'Disallow: /scripts/',
      'Disallow: /test/',
      'Disallow: /tmp/',
      'Disallow: /cache/',
      'Disallow: /logs/',
      'Disallow: /backup/',
      'Disallow: /node_modules/',
      'Disallow: /.git/',
      'Disallow: /.github/',
      'Disallow: /.env',
      'Disallow: /.htaccess',
      'Disallow: /.htpasswd',
      'Disallow: /package.json',
      'Disallow: /package-lock.json',
      '',
      'User-agent: Googlebot',
      'Allow: /',
      'Crawl-delay: 1',
      '',
      'User-agent: Googlebot-Image',
      'Allow: /',
      'Crawl-delay: 2',
      '',
      'User-agent: Yandex',
      'Allow: /',
      'Crawl-delay: 1',
      ...(isRu ? [`Host: ${base}`] : []),
      '',
      'User-agent: YandexImages',
      'Allow: /',
      'Crawl-delay: 2',
      '',
      'User-agent: Bingbot',
      'Allow: /',
      'Crawl-delay: 1',
      '',
      'User-agent: DuckDuckBot',
      'Allow: /',
      'Crawl-delay: 1',
      '',
      'User-agent: facebookexternalhit',
      'Allow: /',
      '',
      'User-agent: Twitterbot',
      'Allow: /',
      '',
      'User-agent: TelegramBot',
      'Allow: /',
      '',
      'User-agent: vkShare',
      'Allow: /',
      '',
      'User-agent: GPTBot',
      'Allow: /',
      '',
      'User-agent: Claude-Web',
      'Allow: /',
      '',
      'User-agent: ClaudeBot',
      'Allow: /',
      '',
      'User-agent: PerplexityBot',
      'Allow: /',
      '',
      'User-agent: Google-Extended',
      'Allow: /',
      '',
      `Sitemap: ${base}/sitemap.xml`
    ]
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(lines.join('\n'))
  })

  // Dynamic sitemap.xml per domain
  app.get('/sitemap.xml', (req, res) => {
    const host = req.get('host') || ''
    const isRu = host.endsWith('.ru')
    const base = isRu
      ? 'https://emdrbilateral.ru'
      : 'https://emdrbilateral.online'
    const today = new Date().toISOString().split('T')[0]
    const imageTitle = isRu
      ? 'BilateralBound - EMDR терапия онлайн'
      : 'BilateralBound - Online EMDR Therapy Platform'
    const imageCaption = isRu
      ? 'Профессиональная платформа EMDR терапии с биодинамической стимуляцией'
      : 'Professional EMDR therapy platform with bilateral stimulation'

    // hreflang alternates: ru lives on .ru, other languages on .online (with ?lang=)
    const buildHreflang = (path) => {
      const langs = ['ru', 'en', 'de', 'es', 'fr', 'pt', 'ja', 'zh']
      return langs
        .map((l) => {
          const domain =
            l === 'ru'
              ? 'https://emdrbilateral.ru'
              : 'https://emdrbilateral.online'
          const suffix = l === 'ru' || l === 'en' ? '' : `?lang=${l}`
          return `    <xhtml:link rel="alternate" hreflang="${l}" href="${domain}${path}${suffix}" />`
        })
        .join('\n')
    }
    const hreflangDefault = isRu
      ? 'https://emdrbilateral.ru/'
      : 'https://emdrbilateral.online/'

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${base}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${base}/emdr-eye.png</image:loc>
      <image:title>${imageTitle}</image:title>
      <image:caption>${imageCaption}</image:caption>
    </image:image>
${buildHreflang('/')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${hreflangDefault}" />
  </url>
  <url>
    <loc>${base}/privacy</loc>
    <lastmod>2026-05-08</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
${buildHreflang('/privacy')}
  </url>
  <url>
    <loc>${base}/offer</loc>
    <lastmod>2026-05-08</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
${buildHreflang('/offer')}
  </url>
  <url>
    <loc>${base}/breathing</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
${buildHreflang('/breathing')}
  </url>
  <url>
    <loc>${base}/about</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
${buildHreflang('/about')}
  </url>
</urlset>`
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(xml.trim())
  })

  // llms.txt — structured summary for LLM crawlers (Perplexity, Claude, Gemini)
  // Spec: https://llmstxt.org/ — must be valid Markdown with H1 + links
  // Returns locale-specific content: Russian for .ru, English for .online
  app.get('/llms.txt', (req, res) => {
    const host = req.get('host') || ''
    const isRu = host.endsWith('.ru')
    const base = isRu
      ? 'https://emdrbilateral.ru'
      : 'https://emdrbilateral.online'

    const content = isRu
      ? `# BilateralBound — Бесплатный EMDR (ДПДГ) тренажёр онлайн

> Бесплатный онлайн-тренажёр для билатеральной стимуляции в EMDR (ДПДГ) терапии. Движущийся шарик (световой бар) помогает снизить тревогу и переработать стресс. Терапевт управляет сессией в реальном времени, пациент следит за стимуляцией с любого устройства. Без регистрации. Используется терапевтами по всему миру на 8 языках.

## Быстрые ссылки
- [Главная](${base}/) — Начать или восстановить EMDR сессию
- [О EMDR терапии](${base}/about) — Узнайте, как работает билатеральная стимуляция
- [Дыхательное упражнение](${base}/breathing) — Бесплатная сессия когерентного дыхания (5с/5с + Butterfly Hug)
- [Политика конфиденциальности](${base}/privacy)
- [Условия использования](${base}/offer)
- [GitHub](https://github.com/davidbugayov) — Проект с открытым исходным кодом

## Что делает BilateralBound
- Обеспечивает билатеральную стимуляцию (движение глаз) для сессий EMDR терапии в реальном времени
- WebSocket-синхронизация с миллисекундной точностью между терапевтом и пациентом
- Поддерживает билатеральный звук (чередование левого/правого уха) для полного эффекта
- Работает на любом устройстве с современным браузером — установка не требуется
- Постоянные ссылки на сессии для терапевтов с подпиской
- Режим Brainspotting (BSP): терапевт перемещает шар мышью, пациент видит плавное движение в реальном времени

## Для кого
- Лицензированные EMDR терапевты, проводящие удалённые сессии
- Пациенты, проходящие EMDR терапию для переработки травм
- Специалисты в области психического здоровья, которым нужен бесплатный и надёжный инструмент

## Состояния, при которых применяется EMDR
- Посттравматическое стрессовое расстройство (ПТСР)
- Тревожные расстройства и панические атаки
- Депрессия и эмоциональные травмы
- Фобии и обсессивно-компульсивные расстройства
- Травмы отношений и парная терапия

## Технические детали
- Синхронизация в реальном времени через WebSocket (Node.js / Express)
- 8 языков: английский, русский, немецкий, испанский, французский, португальский, японский, китайский
- Без регистрации — мгновенное создание сессии
- Premium подписка через Telegram Stars (75⭐ / 30 дней) для постоянных ссылок
- [Telegram бот](https://t.me/emdrbilateral_bot) для управления подпиской

## Разработчик
- Давид Бугаев
- [GitHub](https://github.com/davidbugayov)
- [Email](mailto:davidbugayov@ya.ru)
`
      : `# BilateralBound — Free Online EMDR Therapy Platform

> Free online EMDR therapy platform for bilateral stimulation. Therapists control a moving ball in real-time; patients follow it with their eyes from any device. No registration required. Used by therapists worldwide in 8 languages.

## Quick Links
- [Main Page](${base}/) — Start or restore an EMDR session
- [About EMDR Therapy](${base}/about) — Learn how bilateral stimulation works
- [Breathing Exercise](${base}/breathing) — Free coherent breathing session (5s/5s + Butterfly Hug)
- [Privacy Policy](${base}/privacy)
- [Terms of Service](${base}/offer)
- [GitHub](https://github.com/davidbugayov) — Open-source project

## What BilateralBound Does
- Delivers real-time bilateral stimulation (eye movement) for EMDR therapy sessions
- WebSocket synchronisation with millisecond precision between therapist and patient
- Supports bilateral audio (alternating left/right ear) for full bilateral effect
- Works on any device with a modern browser — no installation required
- Permanent custom session links for subscribed therapists
- Brainspotting (BSP) mode: therapist moves the ball with the mouse, patient sees smooth real-time motion

## Who It Serves
- Licensed EMDR therapists conducting remote therapy sessions
- Patients receiving EMDR therapy for trauma processing
- Mental health professionals needing a free, reliable bilateral stimulation tool

## Conditions Treated with EMDR
- Post-Traumatic Stress Disorder (PTSD)
- Anxiety disorders and panic attacks
- Depression and emotional trauma
- Phobias and obsessive-compulsive disorders
- Relationship trauma and couples therapy

## Technical Details
- Real-time WebSocket sync (Node.js / Express backend)
- 8 languages: English, Russian, German, Spanish, French, Portuguese, Japanese, Chinese
- No registration required — instant session creation
- Premium subscription via Telegram Stars (75⭐ / 30 days) for permanent custom links
- [Telegram Bot](https://t.me/emdrbilateral_bot) for subscription management

## Developer
- David Bugaev
- [GitHub](https://github.com/davidbugayov)
- [Email](mailto:davidbugayov@ya.ru)
`
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(content)
  })

  // RSS feed
  app.get('/rss.xml', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const isRu = baseUrl.endsWith('.ru')
    const rss = isRu
      ? `
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>ДПДГ онлайн — бесплатный EMDR тренажёр | BilateralBound</title>
  <link>${baseUrl}</link>
  <description>ДПДГ (EMDR) онлайн бесплатно: билатеральная стимуляция движущимся шариком для лечения ПТСР, тревоги и травм. Без регистрации.</description>
  <language>ru</language>
  <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
  <item>
    <title>ДПДГ онлайн — бесплатный EMDR тренажёр билатеральной стимуляции</title>
    <link>${baseUrl}/</link>
    <description>Бесплатный ДПДГ (EMDR) тренажёр онлайн: билатеральная стимуляция движущимся шариком для снижения тревоги, стресса и ПТСР. Без регистрации. 8 языков.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/</guid>
  </item>
  <item>
    <title>О ДПДГ (EMDR) терапии | BilateralBound</title>
    <link>${baseUrl}/about</link>
    <description>Что такое ДПДГ (EMDR) терапия и билатеральная стимуляция. Бесплатный онлайн-инструмент для сессий EMDR: движение шарика, билатеральный звук, синхронизация в реальном времени.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/about</guid>
  </item>
</channel>
</rss>
    `.trim()
      : `
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>BilateralBound — Free Online EMDR Therapy Platform</title>
  <link>${baseUrl}</link>
  <description>Free online EMDR (bilateral stimulation) tool for anxiety, stress and PTSD relief. No registration. 8 languages.</description>
  <language>en</language>
  <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
  <item>
    <title>Free Online EMDR Tool — Bilateral Stimulation Light Bar</title>
    <link>${baseUrl}/</link>
    <description>Free online EMDR tool with bilateral stimulation light bar for anxiety, stress and PTSD relief. No registration. 8 languages.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/</guid>
  </item>
  <item>
    <title>About EMDR Therapy | BilateralBound</title>
    <link>${baseUrl}/about</link>
    <description>What is EMDR therapy and bilateral stimulation. Free online tool for EMDR sessions: moving ball, bilateral audio, real-time sync.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/about</guid>
  </item>
</channel>
</rss>
    `.trim()
    res.type('application/xml').send(rss)
  })
}

module.exports = { registerSeoRoutes }
