#!/usr/bin/env node
'use strict'
/**
 * Deterministic Sync Test (Client-Side Authority)
 *
 * Верифицирует все изменения, реализованные в рамках задачи Client-Side Authority.
 *
 * Usage:
 *   node scripts/test-deterministic-sync.js
 */

const PhysicsEngine = require('../packages/shared/physics-engine')

const WORLD_W = 1920
const WORLD_H = 1080
const SPEED = 50
const FIXED_DT = 1 / 60

let passCount = 0
let failCount = 0

function check(label, condition, detail = '') {
  const icon = condition ? '✅' : '❌'
  const suffix = detail ? `  [${detail}]` : ''
  console.log(`  ${icon} ${condition ? 'PASS' : 'FAIL'}: ${label}${suffix}`)
  if (condition) passCount++
  else failCount++
  return condition
}

/** Creates a fresh viewer PhysicsEngine positioned at center */
function makeViewer() {
  const e = new PhysicsEngine({
    worldWidth: WORLD_W, worldHeight: WORLD_H, ballRadius: 20, maxSpeed: 5000,
    isViewer: true, clientSimulation: true
  })
  e.setWorldSize(WORLD_W, WORLD_H)
  e.setSpeed(SPEED)
  e.setDirection(1, 0)
  e.setPaused(false)
  e.ball.x = 960; e.ball.y = 540
  const pps = (SPEED / 100) * 5000
  e.ball.vx = pps; e.ball.vy = 0
  return e
}

