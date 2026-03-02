/* eslint-disable no-undef */
/* global self, caches, fetch, URL */
'use strict'
/**
 * Service Worker for BilateralBound
 * Provides offline support and caching
 */

const CACHE_NAME = 'bilateralbound-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/session-controller.html',
  '/viewer.html',
  '/css/main-page.css',
  '/css/session-controller.css',
  '/css/viewer.css',
  '/css/shared-components.css',
  '/js/physics-engine.js',
  '/js/renderer.js',
  '/js/common.js',
  '/js/shared-components.js',
  '/js/i18n/i18n.js',
  '/js/i18n/lang-preload.js',
  '/js/i18n/language-selector.js',
  '/locales/en/common.json',
  '/locales/ru/common.json',
  '/locales/de/common.json',
  '/locales/es/common.json',
  '/locales/fr/common.json',
  '/locales/pt/common.json',
  '/locales/ja/common.json',
  '/locales/zh/common.json'
]

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets')
        return cache.addAll(STATIC_ASSETS)
      })
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('[SW] Cache failed:', err))
  )
})

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests and API calls
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return

  // For static assets: cache first
  if (STATIC_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) return cached
          return fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            }
            return response
          })
        })
    )
    return
  }

  // For other requests: network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
