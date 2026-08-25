/* jshint node: true, esversion: 11, strict: true */
'use strict'

const path = require('node:path')
const fs = require('node:fs')

const SUPPORTED_LANGS = ['en', 'ru', 'de', 'es', 'fr', 'pt', 'ja', 'zh']

const viewerMetaMap = [
  { isTitle: true, key: 'viewer.title' },
  { attr: 'name', attrValue: 'description', key: 'viewer.description' },
  { attr: 'property', attrValue: 'og:title', key: 'viewer.title' },
  {
    attr: 'property',
    attrValue: 'og:description',
    key: 'viewer.description'
  }
]

const controllerMetaMap = [
  { isTitle: true, key: 'controller.meta.controllerTitle' },
  {
    attr: 'name',
    attrValue: 'description',
    key: 'controller.meta.controllerDescription'
  },
  {
    attr: 'property',
    attrValue: 'og:title',
    key: 'controller.meta.controllerTitle'
  },
  {
    attr: 'property',
    attrValue: 'og:description',
    key: 'controller.meta.controllerDescription'
  },
  {
    attr: 'name',
    attrValue: 'twitter:title',
    key: 'controller.meta.controllerTitle'
  },
  {
    attr: 'name',
    attrValue: 'twitter:description',
    key: 'controller.meta.controllerDescription'
  }
]

const indexMetaMap = [
  { isTitle: true, key: 'home.pageTitle' },
  { attr: 'name', attrValue: 'description', key: 'home.metaDescription' },
  { attr: 'name', attrValue: 'keywords', key: 'home.metaKeywords' },
  { attr: 'property', attrValue: 'og:title', key: 'home.pageTitle' },
  {
    attr: 'property',
    attrValue: 'og:description',
    key: 'home.metaDescription'
  },
  { attr: 'name', attrValue: 'twitter:title', key: 'home.pageTitle' },
  {
    attr: 'name',
    attrValue: 'twitter:description',
    key: 'home.metaDescription'
  }
]

// Static pages served through LocalizationService: file → meta map
const staticMetaMaps = {
  'about.html': [
    { isTitle: true, key: 'about.metaTitle' },
    { attr: 'name', attrValue: 'description', key: 'about.metaDescription' }
  ],
  'privacy.html': [
    { isTitle: true, key: 'privacy.metaTitle' },
    { attr: 'name', attrValue: 'description', key: 'privacy.metaDescription' }
  ],
  'offer.html': [
    { isTitle: true, key: 'offer.metaTitle' },
    { attr: 'name', attrValue: 'description', key: 'offer.metaDescription' }
  ],
  'breathing.html': [
    // Breathing is a standalone CalmFlow page — title stays hardcoded
    {
      attr: 'name',
      attrValue: 'description',
      key: 'breathing.metaDescription'
    }
  ],
  'paywall.html': [
    // Subscription gate page — title and description localized via i18n keys
    { isTitle: true, key: 'paywall.title' },
    { attr: 'name', attrValue: 'description', key: 'paywall.description' }
  ]
}

class LocalizationService {
  /**
   * @param {Object} config - Application config (unused for now, kept for interface consistency)
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger) {
    this._config = config
    this._logger = logger
    this._publicPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'web-client',
      'public'
    )
    this._locales = this._loadLocales(this._publicPath)
    this._htmlCache = new Map()
    this._buildHtmlCache()
  }

  /**
   * Returns localized HTML for the given page type.
   * @param {'viewer'|'controller'|'index'} type - Page type
   * @param {Object} req - Express request object
   * @param {Object|null} session - Session object (may be null)
   * @returns {string} Localized HTML with canonical/hreflang injected
   */
  getLocalizedHtml(type, req, session) {
    const lang = this.detectLanguage(req, session)
    let html =
      this._htmlCache.get(`${type}_${lang}`) ||
      this._htmlCache.get(`${type}_en`)
    html = this._injectCanonicalHreflang(
      html,
      req.get('host') || '',
      req.path || '/'
    )
    return html
  }

  /**
   * Returns localized HTML for a static page (about, privacy, offer, breathing).
   * Reads the file fresh (no cache), localizes meta tags and injects
   * canonical/hreflang based on the request host and path.
   * @param {string} fileName - HTML file name inside web-client/public
   * @param {Object} req - Express request object
   * @returns {string} Localized HTML
   */
  getStaticLocalizedHtml(fileName, req) {
    const metaMap = staticMetaMaps[fileName]
    if (!metaMap) {
      this._logger.warn(`No meta map for static page: ${fileName}`)
      return null
    }
    const lang = this.detectLanguage(req, null)
    const locale = this._locales.get(lang) || this._locales.get('en')
    let html = fs.readFileSync(path.join(this._publicPath, fileName), 'utf8')
    html = this._localizeHtml(html, lang, locale, metaMap)
    html = this._injectCanonicalHreflang(
      html,
      req.get('host') || '',
      req.path || '/'
    )
    return html
  }

