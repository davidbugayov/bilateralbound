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
      'Disallow: /',
      '',
      'User-agent: Claude-Web',
      'Disallow: /',
      '',
      'User-agent: Google-Extended',
      'Disallow: /',
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
    const verificationUrls = isRu
      ? [
          '  <url>\n    <loc>https://emdrbilateral.ru/google0a8d78e57c19cb2f.html</loc>\n    <lastmod>2024-07-25</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.1</priority>\n  </url>',
          '  <url>\n    <loc>https://emdrbilateral.ru/yandex_736ad8daf3553b6b.html</loc>\n    <lastmod>2024-07-25</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.1</priority>\n  </url>',
          '  <url>\n    <loc>https://emdrbilateral.ru/yandex_e2cd8b8974eaa9c4.html</loc>\n    <lastmod>2024-07-25</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.1</priority>\n  </url>'
        ].join('\n')
      : ''
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
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
  </url>
${verificationUrls}
</urlset>`
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(xml.trim())
  })

  // RSS feed
  app.get('/rss.xml', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const rss = `
<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>BilateralBound - EMDR Терапия</title>
  <link>${baseUrl}</link>
  <description>Инновационная платформа для EMDR терапии с биодинамической стимуляцией</description>
  <language>ru</language>
  <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml" />
  <item>
    <title>BilateralBound - EMDR терапия для пациентов</title>
    <link>${baseUrl}/</link>
    <description>Профессиональная платформа EMDR терапии с биодинамической стимуляцией для лечения ПТСР, тревоги и травм. Движение шарика создает двустороннюю стимуляцию мозга для переработки травматических воспоминаний.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/</guid>
  </item>
  <item>
    <title>EMDR Терапия для Супружеских Пар | Bilateral Stimulation | Психолог Онлайн</title>
    <link>${baseUrl}/emdr-therapy/</link>
    <description>Профессиональная EMDR терапия для супружеских пар с использованием билатеральной стимуляции. Эффективное лечение травм, ПТСР, конфликтов в отношениях. Онлайн-сессии с сертифицированным психологом.</description>
    <pubDate>Mon, 27 Oct 2025 00:00:00 +0300</pubDate>
    <guid>${baseUrl}/emdr-therapy/</guid>
  </item>
</channel>
</rss>
    `.trim()
    res.type('application/xml').send(rss)
  })
}

module.exports = { registerSeoRoutes }
