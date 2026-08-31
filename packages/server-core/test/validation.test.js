'use strict'
/**
 * Unit tests for ValidationUtils
 * Run: node packages/server-core/test/validation.test.js
 */

const assert = require('assert')
const ValidationUtils = require('../src/utils/validation')

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

console.log('\n🔧 ValidationUtils Unit Tests\n')

// --- validateBallStateUpdates ---
console.log('--- validateBallStateUpdates ---')

test('returns empty object for null input', () => {
  assert.deepStrictEqual(ValidationUtils.validateBallStateUpdates(null), {})
})

test('returns empty object for non-object input', () => {
  assert.deepStrictEqual(ValidationUtils.validateBallStateUpdates('string'), {})
})

test('returns empty object for undefined', () => {
  assert.deepStrictEqual(
    ValidationUtils.validateBallStateUpdates(undefined),
    {}
  )
})

test('validates valid speed', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: 50 })
  assert.strictEqual(r.speed, 50)
})

test('rejects speed > 100', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: 101 })
  assert.strictEqual(r.speed, undefined)
})

test('rejects negative speed', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: -1 })
  assert.strictEqual(r.speed, undefined)
})

test('rejects NaN speed', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: NaN })
  assert.strictEqual(r.speed, undefined)
})

test('rejects string speed', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: '50' })
  assert.strictEqual(r.speed, undefined)
})

test('accepts speed 0', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: 0 })
  assert.strictEqual(r.speed, 0)
})

test('accepts speed 100', () => {
  const r = ValidationUtils.validateBallStateUpdates({ speed: 100 })
  assert.strictEqual(r.speed, 100)
})

test('validates valid radius', () => {
  const r = ValidationUtils.validateBallStateUpdates({ radius: 30 })
  assert.strictEqual(r.radius, 30)
})

test('rejects radius 0', () => {
  const r = ValidationUtils.validateBallStateUpdates({ radius: 0 })
  assert.strictEqual(r.radius, undefined)
})

test('rejects radius > 1000', () => {
  const r = ValidationUtils.validateBallStateUpdates({ radius: 1001 })
  assert.strictEqual(r.radius, undefined)
})

test('rejects negative radius', () => {
  const r = ValidationUtils.validateBallStateUpdates({ radius: -5 })
  assert.strictEqual(r.radius, undefined)
})

test('validates paused boolean', () => {
  const r = ValidationUtils.validateBallStateUpdates({ paused: true })
  assert.strictEqual(r.paused, true)
})

test('rejects paused as string', () => {
  const r = ValidationUtils.validateBallStateUpdates({ paused: 'true' })
  assert.strictEqual(r.paused, undefined)
})

test('validates dirX and dirY', () => {
  const r = ValidationUtils.validateBallStateUpdates({ dirX: 1, dirY: -1 })
  assert.strictEqual(r.dirX, 1)
  assert.strictEqual(r.dirY, -1)
})

test('rejects dirX > 1', () => {
  const r = ValidationUtils.validateBallStateUpdates({ dirX: 1.5 })
  assert.strictEqual(r.dirX, undefined)
})

test('rejects dirY < -1', () => {
  const r = ValidationUtils.validateBallStateUpdates({ dirY: -1.5 })
  assert.strictEqual(r.dirY, undefined)
})

test('validates valid hex color #RRGGBB', () => {
  const r = ValidationUtils.validateBallStateUpdates({ colorBall: '#ff0000' })
  assert.strictEqual(r.colorBall, '#ff0000')
})

test('validates valid hex color #RGB', () => {
  const r = ValidationUtils.validateBallStateUpdates({ colorBall: '#f00' })
  assert.strictEqual(r.colorBall, '#f00')
})

test('rejects invalid color', () => {
  const r = ValidationUtils.validateBallStateUpdates({ colorBall: 'red' })
  assert.strictEqual(r.colorBall, undefined)
})

test('rejects color without #', () => {
  const r = ValidationUtils.validateBallStateUpdates({ colorBall: 'ff0000' })
  assert.strictEqual(r.colorBall, undefined)
})

test('validates soundEnabled boolean', () => {
  const r = ValidationUtils.validateBallStateUpdates({ soundEnabled: false })
  assert.strictEqual(r.soundEnabled, false)
})

