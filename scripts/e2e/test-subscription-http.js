#!/usr/bin/env node
/**
 * HTTP интеграционный тест подписки — запускает Express сервер локально
 * и тестирует все API эндпоинты через реальные HTTP запросы.
 *
 * Проверяет:
 *   - POST /api/subscription/:customId/check — проверка подписки
 *   - POST /api/subscription/activate-by-telegram — линковка после оплаты
 *   - GET /api/subscription/status/:telegramUserId — статус по Telegram ID
 *   - POST /api/session/:sessionId/reserve — гейтинг (402 Subscription required)
 *   - Cross-computer: другой customId → тот же telegramUserId
 *   - Subscription expiry
 *
 * Запуск: node scripts/e2e/test-subscription-http.js
 */

const express = require('express')
const cookieParser = require('cookie-parser')
const SubscriptionService = require('../../packages/server-core/src/services/SubscriptionService')
const {
  registerSubscriptionRoutes
} = require('../../packages/server-core/src/controllers/subscriptionController')
const {
  registerSessionRoutes
} = require('../../packages/server-core/src/controllers/sessionController')
const fs = require('node:fs')
const path = require('node:path')

// ── Test config ──────────────────────────────────────────────────────────────
const TEST_PORT = 18543
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'tmp-test-data-http')
const TEST_FILE = path.join(TEST_DATA_DIR, 'subscriptions.json')
const SUBSCRIPTION_DURATION = 5000 // 5 seconds for expiry test
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

