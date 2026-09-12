'use strict'
/**
 * Unit tests for TelegramAuthService
 * Run: node packages/server-core/test/telegram-auth.test.js
 */

const assert = require('assert')
const crypto = require('node:crypto')
const TelegramAuthService = require('../src/services/TelegramAuthService')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`)
    failed++
  }
}

console.log('\n🔧 TelegramAuthService Unit Tests\n')

const BOT_TOKEN = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyz_test_token'
const silentLogger = { warn: () => {}, debug: () => {}, error: () => {} }
const service = new TelegramAuthService({
  botToken: BOT_TOKEN,
  logger: silentLogger
})

function buildInitData(params, botToken) {
  const secretKey = crypto.createHash('sha256').update(botToken).digest()
  const checkParts = []
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'hash') {
      checkParts.push(`${key}=${value}`)
    }
  }
  checkParts.sort()
  const dataCheckString = checkParts.join('\n')
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')
  const allParams = { ...params, hash }
  return new URLSearchParams(allParams).toString()
}

// --- isConfigured ---
console.log('--- isConfigured ---')

test('isConfigured returns true with botToken', () => {
  assert.strictEqual(service.isConfigured, true)
})

test('isConfigured returns false without botToken', () => {
  const s = new TelegramAuthService({ botToken: '', logger: silentLogger })
  assert.strictEqual(s.isConfigured, false)
})

// --- verifyInitData: valid ---
console.log('\n--- verifyInitData: valid ---')

test('verifies valid initData with user JSON', () => {
  const user = JSON.stringify({
    id: 123456,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser'
  })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  const result = service.verifyInitData(initData)
  assert.ok(result)
  assert.strictEqual(result.userId, 123456)
  assert.strictEqual(result.firstName, 'Test')
  assert.strictEqual(result.lastName, 'User')
  assert.strictEqual(result.username, 'testuser')
})

test('verifies valid initData with flat format', () => {
  const params = { id: '789', first_name: 'Flat', username: 'flatuser' }
  const initData = buildInitData(params, BOT_TOKEN)
  const result = service.verifyInitData(initData)
  assert.ok(result)
  assert.strictEqual(result.userId, 789)
  assert.strictEqual(result.firstName, 'Flat')
  assert.strictEqual(result.username, 'flatuser')
})

// --- verifyInitData: invalid ---
console.log('\n--- verifyInitData: invalid ---')

test('returns null for null input', () => {
  assert.strictEqual(service.verifyInitData(null), null)
})

test('returns null for undefined', () => {
  assert.strictEqual(service.verifyInitData(undefined), null)
})

test('returns null for empty string', () => {
  assert.strictEqual(service.verifyInitData(''), null)
})

test('returns null for non-string', () => {
  assert.strictEqual(service.verifyInitData(123), null)
})

test('returns null when botToken not configured', () => {
  const s = new TelegramAuthService({ botToken: '', logger: silentLogger })
  assert.strictEqual(s.verifyInitData('user=%7B%22id%22%3A1%7D&hash=abc'), null)
})

test('returns null for missing hash', () => {
  const initData = 'user=%7B%22id%22%3A123%7D&auth_date=1700000000'
  assert.strictEqual(service.verifyInitData(initData), null)
})

test('returns null for tampered hash', () => {
  const user = JSON.stringify({ id: 123456, first_name: 'Test' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  const tampered = initData.replace(/hash=[^&]+/, 'hash=aaa')
  assert.strictEqual(service.verifyInitData(tampered), null)
})

test('returns null for tampered user data', () => {
  const user = JSON.stringify({ id: 123456, first_name: 'Test' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  const evilUser = JSON.stringify({ id: 999, first_name: 'Evil' })
  const tampered = initData.replace(
    /user=[^&]+/,
    'user=' + encodeURIComponent(evilUser)
  )
  assert.strictEqual(service.verifyInitData(tampered), null)
})

test('returns null for tampered auth_date', () => {
  const user = JSON.stringify({ id: 123456, first_name: 'Test' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  const tampered = initData.replace(/auth_date=[^&]+/, 'auth_date=1800000000')
  assert.strictEqual(service.verifyInitData(tampered), null)
})

test('returns null for invalid user JSON', () => {
  const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest()
  const checkParts = ['auth_date=1700000000', 'user={invalid json']
  checkParts.sort()
  const dataCheckString = checkParts.join('\n')
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')
  const initData = `user=${encodeURIComponent('{invalid json')}&auth_date=1700000000&hash=${hash}`
  assert.strictEqual(service.verifyInitData(initData), null)
})

test('returns null for missing user ID', () => {
  const user = JSON.stringify({ first_name: 'NoID' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  const result = service.verifyInitData(initData)
  assert.strictEqual(result, null)
})

test('returns null for invalid user ID (0)', () => {
  const user = JSON.stringify({ id: 0, first_name: 'Zero' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  assert.strictEqual(service.verifyInitData(initData), null)
})

test('returns null for invalid user ID (negative)', () => {
  const user = JSON.stringify({ id: -5, first_name: 'Neg' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  assert.strictEqual(service.verifyInitData(initData), null)
})

// --- verifyInitData: different bot tokens ---
console.log('\n--- verifyInitData: different bot tokens ---')

test('returns null when verified with wrong bot token', () => {
  const user = JSON.stringify({ id: 123456, first_name: 'Test' })
  const params = { user, auth_date: '1700000000' }
  const initData = buildInitData(params, BOT_TOKEN)
  const wrongService = new TelegramAuthService({
    botToken: 'wrong:token',
    logger: silentLogger
  })
  assert.strictEqual(wrongService.verifyInitData(initData), null)
})

// --- Summary ---
console.log(`\n${'='.repeat(50)}`)
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`)
if (failed > 0) process.exit(1)