test('validates valid soundType', () => {
  const r = ValidationUtils.validateBallStateUpdates({ soundType: 'tick' })
  assert.strictEqual(r.soundType, 'tick')
})

test('rejects invalid soundType', () => {
  const r = ValidationUtils.validateBallStateUpdates({ soundType: 'invalid' })
  assert.strictEqual(r.soundType, undefined)
})

test('reset=true passes through', () => {
  const r = ValidationUtils.validateBallStateUpdates({ reset: true })
  assert.strictEqual(r.reset, true)
})

test('resume=true sets paused=false', () => {
  const r = ValidationUtils.validateBallStateUpdates({ resume: true })
  assert.strictEqual(r.paused, false)
})

test('pause=true sets paused=true', () => {
  const r = ValidationUtils.validateBallStateUpdates({ pause: true })
  assert.strictEqual(r.paused, true)
})

test('returnToCenter=true passes through', () => {
  const r = ValidationUtils.validateBallStateUpdates({ returnToCenter: true })
  assert.strictEqual(r.returnToCenter, true)
})

test('validates ballEmoji null', () => {
  const r = ValidationUtils.validateBallStateUpdates({ ballEmoji: null })
  assert.strictEqual(r.ballEmoji, null)
})

test('validates ballEmoji string <= 2 chars', () => {
  const r = ValidationUtils.validateBallStateUpdates({ ballEmoji: '🦋' })
  assert.strictEqual(r.ballEmoji, '🦋')
})

test('rejects ballEmoji > 2 chars', () => {
  const r = ValidationUtils.validateBallStateUpdates({ ballEmoji: 'long' })
  assert.strictEqual(r.ballEmoji, undefined)
})

test('validates infinity boolean', () => {
  const r = ValidationUtils.validateBallStateUpdates({ infinity: true })
  assert.strictEqual(r.infinity, true)
})

test('validates brainspotting boolean', () => {
  const r = ValidationUtils.validateBallStateUpdates({ brainspotting: true })
  assert.strictEqual(r.brainspotting, true)
})

test('validates x as number', () => {
  const r = ValidationUtils.validateBallStateUpdates({ x: 100 })
  assert.strictEqual(r.x, 100)
})

test('rejects x as string', () => {
  const r = ValidationUtils.validateBallStateUpdates({ x: '100' })
  assert.strictEqual(r.x, undefined)
})

test('rejects x as NaN', () => {
  const r = ValidationUtils.validateBallStateUpdates({ x: NaN })
  assert.strictEqual(r.x, undefined)
})

test('validates trackBand top/center/bottom', () => {
  for (const v of ['top', 'center', 'bottom']) {
    const r = ValidationUtils.validateBallStateUpdates({ trackBand: v })
    assert.strictEqual(r.trackBand, v)
  }
})

test('rejects invalid trackBand', () => {
  const r = ValidationUtils.validateBallStateUpdates({ trackBand: 'middle' })
  assert.strictEqual(r.trackBand, undefined)
})

test('multiple fields validated together', () => {
  const r = ValidationUtils.validateBallStateUpdates({
    speed: 50,
    radius: 30,
    paused: false,
    colorBall: '#ff0000',
    colorBg: '#000000',
    dirX: 1,
    dirY: 0,
    soundEnabled: true,
    soundType: 'tick'
  })
  assert.strictEqual(r.speed, 50)
  assert.strictEqual(r.radius, 30)
  assert.strictEqual(r.paused, false)
  assert.strictEqual(r.colorBall, '#ff0000')
  assert.strictEqual(r.colorBg, '#000000')
  assert.strictEqual(r.dirX, 1)
  assert.strictEqual(r.dirY, 0)
  assert.strictEqual(r.soundEnabled, true)
  assert.strictEqual(r.soundType, 'tick')
})

// --- validateBouncePayload ---
console.log('\n--- validateBouncePayload ---')

test('returns null for null input', () => {
  assert.strictEqual(ValidationUtils.validateBouncePayload(null), null)
})

test('validates full bounce payload', () => {
  const r = ValidationUtils.validateBouncePayload({
    side: 'left',
    x: 100,
    y: 200,
    dirX: 1,
    dirY: 0,
    timestamp: Date.now()
  })
  assert.strictEqual(r.side, 'left')
  assert.strictEqual(r.x, 100)
  assert.strictEqual(r.y, 200)
  assert.strictEqual(r.dirX, 1)
  assert.strictEqual(r.dirY, 0)
})

