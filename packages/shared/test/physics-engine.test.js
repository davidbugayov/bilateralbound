'use strict'
/**
 * Unit tests for physics-engine
 * Run: node packages/shared/test/physics-engine.test.js
 */

const assert = require('assert')
const PhysicsEngine = require('../physics-engine')

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

function approxEqual(a, b, eps = 0.01) {
  return Math.abs(a - b) < eps
}

// ============================================
console.log('\n🔧 PhysicsEngine Unit Tests\n')

// --- Construction ---
test('creates engine with default options', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  assert.strictEqual(engine.state.paused, true)
  assert.strictEqual(engine.ball.x, engine.centerX)
  assert.strictEqual(engine.ball.y, engine.centerY)
  assert.strictEqual(engine.ball.radius, 40)
})

test('creates engine with custom world size', () => {
  const engine = new PhysicsEngine({
    worldWidth: 1000,
    worldHeight: 800,
    isViewer: true
  })
  assert.strictEqual(engine.options.worldWidth, 1000)
  assert.strictEqual(engine.options.worldHeight, 800)
  assert.strictEqual(engine.centerX, 500)
  assert.strictEqual(engine.centerY, 400)
})

// --- Paused state ---
test('ball stays at center when paused', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.update(100)
  assert.strictEqual(engine.ball.x, engine.centerX)
  assert.strictEqual(engine.ball.y, engine.centerY)
})

test('setPaused(true) stops ball', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ paused: false, speed: 100, dirX: 1, dirY: 0 })
  engine.update(16)
  const movingX = engine.ball.x
  assert.ok(movingX !== engine.centerX, 'Ball should be moving')
  engine.applyCommand({ paused: true })
  assert.strictEqual(engine.state.paused, true)
})

// --- Direction ---
test('horizontal direction moves ball on X axis only', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ paused: false, speed: 100, dirX: 1, dirY: 0 })
  const startY = engine.ball.y
  engine.update(100)
  assert.ok(engine.ball.x !== engine.centerX, 'X should change')
  assert.strictEqual(engine.ball.y, startY, 'Y should not change')
})

test('vertical direction moves ball on Y axis only', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ paused: false, speed: 100, dirX: 0, dirY: 1 })
  const startX = engine.ball.x
  engine.update(100)
  assert.ok(engine.ball.y !== engine.centerY, 'Y should change')
  assert.strictEqual(engine.ball.x, startX, 'X should not change')
})

// --- Speed ---
test('higher speed produces more displacement at short interval', () => {
  const engine1 = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  const engine2 = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  // Use low speeds to avoid bouncing within the first frame
  engine1.applyCommand({ paused: false, speed: 10, dirX: 1, dirY: 0 })
  engine2.applyCommand({ paused: false, speed: 30, dirX: 1, dirY: 0 })
  // Single small delta to get exactly 1 physics step
  engine1.update(17)
  engine2.update(17)
  const d1 = Math.abs(engine1.ball.x - engine1.centerX)
  const d2 = Math.abs(engine2.ball.x - engine2.centerX)
  assert.ok(
    d2 > d1,
    `Higher speed should produce more displacement: d1=${d1}, d2=${d2}`
  )
})

// --- Bounce ---
test('ball bounces off left wall', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    isViewer: true
  })
  engine.applyCommand({ paused: false, speed: 5000, dirX: -1, dirY: 0 })
  for (let i = 0; i < 30; i++) {
    engine.update(16)
  }
  assert.ok(
    engine.ball.x >= engine.ball.radius,
    `Ball should not pass left wall: x=${engine.ball.x}`
  )
})

test('ball bounces off right wall', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    isViewer: true
  })
  engine.applyCommand({ paused: false, speed: 5000, dirX: 1, dirY: 0 })
  for (let i = 0; i < 30; i++) {
    engine.update(16)
  }
  const maxX = engine.options.worldWidth - engine.ball.radius
  assert.ok(
    engine.ball.x <= maxX,
    `Ball should not pass right wall: x=${engine.ball.x}, max=${maxX}`
  )
})

