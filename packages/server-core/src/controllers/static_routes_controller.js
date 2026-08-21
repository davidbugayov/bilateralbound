'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

function registerStaticRoutes(
  app,
  sessionService,
  localizationService,
  { setNoCacheHeaders, logger },
  linkAccessService,
  subscriptionService,
  wsTokenService,
) {
  const publicPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'web-client',
    'public',
  );

  const BROWSER_COOKIE = 'bb_lk';
  const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year
  const FREE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours free access from first visit

  /**
   * Generates a random browser ID for the cookie.
   * @returns {string}
   */
  function generateBrowserId() {
    return crypto.randomUUID();
  }

  /**
   * Issues the bb_lk cookie if not already present.
   * Mutates res — sets cookie and returns the browserId.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {string} browserId (existing or newly generated)
   */
  function ensureBrowserCookie(req, res) {
    let browserId = req.cookies && req.cookies[BROWSER_COOKIE];
    if (!browserId) {
      browserId = generateBrowserId();
      res.cookie(BROWSER_COOKIE, browserId, {
        httpOnly: true,
        secure: !req.app.get('isDev'),
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE_MS,
      });
    }
    return browserId;
  }

  /**
   * Decides whether the current browser is allowed access to the session page.
   * Side-effects: may issue cookie and record first visit.
   * @returns {boolean} true = allow (serve content), false = deny (show paywall)
   */
  function decideAccess(req, res, sessionId) {
    const session = sessionService.getSession(sessionId);
    // Non-existent session — don't gate, let existing behaviour handle it
    if (!session) {
      return true;
    }

    // Owner of this link has an active subscription — bypass gating
    if (
      subscriptionService &&
      subscriptionService.isCustomIdAllowed(sessionId)
    ) {
      return true;
    }

    const browserId = ensureBrowserCookie(req, res);
    const now = Date.now();

    // Already unlocked — allow and set sub_active cookie for the badge
    if (linkAccessService.isUnlocked(browserId, sessionId, now)) {
      const laState = linkAccessService.get(browserId, sessionId);
      if (laState.unlockedUntil && laState.unlockedUntil > now) {
        res.cookie('sub_active', String(laState.unlockedUntil), {
          httpOnly: false,
          secure: !req.app.get('isDev'),
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE_MS,
        });
      }
      return true;
    }

    const state = linkAccessService.get(browserId, sessionId);

    // First visit — record and allow
    if (!state.firstSeenAt) {
      linkAccessService.markSeen(browserId, sessionId);
      return true;
    }

    // Within free 2-hour window — allow unlimited access
    if (now - state.firstSeenAt < FREE_WINDOW_MS) {
      return true;
    }

    // Window expired without unlock — deny
    return false;
  }

  /**
   * Injects the paywall overlay script into the content HTML.
   * The ball/content stays visible; a modal dialog is shown on top.
   * @param {string} html - Content page HTML
   * @returns {string} HTML with overlay script injected before </body>
   */
  function injectPaywallOverlay(html) {
    const overlayScript =
      '<script src="/js/paywall-overlay.js?v=' +
      (process.env.npm_package_version || '1') +
      '" defer></script>';
    if (html.includes('</body>')) {
      return html.replace('</body>', overlayScript + '\n</body>');
    }
    return html + overlayScript;
  }

  /**
   * Injects a WS auth token into the HTML before </head>.
   * The frontend reads window.__WS_TOKEN__ and sends it as ?token= query param on WS connect.
   * @param {string} html - Content page HTML
   * @param {string} sessionId
   * @param {'controller'|'viewer'} role
   * @returns {string} HTML with token script injected
   */
  function injectWsToken(html, sessionId, role) {
    if (!wsTokenService) return html;
    const token = wsTokenService.generate(sessionId, role);
    const tokenScript = `<script>window.__WS_TOKEN__ = "${token}";</script>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', tokenScript + '\n</head>');
    }
    return tokenScript + html;
  }

  // Root route - serve cached index.html with localized meta tags (from expressApp L456-463)
  app.get('/', (req, res) => {
    const html = localizationService.getLocalizedHtml('index', req, null);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCacheHeaders(res);
    res.send(html);
  });

  // Static files - only serve specific paths (from expressApp L617-631)
  // Assets use ?v=version query params → safe for immutable long-term cache
  const staticDirectories = [
    'css',
    'js',
    'dist',
    'emdr-therapy',
    'fonts',
    'sounds',
  ];
  for (const dir of staticDirectories) {
    app.use(
      `/${dir}`,
      express.static(path.join(publicPath, dir), {
        etag: true,
        lastModified: true,
        setHeaders: (res) => {
          if (dir === 'dist') {
            res.setHeader(
              'Cache-Control',
              'no-cache, no-store, must-revalidate',
            );
          } else {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable',
            );
          }
        },
      }),
    );
  }

  // Privacy page — localized meta + canonical/hreflang via LocalizationService
  // MUST be registered BEFORE the catch-all static middleware below,
  // otherwise express.static serves privacy.html raw (adding .html automatically).
  app.get('/privacy', (req, res) => {
    const html = localizationService.getStaticLocalizedHtml(
      'privacy.html',
      req,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCacheHeaders(res);
    res.send(html);
  });

  // Public offer page — localized meta + canonical/hreflang via LocalizationService
  app.get('/offer', (req, res) => {
    const html = localizationService.getStaticLocalizedHtml('offer.html', req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCacheHeaders(res);
    res.send(html);
  });

  // Breathing session page (CalmFlow coherent breathing)
  // No-cache: Telegram Mini App aggressively caches HTML
  app.get('/breathing', (req, res) => {
    setNoCacheHeaders(res);
    const html = localizationService.getStaticLocalizedHtml(
      'breathing.html',
      req,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // About page — EMDR therapy information (8 languages, localized meta)
  app.get('/about', (req, res) => {
    const html = localizationService.getStaticLocalizedHtml('about.html', req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCacheHeaders(res);
    res.send(html);
  });

  // 301 redirects from raw .html files to pretty URLs.
  // The .html files are served by express.static WITHOUT localization,
  // so on .ru they expose English meta tags + canonical pointing to .online —
  // Yandex flags these as "pages with missing/incorrect Description".
  // Redirecting consolidates them into the localized routes below.
  const htmlRedirects = {
    '/index.html': '/',
    '/about.html': '/about',
    '/privacy.html': '/privacy',
    '/offer.html': '/offer',
    '/breathing.html': '/breathing',
    '/viewer.html': '/',
    '/session-controller.html': '/',
    '/paywall.html': '/',
  };
  for (const [from, to] of Object.entries(htmlRedirects)) {
    app.get(from, (req, res) => {
      res.redirect(301, to);
    });
  }

  // Viewer HTML (from expressApp L941-949)
  // Gated: first visit free, repeat visits require subscription.
  // On deny: serve the real content page (ball stays visible) with a
  // paywall overlay script injected before </body>.
  app.get('/s/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessionService.findOrCreateSession(sessionId);
    let html = localizationService.getLocalizedHtml('viewer', req, session);
    if (!decideAccess(req, res, sessionId)) {
      html = injectPaywallOverlay(html);
    } else if (
      subscriptionService &&
      subscriptionService.isCustomIdAllowed(sessionId)
    ) {
      const status = subscriptionService.getStatusForCustomId(sessionId);
      if (status && status.expiresAt) {
        res.cookie('sub_active', String(status.expiresAt), {
          httpOnly: false,
          secure: !req.app.get('isDev'),
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });
      }
    }
    html = injectWsToken(html, sessionId, 'viewer');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCacheHeaders(res);
    res.send(html);
  });

  // Controller HTML (from expressApp L950-959)
  // Gated: first visit free, repeat visits require subscription.
  // On deny: serve the real content page with a paywall overlay injected.
  app.get('/c/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessionService.findOrCreateSession(sessionId);
    let html = localizationService.getLocalizedHtml('controller', req, session);
    if (!decideAccess(req, res, sessionId)) {
      html = injectPaywallOverlay(html);
    } else if (
      subscriptionService &&
      subscriptionService.isCustomIdAllowed(sessionId)
    ) {
      // Set sub_active cookie so subscription-badge.js detects it client-side
      const status = subscriptionService.getStatusForCustomId(sessionId);
      if (status && status.expiresAt) {
        res.cookie('sub_active', String(status.expiresAt), {
          httpOnly: false,
          secure: !req.app.get('isDev'),
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000,
        });
      }
    }
    html = injectWsToken(html, sessionId, 'controller');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    setNoCacheHeaders(res);
    res.send(html);
  });

  // Catch-all for other static files (must be AFTER all named routes above,
  // otherwise express.static adds .html extension and serves e.g. privacy.html raw).
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/emdr-therapy/')
    ) {
      return next();
    }

    express.static(publicPath, {
      index: false,
      etag: false,
      lastModified: false,
      setHeaders: setNoCacheHeaders,
    })(req, res, next);
  });

  // 404 handler (from expressApp L1007-1011)
  app.use((req, res) => {
    res
      .status(404)
      .json({ error: 'Not Found', path: req.path, requestId: req.id });
  });

  // Centralized error handler (from expressApp L1013-1021)
  app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    logger.error({ err, requestId: req.id }, `${status} ${message}`);
    res.status(status).json({ error: message, requestId: req.id });
  });
}

module.exports = { registerStaticRoutes };
