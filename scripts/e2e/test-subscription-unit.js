#!/usr/bin/env node
/**
 * Модульный тест SubscriptionService — проверяет что подписка привязана к telegramUserId,
 * а customId линкуется через customIdIndex.
 *
 * Проверяемые сценарии:
 *   1. activate(telegramUserId) — активация подписки
 *   2. isActive(telegramUserId) — проверка по Telegram ID
 *   3. linkCustomId(customId, telegramUserId) + isCustomIdAllowed(customId)
 *   4. Два разных customId → один telegramUserId (оба разблокированы)
 *   5. Без подписки → isActive() = false, isCustomIdAllowed() = false
 *   6. Cross-computer: другой customId → тот же telegramUserId → работает
 *   7. Истечение подписки (expired)
 */

const SubscriptionService = require('../../packages/server-core/src/services/SubscriptionService')
const path = require('node:path')
const fs = require('node:fs')

// Use a temp directory so we don't pollute real data
const TEST_DATA_DIR = path.join(__dirname, '..', '..', 'tmp-test-data')
const TEST_FILE = path.join(TEST_DATA_DIR, 'subscriptions.json')

// Clean up before and after
function cleanTestData() {
  try {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE)
    if (fs.existsSync(TEST_DATA_DIR)) fs.rmdirSync(TEST_DATA_DIR)
  } catch (e) { /* ignore */ }
}

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