test('ball stays within vertical bounds after bounce', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    isViewer: true
  })
  engine.applyCommand({ paused: false, speed: 5000, dirX: 0, dirY: 1 })
  for (let i = 0; i < 30; i++) {
    engine.update(16)
  }
  const yMax = engine._getTrackBandYMax() - engine.ball.radius
  assert.ok(
    engine.ball.y <= yMax,
    `Ball should not pass bottom: y=${engine.ball.y}, max=${yMax}`
  )
})

// --- Hard clamp (boundary collision fix) ---
test('ball never leaves screen at extreme speed', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    isViewer: true
  })
  engine.applyCommand({ paused: false, speed: 10000, dirX: 1, dirY: 0.7 })
  for (let i = 0; i < 60; i++) {
    engine.update(16)
  }
  assert.ok(
    engine.ball.x >= engine.ball.radius,
    `Ball X below min: ${engine.ball.x}`
  )
  assert.ok(
    engine.ball.x <= engine.options.worldWidth - engine.ball.radius,
    `Ball X above max: ${engine.ball.x}`
  )
  const yMin = engine._getTrackBandYMin() + engine.ball.radius
  const yMax = engine._getTrackBandYMax() - engine.ball.radius
  assert.ok(engine.ball.y >= yMin, `Ball Y below min: ${engine.ball.y}`)
  assert.ok(engine.ball.y <= yMax, `Ball Y above max: ${engine.ball.y}`)
})

// --- SeekCenter (pause animation) ---
test('seekingCenter triggers on pause in viewer mode', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ paused: false, speed: 100, dirX: 1, dirY: 0 })
  engine.update(100)
  assert.ok(engine.ball.x !== engine.centerX, 'Ball should be off-center')
  engine.applyCommand({ paused: true, returnToCenter: true })
  assert.strictEqual(engine.state.paused, true)
  assert.strictEqual(
    engine.state.seekingCenter,
    true,
    'seekingCenter should be true'
  )
})

test('seekingCenter starts on pause with returnToCenter', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ paused: false, speed: 100, dirX: 1, dirY: 0 })
  engine.update(17)
  const distBefore = Math.abs(engine.ball.x - engine.centerX)
  assert.ok(
    distBefore > 10,
    `Ball should be far from center: dist=${distBefore}`
  )
  engine.applyCommand({ paused: true, returnToCenter: true })
  assert.strictEqual(
    engine.state.seekingCenter,
    true,
    'seekingCenter should be true on pause'
  )
})

test('return-to-center speed matches user-selected speed', () => {
  const makeReturning = (speed) => {
    const engine = new PhysicsEngine({ isViewer: true })
    engine.ball.speed = speed
    engine.ball.x = 200
    engine.ball.y = engine.centerY
    engine.applyCommand({ paused: true, returnToCenter: true })
    assert.strictEqual(
      engine.state.seekingCenter,
      true,
      'seekingCenter should start'
    )
    return engine
  }

  const fast = makeReturning(100) // pps = maxSpeed
  const slow = makeReturning(5) // pps = 5% of maxSpeed

  // 20 fixed steps (~333ms): fast must be closer to center than slow
  for (let i = 0; i < 20; i++) {
    fast.update(1 / 60)
    slow.update(1 / 60)
  }
  const fastDist = Math.abs(fast.centerX - fast.ball.x)
  const slowDist = Math.abs(slow.centerX - slow.ball.x)
  assert.ok(
    fastDist < slowDist,
    `Faster ball should be closer to center: fast=${fastDist.toFixed(1)}, slow=${slowDist.toFixed(1)}`
  )
})