let passed = 0
let failed = 0
const errors = []

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}: ${detail || 'Assertion failed'}`)
    failed++
    errors.push(`${label}: ${detail || 'Assertion failed'}`)
  }
}

function cleanTestData() {
  try {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE)
    if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR)
  } catch {
    // ignore
  }
}

// ── Minimal session service for reserve endpoint ────────────────────────────
class FakeRepo {
  constructor() {
    this.sessions = new Map()
  }
  findById(id) {
    return this.sessions.get(id) || null
  }
  findOrCreateById(id, opts) {
    if (this.sessions.has(id)) return this.sessions.get(id)
    const s = { id, ballState: { x: 400, y: 300, vx: 0, vy: 0 }, ...opts }
    this.sessions.set(id, s)
    return s
  }
  getAll() {
    return Array.from(this.sessions.values())
  }
  create(opts) {
    const s = { id: 'auto_' + Date.now(), ...opts }
    this.sessions.set(s.id, s)
    return s
  }
  cleanupExpired() {
    return []
  }
}

function makeSessionService(subscriptionService) {
  const repo = new FakeRepo()
  const broadcast = {
    broadcastState: () => {},
    broadcastViewerStatus: () => {},
    broadcastViewerConnection: () => {},
    broadcastControllerConnection: () => {},
    broadcastLanguageUpdate: () => {},
    broadcastInitialState: () => {},
    clearDeltaCache: () => {}
  }
  const physics = {
    initializeEngine: () => {},
    applyUpdates: () => {},
    updateScreenSize: () => {},
    stopPhysics: () => {},
    getState: () => ({ x: 400, y: 300 })
  }
  const wsManager = {
    addClient: () => true,
    removeClient: () => null,
    getClients: () => [],
    getClientInfo: () => null
  }
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    logSession: () => {},
    debug: () => {}
  }
  const analytics = {
    recordSessionCreated: () => {},
    recordSessionEnded: () => {},
    recordSessionError: () => {},
    recordLanguage: () => {},
    updatePeak: () => {},
    getStats: () => ({})
  }
  return {
    repo,
    broadcast,
    physics,
    wsManager,
    logger,
    analytics,
    subscriptionService,
    createSession: async () => ({ id: 'test-session-auto' }),
    findOrCreateSession(id) {
      return repo.findOrCreateById(id)
    },
    getSession(id) {
      return repo.findById(id)
    },
    getSessionCount() {
      return repo.getAll().length
    },
    updateBallState() {
      return true
    },
    setLanguage() {
      return true
    },
    handleWebSocketConnection() {},
    handleWebSocketDisconnection() {},
    getClientInfo() {
      return null
    }
  }
}

async function httpPost(path, body) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function httpGet(path) {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url)
  const data = await res.json()
  return { status: res.status, data }
}

async function main() {
  console.log('\n🌐 SubscriptionService — HTTP Integration Tests')
  console.log('='.repeat(55))

  // ── Cleanup ─────────────────────────────────────────────────────────────
  cleanTestData()

  // ── Create services ─────────────────────────────────────────────────────
  const subscriptionService = new SubscriptionService({
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    },
    durationMs: SUBSCRIPTION_DURATION,
    dataDir: TEST_DATA_DIR
  })
  subscriptionService._subscriptions.clear()
  subscriptionService._customIdIndex.clear()
  subscriptionService._tokenIndex.clear()

  const sessionService = makeSessionService(subscriptionService)

  // ── Create Express app ──────────────────────────────────────────────────
  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  const logger = {
    info: (msg) => {},
    warn: (msg) => {},
    error: (msg) => {},
    debug: () => {},
    logSession: () => {}
  }
  const analytics = {
    recordSessionCreated: () => {},
    recordSessionEnded: () => {},
    recordSessionError: () => {},
    recordLanguage: () => {},
    updatePeak: () => {},
    getStats: () => ({})
  }
  const apiCache = new Map()

  // Register subscription routes (NO CSRF for test simplicity)
  registerSubscriptionRoutes(app, subscriptionService, {
    logger,
    telegramBot: null
  })

  // Register session routes with subscription gating
  registerSessionRoutes(
    app,
    sessionService,
    apiCache,
    analytics,
    { requireSession: (r, s, n) => n(), logger },
    subscriptionService
  )

  // ── Start server ────────────────────────────────────────────────────────
  const server = app.listen(TEST_PORT)
  // Wait for server to be ready
  await new Promise((resolve) => server.on('listening', resolve))

  const TG_USER_1 = 100500
  const TG_USER_2 = 999888
  const CID_1 = 'anna_2025'
  const CID_2 = 'client_ivan'
  const TOKEN_1 = 'http_test_token_1'

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // Test 1: Status without subscription
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 1: No subscription initially')

    const res1a = await httpGet(`/api/subscription/status/${TG_USER_1}`)
    assert(
      'GET /status returns active: false',
      res1a.data.active === false,
      JSON.stringify(res1a.data)
    )

    const res1b = await httpPost(`/api/subscription/${CID_1}/check`)
    assert(
      'POST /check returns active: false',
      res1b.data.active === false,
      JSON.stringify(res1b.data)
    )

    // Reserve should fail with 402
    const res1c = await httpPost(`/api/session/${CID_1}/reserve`)
    assert(
      'POST /reserve returns 402 (subscription required)',
      res1c.status === 402,
      `got ${res1c.status}: ${JSON.stringify(res1c.data)}`
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 2: Activate subscription (simulates Telegram successful_payment)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 2: Activate subscription by telegramUserId')

    const actRes = subscriptionService.activate(TG_USER_1, TOKEN_1, 75)
    assert(
      'activate() returns success: true',
      actRes.success === true,
      JSON.stringify(actRes)
    )

    const res2a = await httpGet(`/api/subscription/status/${TG_USER_1}`)
    assert(
      'GET /status returns active: true',
      res2a.data.active === true,
      JSON.stringify(res2a.data)
    )

    // Link CID_1 to TG_USER_1 (simulating /start CID_1 after payment)
    subscriptionService.linkCustomId(CID_1, TG_USER_1)

    const res2b = await httpPost(`/api/subscription/${CID_1}/check`)
    assert(
      'POST /check(CID_1) returns active: true',
      res2b.data.active === true,
      JSON.stringify(res2b.data)
    )
    assert(
      'POST /check(CID_1) returns subscription.expiresAt',
      typeof res2b.data.subscription?.expiresAt === 'number',
      JSON.stringify(res2b.data)
    )

    // Now reserve should succeed
    const res2c = await httpPost(`/api/session/${CID_1}/reserve`)
    assert(
      'POST /reserve(CID_1) returns 200 (subscribed)',
      res2c.status === 200,
      `got ${res2c.status}: ${JSON.stringify(res2c.data)}`
    )
    assert(
      'POST /reserve returns viewerUrl and controllerUrl',
      typeof res2c.data?.viewerUrl === 'string' &&
        typeof res2c.data?.controllerUrl === 'string',
      JSON.stringify(res2c.data)
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 3: Second customId → same Telegram user (cross-computer)
    // ═══════════════════════════════════════════════════════════════════════
    console.log(
      '\n📋 Test 3: Second customId → same Telegram user (cross-computer)'
    )

    // Link CID_2 (new client on another computer) to the same TG_USER_1
    subscriptionService.linkCustomId(CID_2, TG_USER_1)

    const res3a = await httpPost(`/api/subscription/${CID_2}/check`)
    assert(
      'POST /check(CID_2) returns active: true (cross-computer)',
      res3a.data.active === true,
      JSON.stringify(res3a.data)
    )

    const res3b = await httpPost(`/api/session/${CID_2}/reserve`)
    assert(
      'POST /reserve(CID_2) returns 200 (cross-computer)',
      res3b.status === 200,
      `got ${res3b.status}: ${JSON.stringify(res3b.data)}`
    )

    // Verify CID_1 still works
    const res3c = await httpPost(`/api/subscription/${CID_1}/check`)
    assert(
      'POST /check(CID_1) still active',
      res3c.data.active === true,
      JSON.stringify(res3c.data)
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 4: Unsubscribed user
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 4: Unsubscribed user (never paid)')

    const res4a = await httpGet(`/api/subscription/status/${TG_USER_2}`)
    assert(
      'GET /status(user2) returns active: false',
      res4a.data.active === false,
      JSON.stringify(res4a.data)
    )

    const res4b = await httpPost('/api/subscription/nobody99/check')
    assert(
      'POST /check(unlinked) returns active: false',
      res4b.data.active === false,
      JSON.stringify(res4b.data)
    )

    const res4c = await httpPost('/api/session/nobody99/reserve')
    assert(
      'POST /reserve(unlinked) returns 402',
      res4c.status === 402,
      JSON.stringify(res4c.data)
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 5: activate-by-telegram endpoint (cross-computer flow)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 5: activate-by-telegram endpoint')

    // New customId, same TG_USER_1 — should succeed because user has active sub
    const CID_CROSS = 'cross_computer_test'
    const res5a = await httpPost('/api/subscription/activate-by-telegram', {
      customId: CID_CROSS,
      telegramUserId: TG_USER_1
    })
    assert(
      'POST /activate-by-telegram returns 200',
      res5a.status === 200,
      JSON.stringify(res5a.data)
    )
    assert(
      'POST /activate-by-telegram success: true',
      res5a.data.success === true,
      JSON.stringify(res5a.data)
    )

    // Now check the new customId
    const res5b = await httpPost(`/api/subscription/${CID_CROSS}/check`)
    assert(
      'POST /check(cross) returns active: true',
      res5b.data.active === true,
      JSON.stringify(res5b.data)
    )

    // Reserve with cross-computer customId
    const res5c = await httpPost(`/api/session/${CID_CROSS}/reserve`)
    assert(
      'POST /reserve(cross) returns 200',
      res5c.status === 200,
      JSON.stringify(res5c.data)
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 6: activate-by-telegram with unsubscribed user → 402
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 6: activate-by-telegram with unsubscribed user')

    const res6a = await httpPost('/api/subscription/activate-by-telegram', {
      customId: 'unsub_client',
      telegramUserId: TG_USER_2
    })
    assert(
      'POST /activate-by-telegram(unsubscribed) returns 402',
      res6a.status === 402,
      JSON.stringify(res6a.data)
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 7: getStatus shows customIds
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 7: getStatus includes customIds')

    const res7 = await httpGet(`/api/subscription/status/${TG_USER_1}`)
    assert(
      'GET /status has active: true',
      res7.data.active === true,
      JSON.stringify(res7.data)
    )
    assert(
      'GET /status has starsAmount: 75',
      res7.data.starsAmount === 75,
      JSON.stringify(res7.data)
    )
    assert(
      'GET /status customIds includes CID_1',
      Array.isArray(res7.data.customIds) && res7.data.customIds.includes(CID_1),
      JSON.stringify(res7.data.customIds)
    )
    assert(
      'GET /status customIds includes CID_2',
      res7.data.customIds.includes(CID_2),
      JSON.stringify(res7.data.customIds)
    )
    assert(
      'GET /status customIds includes CID_CROSS',
      res7.data.customIds.includes(CID_CROSS),
      JSON.stringify(res7.data.customIds)
    )
    assert(
      'GET /status has activatedAt timestamp',
      typeof res7.data.activatedAt === 'number',
      JSON.stringify(res7.data)
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Test 8: Subscription expiry
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📋 Test 8: Subscription expiry')

    // Wait for expiry (duration=5s)
    console.log('  ⏳ Waiting for subscription to expire...')
    await new Promise((r) => setTimeout(r, SUBSCRIPTION_DURATION + 1000))

    const res8a = await httpGet(`/api/subscription/status/${TG_USER_1}`)
    assert(
      'GET /status returns active: false after expiry',
      res8a.data.active === false,
      JSON.stringify(res8a.data)
    )

    const res8b = await httpPost(`/api/subscription/${CID_1}/check`)
    assert(
      'POST /check(CID_1) returns active: false after expiry',
      res8b.data.active === false,
      JSON.stringify(res8b.data)
    )

    // Reserve should now fail
    const res8c = await httpPost(`/api/session/${CID_1}/reserve`)
    assert(
      'POST /reserve returns 402 after expiry',
      res8c.status === 402,
      `got ${res8c.status}: ${JSON.stringify(res8c.data)}`
    )

    // ═══════════════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(55))
    const total = passed + failed
    console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed`)
    if (errors.length > 0) {
      console.log('\n❌ Failed assertions:')
      errors.forEach((e) => console.log(`  • ${e}`))
    }
  } finally {
    server.close()
    cleanTestData()
  }

  if (failed > 0) {
    console.log('\n❌ SOME HTTP TESTS FAILED')
    process.exit(1)
  } else {
    console.log('\n✅ ALL HTTP TESTS PASSED')
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  cleanTestData()
  process.exit(1)
})
