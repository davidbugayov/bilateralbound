'use strict'
/**
 * Subscription Controller & Telegram Auth integration tests
 */
const assert = require('assert')
const http = require('node:http')
const express = require('express')
const cookieParser = require('cookie-parser')
const SubscriptionService = require('../src/services/SubscriptionService')
const LinkAccessService = require('../src/services/LinkAccessService')
const TelegramAuthService = require('../src/services/TelegramAuthService')
const { registerSubscriptionRoutes } = require('../src/controllers/subscriptionController')
const fs = require('node:fs')
const path = require('node:path')

const testDataDir = path.join(__dirname, 'temp-test-data')
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true })
}

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
}

const subscriptionService = new SubscriptionService({
  logger: mockLogger,
  durationMs: 30 * 24 * 60 * 60 * 1000,
  testMode: true,
  dataDir: testDataDir
})

const linkAccessService = new LinkAccessService({
  logger: mockLogger,
  dataDir: testDataDir
})

const app = express()
app.use(express.json())
app.use(cookieParser())

registerSubscriptionRoutes(
  app,
  subscriptionService,
  {
    logger: mockLogger,
    telegramBot: null,
    telegramAuthService: new TelegramAuthService({ botToken: '', logger: mockLogger }),
    priceStars: 75,
    testMode: true,
    webhookSecret: '',
    baseUrl: 'http://localhost:3000',
    isDev: true
  },
  linkAccessService
)

const server = http.createServer(app)

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          })
        } catch {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          })
        }
      })
    })
    req.on('error', reject)
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body))
    }
    req.end()
  })
}

async function runTests() {
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port

  console.log('\n💳 Subscription Controller Integration Tests\n')

  try {
    // 1. Activate test subscription via test-activate
    const testActRes = await request(
      {
        hostname: 'localhost',
        port,
        path: '/api/subscription/test-activate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { telegramUserId: 12345678, customId: 'my-custom-test' }
    )
    assert.strictEqual(testActRes.status, 200)
    assert.strictEqual(testActRes.body.success, true)
    console.log('  ✅ test-activate succeeds in dev/testMode')

    // 2. Check subscription status by telegram user id
    const statusRes = await request({
      hostname: 'localhost',
      port,
      path: '/api/subscription/status/12345678',
      method: 'GET'
    })
    assert.strictEqual(statusRes.status, 200)
    assert.strictEqual(statusRes.body.active, true)
    console.log('  ✅ status check by telegramUserId succeeds without 403 in dev')

    // 3. Activate by telegram from browser using telegramUserId
    const actByTgRes = await request(
      {
        hostname: 'localhost',
        port,
        path: '/api/subscription/activate-by-telegram',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { customId: 'client-session-1', telegramUserId: 12345678 }
    )
    assert.strictEqual(actByTgRes.status, 200)
    assert.strictEqual(actByTgRes.body.success, true)
    console.log('  ✅ activate-by-telegram succeeds using telegramUserId without 403')

    // 4. Unlock link-access via telegramUserId
    const unlockRes = await request(
      {
        hostname: 'localhost',
        port,
        path: '/api/link-access/test-session-1/unlock',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { telegramUserId: 12345678 }
    )
    assert.strictEqual(unlockRes.status, 200)
    assert.strictEqual(unlockRes.body.success, true)
    console.log('  ✅ link-access unlock succeeds using telegramUserId without 403')

    // 5. Check unlocked access
    const cookie = unlockRes.headers['set-cookie']
    const checkRes = await request({
      hostname: 'localhost',
      port,
      path: '/api/link-access/test-session-1/check',
      method: 'GET',
      headers: cookie ? { Cookie: cookie[0] } : {}
    })
    assert.strictEqual(checkRes.status, 200)
    assert.strictEqual(checkRes.body.unlocked, true)
    console.log('  ✅ link-access check confirms unlocked state with cookie')

    // 6. Dev server host header simulation (Host: dev.emdrbilateral.online)
    const devHostActRes = await request(
      {
        hostname: 'localhost',
        port,
        path: '/api/subscription/test-activate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'dev.emdrbilateral.online'
        }
      },
      { telegramUserId: 87654321, customId: 'dev-host-test' }
    )
    assert.strictEqual(devHostActRes.status, 200)
    assert.strictEqual(devHostActRes.body.success, true)
    console.log('  ✅ test-activate succeeds when request has dev host header')

    // 7. Verify activate-by-telegram with dev host header
    const devHostActivateRes = await request(
      {
        hostname: 'localhost',
        port,
        path: '/api/subscription/activate-by-telegram',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'dev.emdrbilateral.online'
        }
      },
      { customId: 'client-dev-host-1', telegramUserId: 87654321 }
    )
    assert.strictEqual(devHostActivateRes.status, 200)
    assert.strictEqual(devHostActivateRes.body.success, true)
    console.log('  ✅ activate-by-telegram succeeds with dev host header')

    console.log('\nAll subscription integration tests passed!\n')
  } finally {
    server.close()
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true })
    } catch {}
  }
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
