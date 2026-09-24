'use strict'

const assert = require('node:assert')
const PhysicsEngine = require('../../shared/physics-engine')
const BallRenderer = require('../src/rendering/renderer')

console.log('✨ BallRenderer Scaling Animation Tests')

// Create mock canvas for testing BallRenderer in node environment
function createMockCanvas(width = 800, height = 600) {
  const ctx = {
    fillRect: () => {},
    beginPath: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    createRadialGradient: () => ({
      addColorStop: () => {}
    }),
    fillText: () => {}
  }

  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    getContext: () => ctx
  }
}

// 1. Initial State
{
  const canvas = createMockCanvas()
  const physics = new PhysicsEngine({ worldWidth: 800, worldHeight: 600 })
  const renderer = new BallRenderer(canvas, physics)

  assert.strictEqual(renderer.pulseAnimation, true, 'pulseAnimation defaults to true')
  assert.strictEqual(renderer.currentScale, 1.0, 'initial currentScale is 1.0')
  assert.strictEqual(renderer.pulseAmplitude, 0.10, 'default pulseAmplitude is 0.10')
  assert.strictEqual(renderer._isBallMoving(), false, 'ball is not moving initially when paused')
  console.log('  ✅ initializes with default scaling properties and scale 1.0')
}

// 2. Movement detection
{
  const canvas = createMockCanvas()
  const physics = new PhysicsEngine({ worldWidth: 800, worldHeight: 600 })
  const renderer = new BallRenderer(canvas, physics)

  physics.setPaused(false)
  physics.setSpeed(40)
  assert.strictEqual(renderer._isBallMoving(), true, 'is moving when paused is false and speed > 0')

  physics.setPaused(true)
  assert.strictEqual(renderer._isBallMoving(), false, 'is not moving when paused is true')
  console.log('  ✅ correctly detects when ball is traveling vs paused')
}

// 3. Scaling pulses while moving
{
  const canvas = createMockCanvas()
  const physics = new PhysicsEngine({ worldWidth: 800, worldHeight: 600 })
  const renderer = new BallRenderer(canvas, physics)

  physics.setPaused(false)
  physics.setSpeed(50)

  const scales = []
  // Simulate 60 frames (1 second) of motion
  for (let i = 0; i < 60; i++) {
    renderer._updateScalingAnimation(1 / 60)
    scales.push(renderer.currentScale)
  }

  const maxScale = Math.max(...scales)
  const minScale = Math.min(...scales)

  assert(maxScale > 1.02, `max scale (${maxScale}) should grow above 1.02`)
  assert(minScale < 0.98, `min scale (${minScale}) should shrink below 0.98`)
  console.log(`  ✅ smoothly pulses as it travels (range: ${minScale.toFixed(3)}x to ${maxScale.toFixed(3)}x)`)
}

// 4. Smooth relaxation back to 1.0 on pause
{
  const canvas = createMockCanvas()
  const physics = new PhysicsEngine({ worldWidth: 800, worldHeight: 600 })
  const renderer = new BallRenderer(canvas, physics)

  physics.setPaused(false)
  physics.setSpeed(50)

  // Step a bit to reach an expanded state
  for (let i = 0; i < 15; i++) {
    renderer._updateScalingAnimation(1 / 60)
  }
  assert.notStrictEqual(renderer.currentScale, 1.0, 'scale has departed from 1.0')

  // Now pause
  physics.setPaused(true)

  // Step for 1 second of pause
  for (let i = 0; i < 60; i++) {
    renderer._updateScalingAnimation(1 / 60)
  }

  assert.strictEqual(renderer.currentScale, 1.0, 'scale smoothly relaxes back to 1.0 when paused')
  console.log('  ✅ smoothly eases back to 1.0x when ball pauses')
}

// 5. Configurable options
{
  const canvas = createMockCanvas()
  const physics = new PhysicsEngine({ worldWidth: 800, worldHeight: 600 })
  const renderer = new BallRenderer(canvas, physics, {
    pulseAnimation: false
  })

  physics.setPaused(false)
  physics.setSpeed(50)

  for (let i = 0; i < 30; i++) {
    renderer._updateScalingAnimation(1 / 60)
  }

  assert.strictEqual(renderer.currentScale, 1.0, 'scale stays 1.0 when pulseAnimation is false')
  console.log('  ✅ respects pulseAnimation: false option')
}

console.log('========================================')
console.log('All scaling animation tests passed!')