test('rejects invalid side', () => {
  const r = ValidationUtils.validateBouncePayload({ side: 'middle', x: 1 })
  assert.strictEqual(r.side, undefined)
  assert.strictEqual(r.x, 1)
})

test('rejects NaN x', () => {
  const r = ValidationUtils.validateBouncePayload({ x: NaN, y: 1 })
  assert.strictEqual(r.x, undefined)
  assert.strictEqual(r.y, 1)
})

test('rejects dirX > 1', () => {
  const r = ValidationUtils.validateBouncePayload({ dirX: 2, x: 1 })
  assert.strictEqual(r.dirX, undefined)
  assert.strictEqual(r.x, 1)
})

test('rejects timestamp <= 0', () => {
  const r = ValidationUtils.validateBouncePayload({ timestamp: -1, x: 1 })
  assert.strictEqual(r.timestamp, undefined)
  assert.strictEqual(r.x, 1)
})

test('returns null for empty object', () => {
  assert.strictEqual(ValidationUtils.validateBouncePayload({}), null)
})

// --- validateSessionId ---
console.log('\n--- validateSessionId ---')

test('accepts valid alphanumeric 6-char id', () => {
  assert.strictEqual(ValidationUtils.validateSessionId('abc123'), true)
})

test('accepts 3-char minimum', () => {
  assert.strictEqual(ValidationUtils.validateSessionId('abc'), true)
})

test('accepts 64-char maximum', () => {
  const id = 'a'.repeat(64)
  assert.strictEqual(ValidationUtils.validateSessionId(id), true)
})

test('rejects 2-char id (too short)', () => {
  assert.strictEqual(ValidationUtils.validateSessionId('ab'), false)
})

test('rejects 65-char id (too long)', () => {
  const id = 'a'.repeat(65)
  assert.strictEqual(ValidationUtils.validateSessionId(id), false)
})

test('accepts dash and underscore', () => {
  assert.strictEqual(ValidationUtils.validateSessionId('my-session_1'), true)
})

test('rejects spaces', () => {
  assert.strictEqual(ValidationUtils.validateSessionId('my session'), false)
})

test('rejects special chars', () => {
  assert.strictEqual(ValidationUtils.validateSessionId('test!@#'), false)
})

test('rejects non-string', () => {
  assert.strictEqual(ValidationUtils.validateSessionId(123), false)
})

test('rejects empty string', () => {
  assert.strictEqual(ValidationUtils.validateSessionId(''), false)
})

// --- validateScreenSize ---
console.log('\n--- validateScreenSize ---')

test('validates valid screen size', () => {
  const r = ValidationUtils.validateScreenSize({ width: 1920, height: 1080 })
  assert.deepStrictEqual(r, { width: 1920, height: 1080 })
})

test('accepts string numbers (parseInt)', () => {
  const r = ValidationUtils.validateScreenSize({
    width: '1920',
    height: '1080'
  })
  assert.deepStrictEqual(r, { width: 1920, height: 1080 })
})

test('rejects null', () => {
  assert.strictEqual(ValidationUtils.validateScreenSize(null), null)
})

test('rejects width 0', () => {
  assert.strictEqual(
    ValidationUtils.validateScreenSize({ width: 0, height: 100 }),
    null
  )
})

test('rejects height 0', () => {
  assert.strictEqual(
    ValidationUtils.validateScreenSize({ width: 100, height: 0 }),
    null
  )
})

test('rejects width > 10000', () => {
  assert.strictEqual(
    ValidationUtils.validateScreenSize({ width: 10001, height: 100 }),
    null
  )
})

test('rejects negative dimensions', () => {
  assert.strictEqual(
    ValidationUtils.validateScreenSize({ width: -100, height: 100 }),
    null
  )
})

test('rejects NaN dimensions', () => {
  assert.strictEqual(
    ValidationUtils.validateScreenSize({ width: 'abc', height: 100 }),
    null
  )
})

// --- Summary ---
console.log(`\n${'='.repeat(50)}`)
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`)
if (failed > 0) process.exit(1)
