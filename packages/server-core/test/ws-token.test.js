'use strict'
/**
 * Unit tests for WsTokenService
 * Run: node packages/server-core/test/ws-token.test.js
 */

const assert = require('assert')
const WsTokenService = require('../src/services/WsTokenService')

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

console.log('\n🔧 WsTokenService Unit Tests\n')

const secret = 'test-secret-key-for-testing-1234567890'
const service = new WsTokenService({ secret, ttlMs: 1000 })

// --- generate ---
console.log('--- generate ---')

test('generates a string token', () => {
  const token = service.generate('session1', 'viewer')
  assert.strictEqual(typeof token, 'string')
  assert.ok(token.length > 0)
})

test('token contains sessionId.role.expiresAt.hmac format', () => {
  const token = service.generate('session1', 'controller')
  const parts = token.split('.')
  assert.strictEqual(parts.length, 4)
})

test('generates different tokens for different sessions', () => {
  const t1 = service.generate('session1', 'viewer')
  const t2 = service.generate('session2', 'viewer')
  assert.notStrictEqual(t1, t2)
})

test('generates different tokens for different roles', () => {
  const t1 = service.generate('session1', 'viewer')
  const t2 = service.generate('session1', 'controller')
  assert.notStrictEqual(t1, t2)
})

// --- verify: valid tokens ---
console.log('\n--- verify: valid tokens ---')

test('verifies valid viewer token', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('session1', 'viewer')
  const result = longService.verify(token)
  assert.ok(result)
  assert.strictEqual(result.sessionId, 'session1')
  assert.strictEqual(result.role, 'viewer')
  assert.strictEqual(typeof result.expiresAt, 'number')
})

test('verifies valid controller token', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('my-session', 'controller')
  const result = longService.verify(token)
  assert.ok(result)
  assert.strictEqual(result.sessionId, 'my-session')
  assert.strictEqual(result.role, 'controller')
})

test('verifies token with dash in sessionId', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('my-session-1', 'viewer')
  const result = longService.verify(token)
  assert.strictEqual(result.sessionId, 'my-session-1')
})

test('verifies token with underscore in sessionId', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('my_session', 'viewer')
  const result = longService.verify(token)
  assert.strictEqual(result.sessionId, 'my_session')
})

// --- verify: invalid tokens ---
console.log('\n--- verify: invalid tokens ---')

test('returns null for null token', () => {
  assert.strictEqual(service.verify(null), null)
})

test('returns null for undefined token', () => {
  assert.strictEqual(service.verify(undefined), null)
})

test('returns null for empty string', () => {
  assert.strictEqual(service.verify(''), null)
})

test('returns null for non-string token', () => {
  assert.strictEqual(service.verify(12345), null)
})

test('returns null for token without dots', () => {
  assert.strictEqual(service.verify('invalidtoken'), null)
})

test('returns null for token with wrong number of parts', () => {
  assert.strictEqual(service.verify('a.b.c'), null)
})

test('returns null for tampered sessionId', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('session1', 'viewer')
  const parts = token.split('.')
  const tampered = 'evil-session.' + parts.slice(1).join('.')
  assert.strictEqual(longService.verify(tampered), null)
})

test('returns null for tampered role', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('session1', 'viewer')
  const parts = token.split('.')
  const tampered = parts[0] + '.controller.' + parts.slice(2).join('.')
  assert.strictEqual(longService.verify(tampered), null)
})

test('returns null for tampered HMAC', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const token = longService.generate('session1', 'viewer')
  const parts = token.split('.')
  parts[3] = 'a'.repeat(parts[3].length)
  const tampered = parts.join('.')
  assert.strictEqual(longService.verify(tampered), null)
})

test('returns null for expired token', async () => {
  const shortService = new WsTokenService({ secret, ttlMs: 10 })
  const token = shortService.generate('session1', 'viewer')
  assert.ok(token)
  await new Promise((r) => setTimeout(r, 50))
  const result = shortService.verify(token)
  assert.strictEqual(result, null)
})

test('returns null for invalid role', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const expiresAt = Date.now() + 60000
  const payload = `session1.admin.${expiresAt}`
  const crypto = require('node:crypto')
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const token = `${payload}.${hmac}`
  assert.strictEqual(longService.verify(token), null)
})

test('returns null for sessionId too short (< 3 chars)', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const expiresAt = Date.now() + 60000
  const payload = `ab.viewer.${expiresAt}`
  const crypto = require('node:crypto')
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const token = `${payload}.${hmac}`
  assert.strictEqual(longService.verify(token), null)
})

test('returns null for sessionId with invalid chars', () => {
  const longService = new WsTokenService({ secret, ttlMs: 60000 })
  const expiresAt = Date.now() + 60000
  const payload = `ses sion.viewer.${expiresAt}`
  const crypto = require('node:crypto')
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const token = `${payload}.${hmac}`
  assert.strictEqual(longService.verify(token), null)
})

// --- verify: different secrets ---
console.log('\n--- verify: different secrets ---')

test('returns null when verified with different secret', () => {
  const service1 = new WsTokenService({
    secret: 'secret-one-1234567890',
    ttlMs: 60000
  })
  const service2 = new WsTokenService({
    secret: 'secret-two-1234567890',
    ttlMs: 60000
  })
  const token = service1.generate('session1', 'viewer')
  assert.strictEqual(service2.verify(token), null)
})

test('verifies when same secret used', () => {
  const s1 = new WsTokenService({
    secret: 'same-secret-1234567890',
    ttlMs: 60000
  })
  const s2 = new WsTokenService({
    secret: 'same-secret-1234567890',
    ttlMs: 60000
  })
  const token = s1.generate('session1', 'viewer')
  const result = s2.verify(token)
  assert.ok(result)
  assert.strictEqual(result.sessionId, 'session1')
})

// --- Summary ---
console.log(`\n${'='.repeat(50)}`)
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`)
if (failed > 0) process.exit(1)