test('return-to-center moves smoothly without jumps', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.ball.speed = 10 // pps = 500 → below deceleration zone for this distance
  engine.ball.x = 50
  engine.ball.y = engine.centerY
  engine.applyCommand({ paused: true, returnToCenter: true })
  const pps = (10 / 100) * engine.options.maxSpeed
  const maxStep = pps * (1 / 60) * 1.01
  let prevX = engine.ball.x
  for (let i = 0; i < 30; i++) {
    engine.update(1 / 60)
    const step = Math.abs(engine.ball.x - prevX)
    assert.ok(
      step <= maxStep,
      `Step ${step.toFixed(2)} exceeds max movement ${maxStep.toFixed(2)} (teleport/jerk)`
    )
    prevX = engine.ball.x
  }
})

test('return-to-center reaches center and stops seeking', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.ball.speed = 50
  engine.ball.x = 100
  engine.ball.y = engine.centerY
  engine.applyCommand({ paused: true, returnToCenter: true })
  for (let i = 0; i < 120; i++) {
    engine.update(1 / 60)
  }
  assert.ok(
    Math.abs(engine.ball.x - engine.centerX) <=
      engine.options.centerSnapThreshold + 0.5,
    `Ball should reach center: x=${engine.ball.x}`
  )
  assert.strictEqual(engine.state.seekingCenter, false, 'seeking should end')
})

// --- Determinism ---
// Determinism is tested in E2E sync tests — performance.now() based
// bounce detection makes frame-perfect unit comparison unreliable.
// --- Radius ---
test('radius change updates ball size', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ radius: 60 })
  assert.strictEqual(engine.ball.radius, 60)
})

test('radius clamped to max', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ radius: 10000 })
  assert.ok(
    engine.ball.radius <= 1000,
    `Radius should be clamped: ${engine.ball.radius}`
  )
})

// --- Colors ---
test('color change updates ball color', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ colorBall: '#ff0000' })
  assert.strictEqual(engine.colors.ball, '#ff0000')
})

test('invalid color is rejected', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  const before = engine.colors.ball
  engine.applyCommand({ colorBall: 'not-a-color' })
  assert.strictEqual(
    engine.colors.ball,
    before,
    'Invalid color should be ignored'
  )
})

// --- Reset ---
test('reset returns ball to center', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ paused: false, speed: 200, dirX: 1, dirY: 0 })
  engine.update(100)
  assert.ok(engine.ball.x !== engine.centerX)
  engine.applyCommand({ reset: true })
  assert.ok(
    approxEqual(engine.ball.x, engine.centerX, 1),
    `Ball should be at center after reset: x=${engine.ball.x}`
  )
})

// --- Brainspotting mode ---
console.log('\n🧠 Brainspotting Tests\n')

test('brainspotting defaults to false', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  assert.strictEqual(engine.ball.brainspotting, false)
})

test('applyCommand enables brainspotting mode', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true })
  assert.strictEqual(engine.ball.brainspotting, true)
})

test('brainspotting and infinity are mutually exclusive', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true })
  assert.strictEqual(engine.ball.brainspotting, true)
  assert.strictEqual(engine.ball.infinity, false)
  engine.applyCommand({ infinity: true })
  assert.strictEqual(engine.ball.infinity, true)
  assert.strictEqual(engine.ball.brainspotting, false)
})

test('entering infinity disables brainspotting', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true })
  assert.strictEqual(engine.ball.brainspotting, true)
  engine.applyCommand({ infinity: true })
  assert.strictEqual(engine.ball.brainspotting, false)
  assert.strictEqual(engine.ball.infinity, true)
})

test('brainspotting chase moves ball toward cursor target smoothly', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true, paused: false })
  engine.ball.x = 400
  engine.ball.y = 300
  engine.setBrainspottingTarget(600, 300)

  // A few steps: ball must move toward target but not teleport or overshoot
  engine.update(1 / 60)
  const x1 = engine.ball.x
  assert.ok(x1 > 400 && x1 < 600, `Ball should be between start and target: x=${x1}`)
  assert.ok(
    x1 < 500,
    `Ball should not overshoot halfway on first step: x=${x1}`
  )
  // Continues toward target
  engine.update(1 / 60)
  engine.update(1 / 60)
  assert.ok(engine.ball.x > x1, 'Ball should keep moving toward target')
})

