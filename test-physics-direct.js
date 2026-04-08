#!/usr/bin/env node
/**
 * Direct physics engine test - verify direction changes on bounce
 */

'use strict'

const PhysicsEngine = require('./packages/shared/physics-engine')

console.log('\n🧪 Testing PhysicsEngine bidirectional bounce\n')

// Create engine with horizontal movement
const engine = new PhysicsEngine({
  worldWidth: 800,
  worldHeight: 600,
  ballRadius: 20,
  maxSpeed: 5000
})

// Must set world size for physics to work
engine.setWorldSize(800, 600)

// Set initial horizontal direction
engine.setDirection(1, 0) // Moving RIGHT
engine.setPaused(false)
engine.setSpeed(30)

console.log(`📍 Initial state:`)
console.log(`   Direction: dirX=${engine.state.lastDirection.x}, dirY=${engine.state.lastDirection.y}`)
console.log(`   Position: x=${engine.ball.x}, y=${engine.ball.y}`)

const initialDir = { ...engine.state.lastDirection }

// Simulate physics until we hit right wall
let bounceCount = 0
const maxIterations = 10000
const dt = 1 / 60 // 60 FPS
let lastPrintedX = engine.ball.x

for (let i = 0; i < maxIterations; i++) {
  engine.update(dt)

  // Print progress every 500 iterations
  if (i % 500 === 0) {
    console.log(`   [${i}] x=${engine.ball.x.toFixed(0)}, dirX=${engine.state.lastDirection.x.toFixed(2)}, vx=${engine.ball.vx.toFixed(0)}`)
  }

  // Check if we bounced (direction changed sign on X axis)
  if (bounceCount === 0 && engine.state.lastDirection.x !== initialDir.x) {
    bounceCount++
    console.log(`\n🎾 BOUNCE 1 DETECTED!`)
    console.log(`   Position: x=${engine.ball.x.toFixed(0)}, y=${engine.ball.y.toFixed(0)}`)
    console.log(`   New direction: dirX=${engine.state.lastDirection.x.toFixed(2)}, dirY=${engine.state.lastDirection.y.toFixed(2)}`)

    if (engine.state.lastDirection.x < 0) {
      console.log(`   ✅ Ball is now moving LEFT (dirX < 0)`)
    } else {
      console.log(`   ❌ Ball is STILL moving RIGHT (dirX > 0) - BUG!`)
    }
  }

  // Continue until second bounce (back to original direction)
  if (bounceCount === 1 && engine.state.lastDirection.x === initialDir.x && i > 100) {
    bounceCount++
    console.log(`\n🎾 BOUNCE 2 DETECTED!`)
    console.log(`   Position: x=${engine.ball.x.toFixed(0)}, y=${engine.ball.y.toFixed(0)}`)
    console.log(`   New direction: dirX=${engine.state.lastDirection.x.toFixed(2)}, dirY=${engine.state.lastDirection.y.toFixed(2)}`)

    if (engine.state.lastDirection.x > 0) {
      console.log(`   ✅ Ball is now moving RIGHT again (dirX > 0)`)
    } else {
      console.log(`   ❌ Ball is still moving LEFT (dirX < 0) - BUG!`)
    }
    break
  }
}

console.log('\n' + '='.repeat(60))
if (bounceCount >= 2) {
  console.log('✅ SUCCESS: Ball bounces bidirectionally!')
  console.log('   The fix is working - direction changes correctly on bounces')
} else if (bounceCount === 1) {
  console.log('⚠️  PARTIAL: One bounce detected but not second')
  console.log('   May need more iterations to observe second bounce')
} else {
  console.log('❌ FAILURE: No bounces detected')
  console.log('   This may indicate the fix did not work')
}
console.log('='.repeat(60) + '\n')

process.exit(bounceCount >= 2 ? 0 : 1)



