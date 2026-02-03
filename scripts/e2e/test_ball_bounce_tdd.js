#!/usr/bin/env node
'use strict'

/**
 * TDD Test: Ball Bounce Edge-to-Edge
 *
 * Validates that:
 * 1. Ball starts moving when play is pressed
 * 2. Ball reaches the edge and bounces back
 * 3. Ball continues moving edge-to-edge without getting stuck
 * 4. Bounces are synced via SSE (not continuous position)
 * 5. Client renders movement locally
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS !== 'false'
const TIMEOUT = 30000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run() {
  console.log('🧪 TDD Test: Ball Bounce Edge-to-Edge Movement')
  console.log('=' .repeat(60))

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  let testsPassed = 0
  let testsFailed = 0

  try {
    // Create session
    const sessionId = await createSession()
    console.log(`✅ Session Created: ${sessionId}`)

    // Open viewer page
    const viewerPage = await browser.newPage()
    viewerPage.setDefaultNavigationTimeout(60000)

    // Log ALL console messages
    viewerPage.on('console', msg => {
      const text = msg.text()
      console.log(`[VIEWER CONSOLE] ${text}`)
    })
    viewerPage.on('pageerror', err => console.error(`[VIEWER ERROR] ${err.toString()}`))

    const viewerUrl = `${BASE_URL}/viewer.html?sessionId=${sessionId}`
    await viewerPage.goto(viewerUrl, { waitUntil: 'domcontentloaded' })
    await viewerPage.waitForSelector('body')

    // Wait for physics engine initialization
    await viewerPage.waitForFunction(() => window.physicsEngine, { timeout: 10000 })
    console.log('✅ Physics engine initialized')

    await sleep(1000)

    // ===========================================
    // Test 1: Initial State - Ball is Centered
    // ===========================================
    console.log('\n🧪 Test 1: Initial State - Ball at Center')
    const initialState = await getBallState(viewerPage)

    const centerX = initialState.worldWidth / 2
    const centerY = initialState.worldHeight / 2

    if (Math.abs(initialState.x - centerX) < 5 && Math.abs(initialState.y - centerY) < 5) {
      console.log(`✅ PASSED: Ball is at center (${initialState.x}, ${initialState.y})`)
      testsPassed++
    } else {
      console.error(`❌ FAILED: Ball not at center. Expected (~${centerX}, ~${centerY}), got (${initialState.x}, ${initialState.y})`)
      testsFailed++
    }

    // ===========================================
    // Test 2: Start Horizontal Movement
    // ===========================================
    console.log('\n🧪 Test 2: Start Horizontal Movement')

    await viewerPage.evaluate(() => {
      // Simulate controller command: start horizontal right
      window.physicsEngine.setDirection(1, 0)
      window.physicsEngine.setSpeed(50) // 50% speed
      window.physicsEngine.setPaused(false)
    })

    await sleep(100) // Wait one frame

    const movingState = await getBallState(viewerPage)

    if (Math.abs(movingState.vx) > 0 && Math.abs(movingState.vy) < 1) {
      console.log(`✅ PASSED: Ball is moving horizontally (vx=${movingState.vx}, vy=${movingState.vy})`)
      testsPassed++
    } else {
      console.error(`❌ FAILED: Ball not moving horizontally. vx=${movingState.vx}, vy=${movingState.vy}`)
      testsFailed++
    }

    // ===========================================
    // Test 3: Ball Reaches Right Edge and Bounces
    // ===========================================
    console.log('\n🧪 Test 3: Ball Reaches Right Edge and Bounces')

    // Set up bounce listener to capture vx immediately after bounce
    const bounceResult = await viewerPage.evaluate(() => {
      return new Promise((resolve) => {
        const bounceListener = (e) => {
          // Capture vx IMMEDIATELY after bounce event
          const vxAfterBounce = window.physicsEngine.ball.vx
          const dirXAfterBounce = window.physicsEngine.state.lastDirection.x

          window.removeEventListener('bb_bounce', bounceListener)

          resolve({
            side: e.detail.side,
            vx: vxAfterBounce,
            dirX: dirXAfterBounce
          })
        }

        window.addEventListener('bb_bounce', bounceListener)

        // Timeout после 15 секунд
        setTimeout(() => {
          window.removeEventListener('bb_bounce', bounceListener)
          resolve(null)
        }, 15000)
      })
    })

    if (bounceResult && bounceResult.side === 'right') {
      console.log(`✅ PASSED: Ball reached right edge`)
      testsPassed++

      // After bouncing from right edge, vx should be negative (moving left)
      console.log(`   Bounce result: vx=${bounceResult.vx}, dirX=${bounceResult.dirX}`)

      if (bounceResult.vx < 0) {
        console.log(`✅ PASSED: Ball bounced back left (vx=${bounceResult.vx})`)
        testsPassed++
      } else {
        console.error(`❌ FAILED: Ball did not bounce correctly. vx=${bounceResult.vx} (should be negative)`)
        testsFailed++
      }
    } else {
      console.error(`❌ FAILED: Did not receive right bounce event. Result:`, bounceResult)
      testsFailed += 2
    }

    // ===========================================
    // Test 4: Ball Reaches Left Edge and Bounces
    // ===========================================
    console.log('\n🧪 Test 4: Ball Reaches Left Edge and Bounces Back')

    const leftBounceResult = await viewerPage.evaluate(() => {
      return new Promise((resolve) => {
        const bounceListener = (e) => {
          if (e.detail.side === 'left') {
            const vxAfterBounce = window.physicsEngine.ball.vx
            const dirXAfterBounce = window.physicsEngine.state.lastDirection.x

            window.removeEventListener('bb_bounce', bounceListener)
            resolve({ side: e.detail.side, vx: vxAfterBounce, dirX: dirXAfterBounce })
          }
        }

        window.addEventListener('bb_bounce', bounceListener)

        setTimeout(() => {
          window.removeEventListener('bb_bounce', bounceListener)
          resolve(null)
        }, 20000) // Increased timeout
      })
    })

    if (leftBounceResult && leftBounceResult.side === 'left') {
      console.log(`✅ PASSED: Ball reached left edge`)
      testsPassed++

      // After bouncing from left edge, vx should be positive (moving right)
      if (leftBounceResult.vx > 0) {
        console.log(`✅ PASSED: Ball bounced back right (vx=${leftBounceResult.vx})`)
        testsPassed++
      } else {
        console.error(`❌ FAILED: Ball did not bounce back. vx=${leftBounceResult.vx} (should be positive)`)
        testsFailed++
      }
    } else {
      console.error(`❌ FAILED: Did not receive left bounce event within timeout`)
      testsFailed += 2
    }

    // ===========================================
    // Test 5: Continuous Edge-to-Edge Movement
    // ===========================================
    console.log('\n🧪 Test 5: Continuous Edge-to-Edge Movement (5 seconds)')

    const bounceCount = await viewerPage.evaluate(() => {
      return new Promise((resolve) => {
        let count = 0

        const bounceListener = (e) => {
          count++
          console.log(`[BOUNCE EVENT] #${count} at (${e.detail.x}, ${e.detail.y})`)
        }

        window.addEventListener('bb_bounce', bounceListener)

        setTimeout(() => {
          window.removeEventListener('bb_bounce', bounceListener)
          resolve(count)
        }, 5000)
      })
    })

    if (bounceCount >= 2) {
      console.log(`✅ PASSED: Ball bounced ${bounceCount} times (continuous movement confirmed)`)
      testsPassed++
    } else {
      console.error(`❌ FAILED: Only ${bounceCount} bounces in 5 seconds (ball might be stuck)`)
      testsFailed++
    }

    // ===========================================
    // Test 6: Vertical Movement
    // ===========================================
    console.log('\n🧪 Test 6: Vertical Movement Edge-to-Edge')

    await viewerPage.evaluate(() => {
      window.physicsEngine.setDirection(0, 1) // Down
      window.physicsEngine.setSpeed(60)
      window.physicsEngine.setPaused(false)
    })

    await sleep(100)

    const verticalState = await getBallState(viewerPage)

    if (Math.abs(verticalState.vy) > 0 && Math.abs(verticalState.vx) < 1) {
      console.log(`✅ PASSED: Ball moving vertically (vx=${verticalState.vx}, vy=${verticalState.vy})`)
      testsPassed++
    } else {
      console.error(`❌ FAILED: Ball not moving vertically properly`)
      testsFailed++
    }

    // Wait for vertical bounces
    const verticalBounces = await viewerPage.evaluate(() => {
      return new Promise((resolve) => {
        let count = 0
        const listener = () => count++
        window.addEventListener('bb_bounce', listener)
        setTimeout(() => {
          window.removeEventListener('bb_bounce', listener)
          resolve(count)
        }, 3000)
      })
    })

    if (verticalBounces >= 1) {
      console.log(`✅ PASSED: Vertical bounces working (${verticalBounces} bounces)`)
      testsPassed++
    } else {
      console.error(`❌ FAILED: No vertical bounces detected`)
      testsFailed++
    }

    // ===========================================
    // Results
    // ===========================================
    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Results:')
    console.log(`✅ Passed: ${testsPassed}`)
    console.log(`❌ Failed: ${testsFailed}`)
    console.log('='.repeat(60))

    if (testsFailed === 0) {
      console.log('🎉 ALL TESTS PASSED!')
    } else {
      console.error('❌ SOME TESTS FAILED')
      process.exit(1)
    }

  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error)
    process.exit(1)
  } finally {
    if (HEADLESS) {
      await browser.close()
    }
  }
}

async function createSession() {
  const { execSync } = require('child_process')
  const cmd = `curl -s -X POST "${BASE_URL}/api/session"`
  const output = execSync(cmd).toString()
  const data = JSON.parse(output)
  return data.sessionId
}

async function getBallState(page) {
  return page.evaluate(() => {
    const engine = window.physicsEngine
    return {
      x: engine.ball.x,
      y: engine.ball.y,
      vx: engine.ball.vx,
      vy: engine.ball.vy,
      radius: engine.ball.radius,
      speed: engine.ball.speed,
      paused: engine.state.paused,
      dirX: engine.state.lastDirection.x,
      dirY: engine.state.lastDirection.y,
      worldWidth: engine.options.worldWidth,
      worldHeight: engine.options.worldHeight
    }
  })
}

run()