  /**
   * Detects language from request: ?lang= > session.language > domain > 'en'
   * @param {Object} req - Express request object
   * @param {Object|null} session - Session object
   * @returns {string} Language code
   */
  detectLanguage(req, session) {
    // 1. Explicit query param
    const queryLang = req.query.lang
    if (queryLang && SUPPORTED_LANGS.includes(queryLang)) return queryLang

    // 2. Session language (set by controller)
    if (session?.language && SUPPORTED_LANGS.includes(session.language))
      return session.language

    // 3. Domain-based: .ru → ru, everything else → en
    const host = req.get('host') || ''
    if (host.endsWith('.ru')) return 'ru'

    return 'en'
  }

  /**
   * Loads all locale JSON files from disk.
   * @param {string} publicPath - Path to web-client/public
   * @returns {Map<string, Object>} Map of lang → parsed JSON
   */
  _loadLocales(publicPath) {
    const locales = new Map()
    for (const lang of SUPPORTED_LANGS) {
      const filePath = path.join(publicPath, 'locales', lang, 'common.json')
      try {
        locales.set(lang, JSON.parse(fs.readFileSync(filePath, 'utf8')))
      } catch (e) {
        this._logger.error(`Failed to load locale ${lang}: ${e.message}`)
      }
    }
    return locales
  }

  /**
   * Resolves nested key like "viewer.title" from locale object.
   * @param {Object} locale - Parsed locale JSON
   * @param {string} key - Dot-separated key
   * @returns {*} Resolved value or undefined
   */
  _getLocaleValue(locale, key) {
    return key.split('.').reduce((obj, k) => obj?.[k], locale)
  }

