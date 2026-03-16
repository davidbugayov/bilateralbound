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
    html = this._injectCanonicalHreflang(html, req.get('host') || '')
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
   * Replaces meta tags in HTML with localized values.
   * @param {string} html - Raw HTML string
   * @param {string} lang - Language code
   * @param {Object} locale - Parsed locale object
   * @param {Array} metaMap - Meta tag mapping array
   * @returns {string} Localized HTML
   */
  _localizeHtml(html, lang, locale, metaMap) {
    let result = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)

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

    return result
  }

  /**
   * Replaces canonical URL, injects hreflang tags, and fixes domain-specific
   * meta tags based on the request host.
   * @param {string} html - HTML string
   * @param {string} host - Request host header
   * @returns {string} HTML with canonical/hreflang injected
   */
  _injectCanonicalHreflang(html, host) {
    const isRu = (host || '').endsWith('.ru')
    const ruBase = 'https://emdrbilateral.ru'
    const onlineBase = 'https://emdrbilateral.online'
    const base = isRu ? ruBase : onlineBase
    const canonicalUrl = `${base}/`

    html = html.replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      `<link rel="canonical" href="${canonicalUrl}" />`
    )

    const hreflang = [
      `<link rel="alternate" hreflang="ru" href="${ruBase}/" />`,
      `<link rel="alternate" hreflang="en" href="${onlineBase}/" />`,
      `<link rel="alternate" hreflang="de" href="${onlineBase}/?lang=de" />`,
      `<link rel="alternate" hreflang="es" href="${onlineBase}/?lang=es" />`,
      `<link rel="alternate" hreflang="fr" href="${onlineBase}/?lang=fr" />`,
      `<link rel="alternate" hreflang="pt" href="${onlineBase}/?lang=pt" />`,
      `<link rel="alternate" hreflang="ja" href="${onlineBase}/?lang=ja" />`,
      `<link rel="alternate" hreflang="zh" href="${onlineBase}/?lang=zh" />`,
      `<link rel="alternate" hreflang="x-default" href="${onlineBase}/" />`
    ].join('\n    ')

    html = html.replace(
      /(<link rel="canonical"[^>]*\/>)/,
      `$1\n    ${hreflang}`
    )

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

    return html
  }

  /**
   * Pre-renders localized HTML for all languages at startup.
   * Reads HTML templates and package.json version, then populates _htmlCache.
   */
  _buildHtmlCache() {
    const cachedViewerHtml = fs.readFileSync(
      path.join(this._publicPath, 'viewer.html'),
      'utf8'
    )
    const cachedControllerHtml = fs.readFileSync(
      path.join(this._publicPath, 'session-controller.html'),
      'utf8'
    )

    // Read version from package.json for index.html injection
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
    const cachedIndexHtml = fs
      .readFileSync(path.join(this._publicPath, 'index.html'), 'utf8')
      .replace(
        /⚡ BilateralBound v[\d.]+/,
        `⚡ BilateralBound v${appVersion}`
      )

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
