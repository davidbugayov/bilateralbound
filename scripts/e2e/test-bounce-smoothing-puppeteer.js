#!/usr/bin/env node
/**
 * E2E Bounce Smoothing Test using Puppeteer
 * Tests that ball moves smoothly from wall bounces without jitter
 *
 * Usage:
 *   node scripts/e2e/test-bounce-smoothing-puppeteer.js http://localhost:3000
 *   node scripts/e2e/test-bounce-smoothing-puppeteer.js https://dev.emdrbilateral.online
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.argv[2] || 'http://localhost:3000'
const TEST_SESSION = 'bounce_' + Date.now()

let browser
let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, r) =>
        setTimeout(() => r(new Error('Timeout: ' + name)), 30000)
      )
    ])
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  }
}

async function reserveSession(sessionId) {
  try {
    await fetch(`${BASE_URL}/api/session/${sessionId}/reserve`, {
      method: 'POST'
    })
  } catch {
    // Best-effort cleanup: reserve may fail if session is already gone.
  }
}

/**
 * Collects ball positions during movement
 */
async function collectBallPositions(page, durationMs, intervalMs) {
  const positions = []
  const iterations = Math.floor(durationMs / intervalMs)

  for (let i = 0; i < iterations; i++) {
    const ball = await page.evaluate(() => {
      if (!globalThis.physicsEngine) return null
      const engine = globalThis.physicsEngine
      return {
        x: engine.ball.x,
        y: engine.ball.y,
        vx: engine.ball.vx,
        vy: engine.ball.vy,
        paused: engine.state.paused,
        speed: engine.ball.speed,
        lastDirX: engine.state.lastDirection.x,
        lastDirY: engine.state.lastDirection.y
      }
    })

    if (ball) {
      positions.push({
        index: i,
        timestamp: Date.now(),
        ...ball
      })
    }

    await new Promise((r) => setTimeout(r, intervalMs))
  }

  return positions
}

/**
 * Detect bounces from position data
 */
function detectBounces(positions, worldWidth, worldHeight) {
  const bounces = []
  const ballRadius = 20
  const wallMargin = ballRadius + 2 // As per new physics-engine.js

  for (let i = 1; i < positions.length; i++) {
    const curr = positions[i]
    const prev = positions[i - 1]

    // Right wall bounce
    if (
      prev.x >= worldWidth - wallMargin &&
      curr.x < prev.x &&
      Math.abs(curr.vx) > 0
    ) {
      bounces.push({
        index: i,
        type: 'right',
        x: curr.x.toFixed(1),
        prevX: prev.x.toFixed(1),
        velocity: Math.hypot(curr.vx, curr.vy).toFixed(2),
        prevVelocity: Math.hypot(prev.vx, prev.vy).toFixed(2)
      })
    }

    // Left wall bounce
    if (
      prev.x <= wallMargin &&
      curr.x > prev.x &&
      Math.abs(curr.vx) > 0
    ) {
      bounces.push({
        index: i,
        type: 'left',
        x: curr.x.toFixed(1),
        prevX: prev.x.toFixed(1),
        velocity: Math.hypot(curr.vx, curr.vy).toFixed(2),
        prevVelocity: Math.hypot(prev.vx, prev.vy).toFixed(2)
      })
    }
  }

  return bounces
}

/**
 * Detect jitter: sudden velocity changes
 */
function detectJitter(positions, threshold = 100) {
  const jitterEvents = []

  for (let i = 1; i < positions.length; i++) {
    const currVel = Math.hypot(positions[i].vx, positions[i].vy)
    const prevVel = Math.hypot(positions[i - 1].vx, positions[i - 1].vy)
    const change = Math.abs(currVel - prevVel)

    if (change > threshold) {
      jitterEvents.push({
        index: i,
        prevVel: prevVel.toFixed(2),
        currVel: currVel.toFixed(2),
        change: change.toFixed(2)
      })
    }
  }

  return jitterEvents
}

/**
 * Analyze smoothness after bounce
 */
function analyzePostBounceSmoothness(positions, bounceIndices) {
  const results = []

  for (const bounceIdx of bounceIndices) {
    if (bounceIdx + 1 < positions.length) {
      const postBounceVel = Math.hypot(
        positions[bounceIdx + 1].vx,
        positions[bounceIdx + 1].vy
      )
      const isSmooth = postBounceVel > 50 // Should keep good velocity after bounce

      results.push({
        bounceIdx,
        postBounceVelocity: postBounceVel.toFixed(2),
        isSmooth,
        status: isSmooth ? '✓ SMOOTH' : '✗ STALLED'
      })
    }
  }

  return results
}