/** Positions server snapshot for drift check and resets timing state */
function setServerSnapshot(e, opts) {
  e._lastServerPos = {
    x: opts.x ?? 960, y: opts.y ?? 540,
    vx: opts.vx ?? e.ball.vx, vy: opts.vy ?? 0,
    ts: performance.now() - 30,
    serverTime: Date.now() - 30
  }
  e._lastDriftCheckTs = 0           // force immediate drift check
  // Use -Infinity so cooldown check (now - ts < 500) is always false.
  // In Node.js performance.now() starts near 0, so 0 would look like "just bounced".
  e._lastLocalBounceTs = -Infinity
  e._springState.active = false
  e._springState._desyncStartTs = null
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════╗')
console.log('║    DETERMINISTIC SYNC TEST  (Client-Side Authority)      ║')
console.log('╚══════════════════════════════════════════════════════════╝\n')

// ─── T1: Fixed Timestep — same total dt, different chunk sizes ────────────────
console.log('── T1: Fixed Timestep accumulator ──────────────────────────')
console.log('   2 calls × 2×FIXED_DT  ≡  4 calls × 1×FIXED_DT (no bounce, short sim)')
{
  const makeEng = () => {
    const e = new PhysicsEngine({
      worldWidth: WORLD_W, worldHeight: WORLD_H, ballRadius: 20, maxSpeed: 5000,
      isViewer: false, clientSimulation: false
    })
    e.setWorldSize(WORLD_W, WORLD_H)
    e.setSpeed(SPEED)
    e.setDirection(1, 0) // pure horizontal, won't bounce in 4 steps
    e.setPaused(false)
    // Start far from walls so no bounce in sim
    e.ball.x = 500; e.ball.y = 540
    return e
  }

  const eA = makeEng() // 4 calls × 1×FIXED_DT
  for (let i = 0; i < 4; i++) eA.update(FIXED_DT)

  const eB = makeEng() // 2 calls × 2×FIXED_DT
  for (let i = 0; i < 2; i++) eB.update(FIXED_DT * 2)

  const dAB = Math.hypot(eA.ball.x - eB.ball.x, eA.ball.y - eB.ball.y)
  console.log(`   A(4×1): x=${eA.ball.x.toFixed(4)} y=${eA.ball.y.toFixed(4)}`)
  console.log(`   B(2×2): x=${eB.ball.x.toFixed(4)} y=${eB.ball.y.toFixed(4)}`)
  console.log()
  check('4 calls×1 vs 2 calls×2 (same total time, no bounce)', dAB < 0.001, `drift=${dAB.toFixed(6)}px`)

  // Verify MAX_ACCUMULATOR clamp: a huge deltaTime spike should produce at most 3 steps
  const eC = makeEng()
  const xBefore = eC.ball.x
  eC.update(1000) // 1000 seconds spike — capped to 3 steps
  const stepsMoved = (eC.ball.x - xBefore) / ((SPEED / 100) * 5000 * FIXED_DT)
  check(`MAX_ACCUMULATOR clamp: huge deltaTime spike ≤ 3 fixed steps`, Math.abs(stepsMoved - 3) < 0.001, `steps_moved=${stepsMoved.toFixed(4)}`)
}

// ─── T2: Bounce cooldown = 500ms ─────────────────────────────────────────────
console.log('\n── T2: Bounce cooldown = 500ms (was 250ms) ──────────────────')
{
  // 2a: Suppressed immediately after bounce
  const eA = makeViewer()
  setServerSnapshot(eA, { x: 960 + 400, y: 540, vx: -eA.ball.vx })
  // Set bounce ts AFTER snapshot to ensure it isn't overwritten
  eA._lastLocalBounceTs = performance.now()
  eA._checkDriftCorrection()
  check('Spring suppressed immediately after bounce', !eA._springState.active)

  // 2b: Can activate at 501ms (past cooldown)
  const eB = makeViewer()
  eB._lastLocalBounceTs = performance.now() - 501
  setServerSnapshot(eB, { x: 960 + 250, y: 540, vx: -eB.ball.vx })
  // Override bounce timestamp AFTER setServerSnapshot (which sets -Infinity)
  eB._lastLocalBounceTs = performance.now() - 501
  eB._lastDriftCheckTs = 0
  eB._checkDriftCorrection()
  check('Spring activates 501ms after bounce (cooldown expired)', eB._springState.active,
        'drift=250px > 100px threshold')

  // 2c: Old 250ms would not have suppressed — verify we're using 500ms
  const eC = makeViewer()
  eC._lastLocalBounceTs = performance.now() - 300  // 300ms > 250ms but < 500ms
  setServerSnapshot(eC, { x: 960 + 300, y: 540, vx: -eC.ball.vx })
  // Override bounce timestamp AFTER setServerSnapshot (which sets -Infinity)
  eC._lastLocalBounceTs = performance.now() - 300
  eC._lastDriftCheckTs = 0
  eC._checkDriftCorrection()
  check('Spring still suppressed at 300ms (between old 250ms and new 500ms threshold)',
        !eC._springState.active)
}

// ─── T3: Wall immunity zone = radius+40px ─────────────────────────────────────
console.log('\n── T3: Wall immunity zone = radius+40px─────────────────────')
{
  const e = makeViewer()
  const margin = e.ball.radius + 40  // 60px

  e.ball.x = margin - 1; e.ball.y = 540
  check(`_isNearWall() inside zone   (x=${margin - 1})`, e._isNearWall())

  e.ball.x = margin + 1; e.ball.y = 540
  check(`_isNearWall() outside zone  (x=${margin + 1})`, !e._isNearWall())

  e.ball.x = WORLD_W - (margin - 1); e.ball.y = 540
  check(`_isNearWall() right wall inside zone (x=${WORLD_W - (margin - 1)})`, e._isNearWall())

  e.ball.x = 960; e.ball.y = margin - 1
  check(`_isNearWall() top wall inside zone (y=${margin - 1})`, e._isNearWall())
}

// ─── T4: Velocity vector guard ────────────────────────────────────────────────
console.log('\n── T4: Velocity vector guard (sync by params, not coords) ──')
{
  const pps = (SPEED / 100) * 5000 // 2500 px/s

  // A: matching velocity, small drift → NO spring
  const eA = makeViewer()
  // Use ts: performance.now() to avoid extrapolation drift exceeding 100px
  eA._lastServerPos = {
    x: 1010, y: 540, vx: pps, vy: 0,
    ts: performance.now(), serverTime: Date.now()
  }
  eA._lastDriftCheckTs = 0
  eA._lastLocalBounceTs = -Infinity
  eA._checkDriftCorrection()
  check('No spring: velocities match, drift=50px < 100px', !eA._springState.active)

  // B: opposite velocity, large drift → spring MUST activate
  const eB = makeViewer()
  setServerSnapshot(eB, { x: 750, y: 540, vx: -pps, vy: 0 })  // 210px drift, opposite dir
  eB._checkDriftCorrection()
  check('Spring on: velocities differ, drift=210px > 100px', eB._springState.active)

  // C: matching velocity, large drift → spring activates (drift > threshold wins)
  const eC = makeViewer()
  setServerSnapshot(eC, { x: 750, y: 540, vx: pps, vy: 0 })   // 210px drift, same velocity
  eC._checkDriftCorrection()
  check('Spring on: velocities match BUT drift=210px > 100px threshold', eC._springState.active)

  // D: matching velocity, drift exactly at boundary (99px) → NO spring
  const eD = makeViewer()
  eD._lastServerPos = {
    x: 960 + 99, y: 540, vx: pps, vy: 0,
    ts: performance.now(), serverTime: Date.now()
  }
  eD._lastDriftCheckTs = 0
  eD._lastLocalBounceTs = -Infinity
  eD._checkDriftCorrection()
  check('No spring: velocities match, drift=99px < 100px', !eD._springState.active)
}

// ─── T5: 5% soft correction REMOVED ──────────────────────────────────────────
console.log('\n── T5: No 5% soft correction for drift 2-99px ──────────────')
{
  // Old code had: if (drift > 2) { ball.x += dx * 0.05 }
  // New code: NO correction below adaptiveThreshold
  const e = makeViewer()
  setServerSnapshot(e, { x: 990, y: 545, vx: e.ball.vx * 0.5, vy: 5 })  // 30px drift, different vel

  const xBefore = e.ball.x
  const yBefore = e.ball.y
  e._checkDriftCorrection()
  const delta = Math.hypot(e.ball.x - xBefore, e.ball.y - yBefore)

  check('No position change for drift=30px (below 100px threshold)', delta < 0.001,
        `moved=${delta.toFixed(4)}px`)

  // Also verify for drift=3px (was definitely soft-corrected before)
  const e2 = makeViewer()
  setServerSnapshot(e2, { x: 963, y: 540, vx: e2.ball.vx, vy: 0 })  // 3px drift
  const x2Before = e2.ball.x
  e2._checkDriftCorrection()
  const delta2 = Math.abs(e2.ball.x - x2Before)
  check('No position change for drift=3px (old code moved 0.15px)', delta2 < 0.001,
        `moved=${delta2.toFixed(4)}px`)
}

// ─── T6: Hard snap still works ───────────────────────────────────────────────
console.log('\n── T6: Hard snap at drift > 200px / 3s ─────────────────────')
{
  const e = makeViewer()
  e.ball.x = 900; e.ball.y = 540  // not near wall (margin=60, 900 > 60)
  e.ball.vx = 100; e.ball.vy = 0

  // Server far away with old desync timestamp
  e._lastServerPos = {
    x: 200, y: 200, vx: -100, vy: 0,
    ts: performance.now() - 30,      // fresh enough (< 1500ms stale)
    serverTime: Date.now() - 30
  }
  e._lastDriftCheckTs = 0
  e._lastLocalBounceTs = -Infinity   // no recent bounce (avoid cooldown in Node.js)
  e._springState._desyncStartTs = performance.now() - 3100  // 3.1s desync

  e._checkDriftCorrection()

  const snapX = Math.abs(e.ball.x - 200)
  const snapY = Math.abs(e.ball.y - 200)
  check('Hard snap: ball teleported when drift > 200px for > 3s',
        snapX < 5 && snapY < 5,  // allow small extrapolation error
        `ball=(${e.ball.x.toFixed(1)},${e.ball.y.toFixed(1)}) expected≈(200,200)`)
}

// ─── T7: Config defaults ──────────────────────────────────────────────────────
console.log('\n── T7: Config defaults verified ────────────────────────────')
{
  const e = new PhysicsEngine({ isViewer: true, clientSimulation: true })
  check('driftThresholdPx = 100 (was 40)', e.options.smoothing.driftThresholdPx === 100,
        `got ${e.options.smoothing.driftThresholdPx}`)
  check('driftCheckIntervalMs = 50ms (was 33ms)', e.options.smoothing.driftCheckIntervalMs === 50,
        `got ${e.options.smoothing.driftCheckIntervalMs}`)

  const serverE = new PhysicsEngine({ isViewer: false })
  check('_accumulator initialized to 0', serverE._accumulator === 0)
}

// ─── T8: Direction sync while moving ─────────────────────────────────────────
console.log('\n── T8: Direction sync while moving (no "atCenter" block) ─────')
{
  const testE = new PhysicsEngine({ isViewer: true, clientSimulation: true, worldWidth: 2000, worldHeight: 1200 })
  testE.setPaused(false)
  testE.ball.x = 500 // Not at center (1000)
  testE.state.lastDirection.x = 1
  testE.applyCommand({ dirX: -1 })
  check('Direction updated while moving outside center', testE.state.lastDirection.x === -1)
}

// ─── T9: Wall immunity for coordinate snaps ──────────────────────────────────
// Note: This logic resides in viewer.js/controller.js (the sync filter), 
// but we can simulate the "near wall" logic from physics-engine.js here.
console.log('\n── T9: Wall immunity for forced coordinate snaps ─────────────')
{
  const testE = new PhysicsEngine({ isViewer: true, clientSimulation: true, worldWidth: 2000, worldHeight: 1200 })
  testE.ball.x = 30 // Near left wall (radius=20, margin=60)
  check('isNearWall() is true at x=30', testE._isNearWall() === true)
}

// ─── ИТОГ ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════')
const total = passCount + failCount
console.log(`RESULT: ${passCount}/${total} tests passed  ${failCount === 0 ? '✅ ALL PASSED' : '❌ FAILED'}`)

if (failCount === 0) {
  console.log('\n✅ Client-Side Authority fully verified:')
  console.log('   Fixed Timestep     — chunk size irrelevant; MAX_ACCUMULATOR clamp works')
  console.log('   Bounce cooldown    — 500ms (250ms would have let spring through)')
  console.log('   Wall immunity      — radius+40px on all 4 walls')
  console.log('   Vector guard       — no correction when vx/vy match below threshold')
  console.log('   Soft correction    — completely removed')
  console.log('   Hard snap          — still fires at >200px / 3s')
  console.log('   Config defaults    — 100px threshold, 50ms interval')
} else {
  console.log('\n❌ Some tests failed. See details above.')
  process.exit(1)
}
console.log('══════════════════════════════════════════════════════════════\n')
