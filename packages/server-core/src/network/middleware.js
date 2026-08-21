'use strict';
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const express = require('express');
const cookieParser = require('cookie-parser');
const os = require('node:os');
const { v4: uuidv4 } = require('uuid');
const crypto = require('node:crypto');

function getNetworkInterfaces() {
  const interfaces = os.networkInterfaces();
  const result = {};
  for (const key of Object.keys(interfaces)) {
    const iface = interfaces[key].find(
      (alias) => alias.family === 'IPv4' && !alias.internal,
    );
    if (iface) {
      result[key] = iface.address;
    }
  }
  return result;
}

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * CSRF protection using double-submit cookie pattern.
 * Generates a CSRF token cookie and validates the X-CSRF-Token header.
 * Safe for SPA + API architecture without session-based CSRF.
 */
function csrfProtection(req, res, next) {
  // Only protect state-changing methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for health check, analytics, session reserve, and Telegram webhook
  // Use req.baseUrl + req.path — middleware is mounted at /api/, so req.path is relative
  const fullPath = req.baseUrl + req.path;
  if (
    fullPath === '/api/health' ||
    fullPath === '/api/analytics' ||
    fullPath === '/api/subscription/webhook' ||
    fullPath === '/api/subscription/test-activate' ||
    fullPath.includes('/reserve') ||
    fullPath.startsWith('/api/admin/')
  ) {
    return next();
  }

  const token = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.csrfToken;

  // If no cookie token exists, generate one and return 403
  if (!cookieToken) {
    const newToken = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', newToken, {
      httpOnly: false, // Must be readable by JS for double-submit
      secure: !req.app.get('isDev'),
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    return res.status(403).json({
      error: 'CSRF token required',
      requestId: req.id,
    });
  }

  // Validate token match
  if (!token || token !== cookieToken) {
    return res.status(403).json({
      error: 'Invalid CSRF token',
      requestId: req.id,
    });
  }

  next();
}

/**
 * Middleware to set CSRF token cookie (called on initial page load).
 * The frontend reads this cookie and sends it back as X-CSRF-Token header.
 */
function setCsrfCookie(req, res, next) {
  if (!req.cookies?.csrfToken) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', token, {
      httpOnly: false, // Required for double-submit pattern
      secure: !req.app.get('isDev'),
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
  }
  next();
}

function requireSession(sessionService) {
  return (req, res, next) => {
    const { sessionId } = req.params;
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res
        .status(404)
        .json({ error: 'Session not found', requestId: req.id });
    }
    req.session = session;
    next();
  };
}

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function clearStateCache(apiCache, sessionId) {
  apiCache.delete(`state_${sessionId}`);
}

function setupMiddleware(app, config, logger) {
  const networkInterfaces = getNetworkInterfaces();

  // Store isDev flag on app for CSRF cookie
  app.set('isDev', config.isDev);

  // Trust first proxy (nginx) — req.ip will reflect X-Forwarded-For
  app.set('trust proxy', 1);

  // Request ID
  app.use(requestId);

  // Cookie parser MUST come before CSRF cookie middleware
  // (setCsrfCookie reads req.cookies)
  app.use(cookieParser());

  // CSRF cookie on page loads (GET requests for HTML)
  app.use(setCsrfCookie);

  // Network interface IP (from expressApp L246-251)
  app.use((req, res, next) => {
    const interfaceIP = networkInterfaces[Object.keys(networkInterfaces)[0]];
    req.interfaceIP = interfaceIP || '127.0.1';
    next();
  });

  // Helmet (from expressApp L253-288)
  const isDev = config.isDev;
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          styleSrcAttr: ["'self'", "'unsafe-inline'"],
          styleSrcElem: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'self'", "'unsafe-inline'"],
          scriptSrcElem: [
            "'self'",
            "'unsafe-inline'",
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'https://yastatic.net',
          ],
          imgSrc: ["'self'", 'data:', 'https:', 'https://*.mc.yandex.ru'],
          connectSrc: [
            "'self'",
            'wss:',
            'https://mc.yandex.ru',
            'https://mc.yandex.com',
            'wss://mc.yandex.com',
          ],
          frameSrc: [
            "'self'",
            'https://mc.yandex.md',
            'https://web.telegram.org',
            'https://telegram.org',
          ],
          frameAncestors: [
            "'self'",
            'https://web.telegram.org',
            'https://telegram.org',
          ],
          upgradeInsecureRequests: isDev ? null : [],
        },
      },
      // Disabled: nginx sets X-Frame-Options and HSTS — duplicates caused conflicts
      frameguard: false,
      hsts: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Rate limiting (from expressApp L290-302)
  // Dev: higher limits for testing; Prod: strict limits
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isDev ? 500 : 100,
    message: isDev
      ? 'Too many requests from this IP'
      : 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // keyGenerator uses req.ip which, after trust proxy, reflects X-Forwarded-For
    keyGenerator: (req) => req.ip,
  });
  app.use('/api/', apiLimiter);

  // CORS (from expressApp L304-319)
  app.use(
    cors({
      origin: config.cors.origins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Origin',
        'Accept',
        'X-Request-Id',
      ],
      credentials: true,
      optionsSuccessStatus: 200,
    }),
  );

  // Compression
  app.use(compression({ level: 6 }));

  // JSON parser — limit body size to prevent memory exhaustion
  app.use(express.json({ limit: '32kb' }));
}

module.exports = {
  setupMiddleware,
  requireSession,
  setNoCacheHeaders,
  clearStateCache,
  csrfProtection,
  setCsrfCookie,
};