async function main() {
  console.log('\n🧪 E2E Bounce Smoothing Test\n')
  console.log(`📍 Server: ${BASE_URL}\n`)

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    })

    const viewerPage = await browser.newPage()
    const controllerPage = await browser.newPage()

    // Setup session reservation
    await reserveSession(TEST_SESSION)
    console.log(`📌 Session: ${TEST_SESSION}\n`)

    // Test 1: Controller opens
    await test('Controller page loads', async () => {
      await controllerPage.goto(`${BASE_URL}/c/${TEST_SESSION}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      })
      await controllerPage.waitForFunction(
        () => globalThis.physicsEngine,
        { timeout: 5000 }
      )
    })

    // Wait a bit for controller to initialize
    await new Promise((r) => setTimeout(r, 1000))

    // Test 2: Viewer opens
    await test('Viewer page loads', async () => {
      await viewerPage.goto(`${BASE_URL}/s/${TEST_SESSION}`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      })
      await viewerPage.waitForFunction(
        () => globalThis.physicsEngine,
        { timeout: 5000 }
      )
    })

    // Wait for viewer to connect
    await new Promise((r) => setTimeout(r, 2000))

    // Test 3: Start movement
    await test('Start rightward movement', async () => {
      const success = await controllerPage.evaluate(async () => {
        if (!globalThis.RealtimeClient?.session)
          return { success: false, msg: 'No session' }

        const sessionId =
          globalThis.RealtimeClient.session.sessionId ||
          globalThis.__current.sessionId
        const response = await fetch(
          `/api/session/${sessionId}/controller/update`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paused: false,
              dirX: 1,
              dirY: 0,
              speed: 50
            })
          }
        )
        return response.ok
      })

      if (!success) throw new Error('Failed to start movement')
    })

    // Test 4: Collect positions during movement
    console.log('\n📊 Collecting ball positions over 6 seconds...')
    const positions = await collectBallPositions(viewerPage, 6000, 100) // 100ms interval
    console.log(`✅ Collected ${positions.length} position samples\n`)

    // Test 5: Stop movement
    await test('Stop movement', async () => {
      await controllerPage.evaluate(async () => {
        const sessionId =
          globalThis.RealtimeClient?.session?.sessionId ||
          globalThis.__current.sessionId
        if (!sessionId) throw new Error('No sessionId')

        await fetch(`/api/session/${sessionId}/controller/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paused: true })
        })
      })
    })

    // Test 6: Analyze data
    console.log('🔍 Analyzing movement data...\n')

    const bounces = detectBounces(positions, 1920, 1080)
    const jitter = detectJitter(positions, 150)
    const postBounceSmoothing = analyzePostBounceSmoothness(
      positions,
      bounces.map((b) => b.index)
    )

    // Print analysis
    console.log('📈 ANALYSIS RESULTS:\n')
    console.log(`  Total samples: ${positions.length}`)
    console.log(
      `  Duration: ${((positions[positions.length - 1].timestamp - positions[0].timestamp) / 1000).toFixed(1)}s`
    )
    console.log(`  Bounces detected: ${bounces.length}`)
    console.log(`  Jitter events (Δvel > 150px/s): ${jitter.length}\n`)

    if (bounces.length > 0) {
      console.log('🔄 Bounces:\n')
      bounces.slice(0, 5).forEach((bounce) => {
        console.log(
          `   [${bounce.index}] ${bounce.type.toUpperCase()} ` +
          `| x: ${bounce.x} (was ${bounce.prevX}) ` +
          `| vel: ${bounce.velocity}px/s (was ${bounce.prevVelocity}px/s)`
        )
      })
      if (bounces.length > 5) console.log(`   ... and ${bounces.length - 5} more\n`)
    }

    if (postBounceSmoothing.length > 0) {
      console.log('✅ Post-Bounce Smoothness Check:\n')
      postBounceSmoothing.forEach((result) => {
        console.log(
          `   Bounce@${result.bounceIdx}: ${result.postBounceVelocity}px/s ${result.status}`
        )
      })
      console.log()
    }

    if (jitter.length > 0 && jitter.length <= 3) {
      console.log('⚠️ Jitter Events (first 3):\n')
      jitter.slice(0, 3).forEach((event) => {
        console.log(
          `   [${event.index}] ${event.prevVel} → ${event.currVel}px/s (Δ ${event.change})`
        )
      })
      console.log()
    }

    // Verdict
    console.log(`\n${'═'.repeat(60)}\n`)

    const smoothBounces = postBounceSmoothing.filter((r) => r.isSmooth).length
    const totalBounces = postBounceSmoothing.length

    if (totalBounces === 0) {
      console.log('⚠️  No bounces detected during test')
    } else if (smoothBounces === totalBounces) {
      console.log(
        `✅ SUCCESS: All ${totalBounces} bounces show smooth post-bounce movement`
      )
      console.log('   → Ball maintains velocity after wall impact')
      passed++
    } else {
      console.log(
        `⚠️  ${smoothBounces}/${totalBounces} bounces are smooth ` +
        `(${totalBounces - smoothBounces} show velocity drop)`
      )
      failed++
    }

    if (jitter.length === 0) {
      console.log('🟢 Jitter: EXCELLENT (none detected)')
      passed++
    } else if (jitter.length <= 2) {
      console.log(`🟡 Jitter: ACCEPTABLE (${jitter.length} events)`)
      passed++
    } else {
      console.log(`🔴 Jitter: POOR (${jitter.length} events)`)
      failed++
    }

    console.log(`\n${'═'.repeat(60)}\n`)
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed\n`)

    await browser.close()
    process.exit(failed === 0 ? 0 : 1)
  } catch (err) {
    console.error('❌ Fatal error:', err.message)
    if (browser) await browser.close()
    process.exit(1)
  }
}

main()