async function main() {
  console.log('\n🧪 SubscriptionService — Unit Tests')
  console.log('='.repeat(50))

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------
  cleanTestData()

  const subsvc = new SubscriptionService({
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    durationMs: 1000, // 1 second for fast expiry testing
    dataDir: TEST_DATA_DIR
  })

  // Clean the in-memory state from any loaded data
  subsvc._subscriptions.clear()
  subsvc._customIdIndex.clear()
  subsvc._tokenIndex.clear()

  const TELEGRAM_USER_ID = 123456789
  const TELEGRAM_USER_ID_2 = 987654321
  const CUSTOM_ID_1 = 'anna_2025'
  const CUSTOM_ID_2 = 'client_ivan'
  const CUSTOM_ID_3 = 'session42'
  const TOKEN_1 = 'test_charge_id_1'
  const TOKEN_2 = 'test_charge_id_2'

  // -------------------------------------------------------------------------
  // Test 1: No subscription initially
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 1: No subscription initially')
  assert('isActive returns false for unknown user',
    subsvc.isActive(TELEGRAM_USER_ID) === false)
  assert('isCustomIdAllowed returns false for unlinked customId',
    subsvc.isCustomIdAllowed(CUSTOM_ID_1) === false)

  // -------------------------------------------------------------------------
  // Test 2: Activate subscription
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 2: Activate subscription by telegramUserId')
  const activateResult = subsvc.activate(TELEGRAM_USER_ID, TOKEN_1, 75)
  assert('activate() returns success: true',
    activateResult.success === true)
  assert('activate() returns expiresAt (number)',
    typeof activateResult.expiresAt === 'number')
  assert('isActive() returns true after activation',
    subsvc.isActive(TELEGRAM_USER_ID) === true)

  // -------------------------------------------------------------------------
  // Test 3: Link customId and check isCustomIdAllowed
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 3: Link customId → telegramUserId')
  const linkResult = subsvc.linkCustomId(CUSTOM_ID_1, TELEGRAM_USER_ID)
  assert('linkCustomId() returns success: true',
    linkResult.success === true)
  assert('isCustomIdAllowed(CUSTOM_ID_1) returns true',
    subsvc.isCustomIdAllowed(CUSTOM_ID_1) === true)

  // -------------------------------------------------------------------------
  // Test 4: Second customId → same telegramUserId (cross-computer scenario)
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 4: Second customId → same Telegram user (cross-computer)')
  const linkResult2 = subsvc.linkCustomId(CUSTOM_ID_2, TELEGRAM_USER_ID)
  assert('linkCustomId(CUSTOM_ID_2) returns success: true',
    linkResult2.success === true)
  assert('isCustomIdAllowed(CUSTOM_ID_2) returns true',
    subsvc.isCustomIdAllowed(CUSTOM_ID_2) === true)
  assert('isCustomIdAllowed(CUSTOM_ID_1) still true',
    subsvc.isCustomIdAllowed(CUSTOM_ID_1) === true)

  // -------------------------------------------------------------------------
  // Test 5: Another user with no subscription
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 5: Unsubscribed user')
  assert('isActive(unknownUser) returns false',
    subsvc.isActive(TELEGRAM_USER_ID_2) === false)
  const linkResult3 = subsvc.linkCustomId(CUSTOM_ID_3, TELEGRAM_USER_ID_2)
  assert('linkCustomId(CUSTOM_ID_3) success for unsubscribed user',
    linkResult3.success === true)
  assert('isCustomIdAllowed(CUSTOM_ID_3) returns false (no subscription)',
    subsvc.isCustomIdAllowed(CUSTOM_ID_3) === false)

  // -------------------------------------------------------------------------
  // Test 6: getStatus and getStatusForCustomId
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 6: getStatus API')
  const status = subsvc.getStatus(TELEGRAM_USER_ID)
  assert('getStatus().active === true', status.active === true)
  assert('getStatus().customIds includes CUSTOM_ID_1',
    status.customIds.includes(CUSTOM_ID_1))
  assert('getStatus().customIds includes CUSTOM_ID_2',
    status.customIds.includes(CUSTOM_ID_2))
  assert('getStatus().starsAmount === 75', status.starsAmount === 75)

  const statusByCustomId = subsvc.getStatusForCustomId(CUSTOM_ID_1)
  assert('getStatusForCustomId(CUSTOM_ID_1).active === true',
    statusByCustomId.active === true)

  const statusByCustomId3 = subsvc.getStatusForCustomId(CUSTOM_ID_3)
  assert('getStatusForCustomId(CUSTOM_ID_3).active === false',
    statusByCustomId3.active === false)

  // -------------------------------------------------------------------------
  // Test 7: Token deduplication
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 7: Token deduplication')
  const duplicateResult = subsvc.activate(TELEGRAM_USER_ID, TOKEN_1, 75)
  assert('Reusing same token returns success (idempotent)',
    duplicateResult.success === true)

  // -------------------------------------------------------------------------
  // Test 8: Subscription expiry
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 8: Subscription expiry')
  // Wait for the subscription to expire (durationMs = 1000ms)
  await new Promise(r => setTimeout(r, 1100))

  assert('isActive() returns false after expiry',
    subsvc.isActive(TELEGRAM_USER_ID) === false)
  assert('isCustomIdAllowed(CUSTOM_ID_1) returns false after expiry',
    subsvc.isCustomIdAllowed(CUSTOM_ID_1) === false)
  assert('isCustomIdAllowed(CUSTOM_ID_2) returns false after expiry',
    subsvc.isCustomIdAllowed(CUSTOM_ID_2) === false)

  // -------------------------------------------------------------------------
  // Test 9: Reactivation with new token
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 9: Reactivation after expiry')
  const reactivateResult = subsvc.activate(TELEGRAM_USER_ID, TOKEN_2, 75)
  assert('reactivate() returns success: true',
    reactivateResult.success === true)

  // Re-link customIds
  subsvc.linkCustomId(CUSTOM_ID_1, TELEGRAM_USER_ID)
  assert('isCustomIdAllowed(CUSTOM_ID_1) true after reactivation',
    subsvc.isCustomIdAllowed(CUSTOM_ID_1) === true)

  // -------------------------------------------------------------------------
  // Test 10: getStatus when not found
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 10: Edge cases')
  const noStatus = subsvc.getStatus(999999999)
  assert('getStatus(unknown).active === false', noStatus.active === false)

  const noCustomStatus = subsvc.getStatusForCustomId('nonexistent')
  assert('getStatusForCustomId("nonexistent").active === false',
    noCustomStatus.active === false)

  // -------------------------------------------------------------------------
  // Test 11: activate-by-telegram endpoint logic (simulated)
  // -------------------------------------------------------------------------
  console.log('\n📋 Test 11: Activate-by-telegram flow (cross-computer scenario)')
  // Simulate: user on another computer with customId_2, but subscription already active
  // The real flow: POST /api/subscription/activate-by-telegram with { customId, telegramUserId }
  // SubscriptionService checks isActive(telegramUserId) → should be true
  assert('isActive(TELEGRAM_USER_ID) true after reactivation',
    subsvc.isActive(TELEGRAM_USER_ID) === true)

  // Link a brand new customId (simulating a new client from another computer)
  const CUSTOM_ID_CROSS = 'cross_computer_test'
  const linkCrossResult = subsvc.linkCustomId(CUSTOM_ID_CROSS, TELEGRAM_USER_ID)
  assert('linkCustomId(CUSTOM_ID_CROSS) success',
    linkCrossResult.success === true)
  assert('isCustomIdAllowed(CUSTOM_ID_CROSS) true (cross-computer)',
    subsvc.isCustomIdAllowed(CUSTOM_ID_CROSS) === true)

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(50))
  const total = passed + failed
  console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\n❌ Failed assertions:')
    errors.forEach(e => console.log(`  • ${e}`))
  }

  cleanTestData()

  if (failed > 0) {
    console.log('\n❌ SOME TESTS FAILED')
    process.exit(1)
  } else {
    console.log('\n✅ ALL TESTS PASSED')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  cleanTestData()
  process.exit(1)
})