test('brainspotting chase reaches target and clears it', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true, paused: false })
  engine.ball.x = 400
  engine.ball.y = 300
  engine.setBrainspottingTarget(600, 300)
  for (let i = 0; i < 120; i++) {
    engine.update(1 / 60)
  }
  assert.ok(
    Math.abs(engine.ball.x - 600) <= 1,
    `Ball should reach target x: ${engine.ball.x}`
  )
  assert.strictEqual(engine._bsTarget, null, 'Target should be cleared on arrival')
})

test('brainspotting chase is cleared when mode is exited', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true, paused: false })
  engine.setBrainspottingTarget(600, 300)
  assert.ok(engine._bsTarget, 'Target should be set while in brainspotting')
  engine.applyCommand({ brainspotting: false })
  assert.strictEqual(engine._bsTarget, null, 'Target must be cleared on exit')
})

test('entering brainspotting disables infinity', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ infinity: true })
  assert.strictEqual(engine.ball.infinity, true)
  engine.applyCommand({ brainspotting: true })
  assert.strictEqual(engine.ball.brainspotting, true)
  assert.strictEqual(engine.ball.infinity, false)
})

test('ball stays at manual position in brainspotting mode (viewer)', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  const targetX = 300
  const targetY = 200
  engine.applyCommand({ brainspotting: true })
  engine.setPosition(targetX, targetY)
  for (let i = 0; i < 10; i++) {
    engine.update(16)
  }
  assert.ok(
    approxEqual(engine.ball.x, targetX, 0.5),
    `Ball X should stay at ${targetX}, got ${engine.ball.x}`
  )
  assert.ok(
    approxEqual(engine.ball.y, targetY, 0.5),
    `Ball Y should stay at ${targetY}, got ${engine.ball.y}`
  )
})

test('ball stays at manual position in brainspotting mode (server)', () => {
  const engine = new PhysicsEngine({
    isViewer: false,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  const targetX = 500
  const targetY = 100
  engine.applyCommand({ brainspotting: true, paused: false })
  engine.setPosition(targetX, targetY)
  for (let i = 0; i < 10; i++) {
    engine.update(16)
  }
  assert.ok(
    approxEqual(engine.ball.x, targetX, 0.5),
    `Server ball X should stay at ${targetX}, got ${engine.ball.x}`
  )
  assert.ok(
    approxEqual(engine.ball.y, targetY, 0.5),
    `Server ball Y should stay at ${targetY}, got ${engine.ball.y}`
  )
})

test('brainspotting ball does not move even with speed and direction set', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  engine.applyCommand({
    brainspotting: true,
    paused: false,
    speed: 100,
    dirX: 1,
    dirY: 0
  })
  engine.setPosition(400, 300)
  const startX = engine.ball.x
  const startY = engine.ball.y
  for (let i = 0; i < 30; i++) {
    engine.update(16)
  }
  assert.ok(
    approxEqual(engine.ball.x, startX, 0.5),
    `Ball should not move in brainspotting, X: ${engine.ball.x}`
  )
  assert.ok(
    approxEqual(engine.ball.y, startY, 0.5),
    `Ball should not move in brainspotting, Y: ${engine.ball.y}`
  )
})

test('moving ball stops when brainspotting is enabled', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  engine.applyCommand({ paused: false, speed: 100, dirX: 1, dirY: 0 })
  engine.update(100)
  const movingX = engine.ball.x
  assert.ok(
    movingX !== engine.centerX,
    'Ball should be moving before brainspotting'
  )
  engine.applyCommand({ brainspotting: true })
  const posAfterEnable = { x: engine.ball.x, y: engine.ball.y }
  for (let i = 0; i < 10; i++) {
    engine.update(16)
  }
  assert.ok(
    approxEqual(engine.ball.x, posAfterEnable.x, 0.5),
    'Ball should freeze after brainspotting enabled'
  )
  assert.ok(
    approxEqual(engine.ball.y, posAfterEnable.y, 0.5),
    'Ball should freeze after brainspotting enabled'
  )
})