  /**
   * Replaces the inner content of every element with a data-i18n="key"
   * attribute using the value from the locale (same semantics as the
   * client-side i18n.applyTranslations: full innerHTML replacement).
   * Elements nested inside an already-translated parent are skipped.
   * @param {string} html - Raw HTML string
   * @param {Object} locale - Parsed locale object
   * @returns {string} HTML with localized content
   */
  _localizeContent(html, locale) {
    const VOID_TAGS = new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr'
    ])
    const tagRe = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*?)?)(\/?)>/g
    const stack = []
    const candidates = []
    let m

    while ((m = tagRe.exec(html)) !== null) {
      const isClose = !!m[1]
      const tag = m[2].toLowerCase()
      const attrs = m[3] || ''
      const selfClosing = m[4] === '/'

      // Skip script/style bodies entirely — they may contain '<' and '>'
      if ((tag === 'script' || tag === 'style') && !isClose) {
        const closeIdx = html.indexOf(`</${tag}`, m.index + m[0].length)
        if (closeIdx !== -1) {
          tagRe.lastIndex = closeIdx + `</${tag}>`.length
        }
        continue
      }

      if (isClose) {
        let idx = -1
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            idx = i
            break
          }
        }
        if (idx !== -1) {
          const open = stack[idx]
          if (open.dataI18n) {
            candidates.push({
              innerStart: open.openEnd,
              innerEnd: m.index,
              key: open.dataI18n
            })
          }
          stack.splice(idx)
        }
        continue
      }

      if (VOID_TAGS.has(tag) || selfClosing) continue

      const di18n = attrs.match(/data-i18n="([^"]*)"/)
      stack.push({
        tag,
        openEnd: m.index + m[0].length,
        dataI18n: di18n ? di18n[1] : null
      })
    }

    // Apply from outermost to innermost; nested elements inside an already
    // replaced parent are skipped via the cursor check.
    candidates.sort((a, b) => a.innerStart - b.innerStart)
    let out = ''
    let cursor = 0
    for (const c of candidates) {
      if (c.innerStart < cursor) continue
      const value = this._getLocaleValue(locale, c.key)
      if (typeof value === 'string' && value.length > 0) {
        out += html.slice(cursor, c.innerStart) + value
        cursor = c.innerEnd
      }
    }
    out += html.slice(cursor)
    return out
  }

  /**
   * Replaces meta tags in HTML with localized values and marks the page as
   * server-rendered (data-i18n-rendered) so client cloak scripts don't hide
   * content that is already localized.
   * @param {string} html - Raw HTML string
   * @param {string} lang - Language code
   * @param {Object} locale - Parsed locale object
   * @param {Array} metaMap - Meta tag mapping array
   * @returns {string} Localized HTML
   */
  _localizeHtml(html, lang, locale, metaMap) {
    let result = html
      .replace(
        /<html lang="[^"]*"/,
        `<html lang="${lang}" data-i18n-rendered="true"`
      )
      // Sync data-lang on the <html> element only (some templates have
      // <html lang="en" data-lang="en">). Must NOT touch data-lang on other
      // elements — language selector options use data-lang="en"/"ru"/etc.
      .replace(/(<html[^>]*\bdata-lang=")[^"]*"/, `$1${lang}"`)

    // Match each <meta ... /> or <meta ... > tag
    result = result.replace(/<meta\b[^>]*?\/?>/g, (tag) => {
      for (const entry of metaMap) {
        if (entry.isTitle) continue
        const attrPattern = new RegExp(
          `${entry.attr}=["']${entry.attrValue}["']`
        )
        if (!attrPattern.test(tag)) continue

        const value = this._getLocaleValue(locale, entry.key)
        if (value) {
          const escaped = value.replace(/"/g, '&quot;')
          return tag.replace(/content="[^"]*"/, `content="${escaped}"`)
        }
      }
      return tag
    })

    // Replace <title>...</title>
    const titleEntry = metaMap.find((m) => m.isTitle)
    if (titleEntry) {
      const titleValue = this._getLocaleValue(locale, titleEntry.key)
      if (titleValue) {
        result = result.replace(
          /<title[^>]*>[^<]*<\/title>/,
          `<title data-i18n="${titleEntry.key}">${titleValue}</title>`
        )
      }
    }

    // Localize body content (elements with data-i18n attributes)
    result = this._localizeContent(result, locale)

    return result
  }

  /**
   * Replaces canonical URL, injects hreflang tags, and fixes domain-specific
   * meta tags based on the request host.
   * @param {string} html - HTML string
   * @param {string} host - Request host header
   * @returns {string} HTML with canonical/hreflang injected
   */
  _injectCanonicalHreflang(html, host, path = '/') {
    const isRu = (host || '').endsWith('.ru')
    const ruBase = 'https://emdrbilateral.ru'
    const onlineBase = 'https://emdrbilateral.online'
    const base = isRu ? ruBase : onlineBase
    const canonicalUrl = `${base}${path}`

    const hreflang = [
      `<link rel="alternate" hreflang="ru" href="${ruBase}${path}" />`,
      `<link rel="alternate" hreflang="en" href="${onlineBase}${path}" />`,
      `<link rel="alternate" hreflang="de" href="${onlineBase}${path}?lang=de" />`,
      `<link rel="alternate" hreflang="es" href="${onlineBase}${path}?lang=es" />`,
      `<link rel="alternate" hreflang="fr" href="${onlineBase}${path}?lang=fr" />`,
      `<link rel="alternate" hreflang="pt" href="${onlineBase}${path}?lang=pt" />`,
      `<link rel="alternate" hreflang="ja" href="${onlineBase}${path}?lang=ja" />`,
      `<link rel="alternate" hreflang="zh" href="${onlineBase}${path}?lang=zh" />`,
      `<link rel="alternate" hreflang="x-default" href="${onlineBase}${path}" />`
    ].join('\n    ')

    const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`
    if (/<link rel="canonical"[^>]*\/>/.test(html)) {
      html = html.replace(/<link rel="canonical"[^>]*\/>/, canonicalTag)
      html = html.replace(
        /(<link rel="canonical"[^>]*\/>)/,
        `$1\n    ${hreflang}`
      )
    } else {
      // No canonical yet — insert canonical + hreflang right after <head>
      html = html.replace(
        /<head[^>]*>/,
        `$&\n    ${canonicalTag}\n    ${hreflang}`
      )
    }

    // Fix og:url
    html = html.replace(
      /(<meta property="og:url" content=")[^"]*(")/,
      `$1${canonicalUrl}$2`
    )

    // Fix og:image (preserve path+query after domain)
    html = html.replace(
      /(<meta property="og:image" content=")https:\/\/emdrbilateral\.(ru|online)([^"]*")/,
      `$1${base}$3`
    )

    // Fix twitter:image
    html = html.replace(
      /(<meta name="twitter:image" content=")https:\/\/emdrbilateral\.(ru|online)([^"]*")/,
      `$1${base}$3`
    )

    // Fix og:locale
    html = html.replace(
      /(<meta property="og:locale" content=")[^"]*(")/,
      `$1${isRu ? 'ru_RU' : 'en_US'}$2`
    )

    // Add og:locale:alternate for all other languages
    const allLocales = [
      'ru_RU',
      'en_US',
      'de_DE',
      'es_ES',
      'fr_FR',
      'pt_PT',
      'ja_JP',
      'zh_CN'
    ]
    const currentLocale = isRu ? 'ru_RU' : 'en_US'
    const alternateLocales = allLocales.filter((l) => l !== currentLocale)
    const alternateMetaTags = alternateLocales
      .map(
        (loc) => `    <meta property="og:locale:alternate" content="${loc}" />`
      )
      .join('\n')
    html = html.replace(
      /(<meta property="og:locale"[^>]*>)/,
      `$1\n${alternateMetaTags}`
    )

    // Fix og:title and twitter:title for .ru (static HTML defaults to English)
    if (isRu) {
      const ruTitle =
        'ДПДГ онлайн — бесплатный EMDR тренажёр билатеральной стимуляции | BilateralBound'
      const ruDesc =
        'ДПДГ онлайн бесплатно: EMDR тренажёр с билатеральной стимуляцией движущимся шариком для снижения тревоги, стресса и ПТСР. Без регистрации. Начните сессию за 2 минуты.'
      html = html.replace(
        /(<meta property="og:title"[^>]*content=")[^"]*(")/,
        `$1${ruTitle}$2`
      )
      html = html.replace(
        /(<meta property="og:description"[^>]*content=")[^"]*(")/,
        `$1${ruDesc}$2`
      )
      html = html.replace(
        /(<meta name="twitter:title"[^>]*content=")[^"]*(")/,
        `$1${ruTitle}$2`
      )
      html = html.replace(
        /(<meta name="twitter:description"[^>]*content=")[^"]*(")/,
        `$1${ruDesc}$2`
      )
    }

    // Fix preconnect link (domain-specific, not fonts)
    html = html.replace(
      /(<link\s+rel="preconnect"\s+href=")https:\/\/emdrbilateral\.(ru|online)("[^>]*>)/,
      `$1${base}$3`
    )

    // Fix JSON-LD: replace wrong domain URLs in ld+json script blocks
    const wrongBase = isRu ? onlineBase : ruBase
    html = html.replace(
      /(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g,
      (block) => block.split(wrongBase).join(base)
    )

    // Localize JSON-LD content for .ru: replace English names/descriptions
    // with Russian equivalents so search engines index Russian structured data
    if (isRu) {
      html = html.replace(
        /(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g,
        (block) => {
          return block
            .replace(
              /"alternateName":\s*"Free Online EMDR Tool — Bilateral Stimulation Light Bar"/,
              '"alternateName": "ДПДГ онлайн — бесплатный EMDR тренажёр билатеральной стимуляции"'
            )
            .replace(
              /"description":\s*"Free online EMDR tool with bilateral stimulation light bar for anxiety, stress and PTSD relief\. No registration\. 8 languages\."/,
              '"description": "Бесплатный ДПДГ (EMDR) тренажёр онлайн: билатеральная стимуляция движущимся шариком для снижения тревоги, стресса и ПТСР. Без регистрации. 8 языков."'
            )
            .replace(
              /"Real-time bilateral stimulation light bar"/,
              '"Билатеральная стимуляция в реальном времени"'
            )
            .replace(
              /"Moving ball EMDR tool"/,
              '"EMDR тренажёр с движущимся шариком"'
            )
            .replace(/"Remote EMDR sessions"/, '"Удалённые EMDR сессии"')
            .replace(/"Bilateral audio"/, '"Билатеральный звук"')
            .replace(
              /"Permanent session links"/,
              '"Постоянные ссылки на сессии"'
            )
            .replace(/"No registration"/, '"Без регистрации"')
            .replace(/"Free EMDR online"/, '"Бесплатный EMDR онлайн"')
            .replace(/"8 languages"/, '"8 языков"')
            .replace(
              /"name":\s*"What is EMDR therapy\?"/,
              '"name": "Что такое EMDR (ДПДГ) терапия?"'
            )
            .replace(
              /"text":\s*"EMDR \(Eye Movement Desensitization and Reprocessing\) is an evidence-based psychotherapy[^"]*"/,
              '"text": "EMDR (ДПДГ — десенсибилизация и переработка движениями глаз) — научно обоснованный метод психотерапии, использующий билатеральную стимуляцию для переработки травматических воспоминаний. Признан ВОЗ и APA для лечения ПТСР."'
            )
            .replace(
              /"name":\s*"How does BilateralBound work\?"/,
              '"name": "Как работает BilateralBound?"'
            )
            .replace(
              /"text":\s*"The therapist creates a session[^"]*"/,
              '"text": "Терапевт создаёт сессию и отправляет ссылку пациенту. Терапевт управляет движущимся шариком в реальном времени — пациент следит за ним глазами. Установка не требуется."'
            )
            .replace(
              /"name":\s*"Is BilateralBound free\?"/,
              '"name": "BilateralBound бесплатный?"'
            )
            .replace(
              /"text":\s*"Yes, completely free for therapists[^"]*"/,
              '"text": "Да, полностью бесплатно для терапевтов и пациентов по всему миру. Без регистрации, подписки и ограничений по времени."'
            )
            .replace(
              /"name":\s*"Does EMDR work online\?"/,
              '"name": "Работает ли EMDR онлайн?"'
            )
            .replace(
              /"text":\s*"Yes\. BilateralBound delivers[^"]*"/,
              '"text": "Да. BilateralBound обеспечивает билатеральную стимуляцию в реальном времени через WebSocket с миллисекундной точностью."'
            )
            .replace(
              /"name":\s*"What conditions does EMDR treat\?"/,
              '"name": "Какие состояния лечит EMDR?"'
            )
            .replace(
              /"text":\s*"EMDR treats PTSD, anxiety[^"]*"/,
              '"text": "EMDR лечит ПТСР, тревожные расстройства, депрессию, фобии, ОКР и травмы. Также применяется в парной терапии."'
            )
            .replace(
              /"name":\s*"Does the therapist need special training\?"/,
              '"name": "Нужна ли терапевту специальная подготовка?"'
            )
            .replace(
              /"text":\s*"Yes\. EMDR should only be conducted[^"]*"/,
              '"text": "Да. EMDR должны проводить только квалифицированные специалисты, прошедшие обучение EMDR. BilateralBound предоставляет инструмент — клиническая ответственность остаётся за терапевтом."'
            )
            .replace(/"name":\s*"Home"/, '"name": "Главная"')
        }
      )
    }

    return html
  }

  /**
   * Pre-renders localized HTML for all languages at startup.
   * Reads HTML templates and package.json version, then populates _htmlCache.
   */
  _buildHtmlCache() {
    let cachedViewerHtml = fs.readFileSync(
      path.join(this._publicPath, 'viewer.html'),
      'utf8'
    )
    let cachedControllerHtml = fs.readFileSync(
      path.join(this._publicPath, 'session-controller.html'),
      'utf8'
    )
    let cachedIndexHtml = fs.readFileSync(
      path.join(this._publicPath, 'index.html'),
      'utf8'
    )

    // Read version from package.json
    const packageJsonPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'package.json'
    )
    const appVersion = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8')
    ).version

    // DYNAMIC CACHE-BUSTING: Replace all ?v=... hardcoded strings in all templates
    // Match anything after ?v= until a quote or space.
    const versionRegex = /\?v=[a-zA-Z0-9.\-_]+/g
    const newVersionStr = `?v=${appVersion}`

    cachedViewerHtml = cachedViewerHtml.replace(versionRegex, newVersionStr)
    cachedControllerHtml = cachedControllerHtml.replace(
      versionRegex,
      newVersionStr
    )
    cachedIndexHtml = cachedIndexHtml
      .replace(/⚡ BilateralBound v[\d.]+/, `⚡ BilateralBound v${appVersion}`)
      .replace(versionRegex, newVersionStr)

    // Build per-language HTML cache
    for (const lang of SUPPORTED_LANGS) {
      const locale = this._locales.get(lang) || this._locales.get('en')
      this._htmlCache.set(
        `viewer_${lang}`,
        this._localizeHtml(cachedViewerHtml, lang, locale, viewerMetaMap)
      )
      this._htmlCache.set(
        `controller_${lang}`,
        this._localizeHtml(
          cachedControllerHtml,
          lang,
          locale,
          controllerMetaMap
        )
      )
      this._htmlCache.set(
        `index_${lang}`,
        this._localizeHtml(cachedIndexHtml, lang, locale, indexMetaMap)
      )
    }
  }
}

// Expose for external use if needed
LocalizationService.SUPPORTED_LANGS = SUPPORTED_LANGS

module.exports = LocalizationService
