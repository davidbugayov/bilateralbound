/* eslint-disable no-undef */
/* global self, caches, fetch, URL */
'use strict';
/**
 * Service Worker for BilateralBound
 * Provides offline support and caching
 */

const CACHE_NAME = 'bilateralbound-v3-2.39.496';
const CACHE_VERSION = '2.39.496';
const STATIC_ASSETS = [
  '/',
  '/index.html?v=' + CACHE_VERSION,
  '/session-controller.html?v=' + CACHE_VERSION,
  '/viewer.html?v=' + CACHE_VERSION,
  '/css/common.css?v=' + CACHE_VERSION,
  '/css/controller.css?v=' + CACHE_VERSION,
  '/css/main-page.css?v=' + CACHE_VERSION,
  '/css/session-controller.css?v=' + CACHE_VERSION,
  '/css/viewer.css?v=' + CACHE_VERSION,
  '/css/shared-components.css?v=' + CACHE_VERSION,
  '/js/physics-engine.js?v=' + CACHE_VERSION,
  '/js/renderer.js?v=' + CACHE_VERSION,
  '/js/common.js?v=' + CACHE_VERSION,
  '/js/shared-components.js?v=' + CACHE_VERSION,
  '/js/i18n/i18n.js?v=' + CACHE_VERSION,
  '/js/i18n/lang-preload.js?v=' + CACHE_VERSION,
  '/js/i18n/language-selector.js?v=' + CACHE_VERSION,
  '/locales/en/common.json?v=' + CACHE_VERSION,
  '/locales/ru/common.json?v=' + CACHE_VERSION,
  '/locales/de/common.json?v=' + CACHE_VERSION,
  '/locales/es/common.json?v=' + CACHE_VERSION,
  '/locales/fr/common.json?v=' + CACHE_VERSION,
  '/locales/pt/common.json?v=' + CACHE_VERSION,
  '/locales/ja/common.json?v=' + CACHE_VERSION,
  '/locales/zh/common.json?v=' + CACHE_VERSION,
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Cache failed:', err)),
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // BYPASS Third-Party Fonts: let the browser handle them directly to avoid CSP issues in SW context
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    return;
  }

  // For static assets: cache first
  if (
    STATIC_ASSETS.some(
      (asset) => url.pathname === asset || url.pathname.endsWith(asset),
    )
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(request, clone));
              return response;
            }
            // Non-OK (e.g. 503 during deployment) — serve any cached version as fallback
            return caches
              .match(request, { ignoreSearch: true })
              .then((fallback) => fallback || response);
          })
          .catch(() => caches.match(request, { ignoreSearch: true }));
      }),
    );
    return;
  }

  // For other requests: network first, cache fallback
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          }
          // Non-OK — serve any cached version as fallback
          return caches
            .match(request, { ignoreSearch: true })
            .then((fallback) => fallback || response);
        })
        .catch(async () => {
           const cached = await caches.match(request, { ignoreSearch: true });
           if (cached) return cached;
           // If we have nothing, throw so the browser handles it naturally, 
           // but respondWith must receive a promise that resolves to a Response.
           // For non-essential assets, we can return a generic error response.
           return new Response('Network error', { status: 408, headers: { 'Content-Type': 'text/plain' } });
        }),
    );
});