test('brainspotting mode is included in getState', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true })
  const state = engine.getState()
  assert.strictEqual(state.brainspotting, true)
  assert.strictEqual(state.infinity, false)
})

test('reset clears brainspotting mode', () => {
  const engine = new PhysicsEngine({ isViewer: true })
  engine.applyCommand({ brainspotting: true })
  assert.strictEqual(engine.ball.brainspotting, true)
  engine.applyCommand({ reset: true })
  assert.strictEqual(engine.ball.brainspotting, false)
  assert.strictEqual(engine.ball.infinity, false)
})

test('setPosition works in brainspotting mode', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  engine.applyCommand({ brainspotting: true })
  engine.setPosition(100, 500)
  assert.strictEqual(engine.ball.x, 100)
  assert.strictEqual(engine.ball.y, 500)
  engine.setPosition(700, 50)
  assert.strictEqual(engine.ball.x, 700)
  assert.strictEqual(engine.ball.y, 50)
})

test('brainspotting ball clamped within bounds', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  engine.applyCommand({ brainspotting: true })
  engine.setPosition(-100, -100)
  assert.ok(
    engine.ball.x >= engine.ball.radius,
    `X should be clamped: ${engine.ball.x}`
  )
  assert.ok(
    engine.ball.y >= engine.ball.radius,
    `Y should be clamped: ${engine.ball.y}`
  )
  engine.setPosition(900, 700)
  assert.ok(
    engine.ball.x <= 800 - engine.ball.radius,
    `X should be clamped: ${engine.ball.x}`
  )
  assert.ok(
    engine.ball.y <= 600 - engine.ball.radius,
    `Y should be clamped: ${engine.ball.y}`
  )
})

test('exiting brainspotting via applyCommand with brainspotting: false resumes movement', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  engine.applyCommand({
    brainspotting: true,
    paused: false,
    speed: 100,
    dirX: 1,
    dirY: 0
  })
  engine.setPosition(400, 300)
  for (let i = 0; i < 5; i++) engine.update(16)
  const frozenX = engine.ball.x
  assert.ok(approxEqual(frozenX, 400, 0.5), 'Ball should be frozen in BSP')
  engine.applyCommand({
    brainspotting: false,
    paused: false,
    dirX: 1,
    dirY: 0
  })
  for (let i = 0; i < 30; i++) engine.update(16)
  assert.ok(
    engine.ball.x !== frozenX,
    `Ball should move after exiting BSP, X: ${engine.ball.x} (was ${frozenX})`
  )
})

test('exiting brainspotting via applyCommand with dirX/dirY but no brainspotting:false still freezes', () => {
  const engine = new PhysicsEngine({
    isViewer: true,
    worldWidth: 800,
    worldHeight: 600
  })
  engine.setWorldSize(800, 600)
  engine.applyCommand({
    brainspotting: true,
    paused: false,
    speed: 100,
    dirX: 1,
    dirY: 0
  })
  engine.setPosition(400, 300)
  // Simulate the old bug: dirX/dirY sent without brainspotting: false
  engine.applyCommand({ dirX: 1, dirY: 0, paused: false })
  for (let i = 0; i < 30; i++) engine.update(16)
  assert.ok(
    approxEqual(engine.ball.x, 400, 0.5),
    `Ball should still be frozen if brainspotting not set to false, X: ${engine.ball.x}`
  )
})

// ============================================
console.log('\n========================================')
console.log(`Пройдено: ${passed}/${passed + failed}`)
if (failed > 0) {
  console.log(`Провалено: ${failed}`)
  process.exit(1)
}
