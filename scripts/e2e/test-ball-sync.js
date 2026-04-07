#!/usr/bin/env node
/**
 * E2E test: Ball smoothness sync between viewer and controller.
 * Tests position sync stability, jitter under various network conditions.
 *
 * Usage: node scripts/e2e/test-ball-sync.js [BASE_URL]
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.argv[2] || 'https://dev.emdrbilateral.online'
const TEST_SESSION = 'bsync_' + Date.now()

let browser
let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, r) => setTimeout(() => r(new Error('Timeout: ' + name)), 15000))
    ])
    console.log(`\u2705 ${name}`)
    passed++
  } catch (e) {
    console.log(`\u274c ${name}: ${e.message}`)
    failed++
  }
}

async function reserveSession(sessionId) {
  try {
    const res = await fetch(`${BASE_URL}/api/session/${sessionId}/reserve`, {
      method: 'POST'
    })
    // eslint-disable-next-line no-empty
  } catch (e) {}
}

/**
 * Collects viewer ball positions over time.
 */
async function collectViewerPositions(viewPage, durationMs, intervalMs) {
  const positions = []
  const iterations = Math.floor(durationMs / intervalMs)
  for (let i = 0; i < iterations; i++) {
    const ball = await viewPage.evaluate(() => {
      const engine = globalThis.physicsEngine
      if (!engine || !engine.ball) return null
      return {
        x: engine.ball.x,
        y: engine.ball.y,
        paused: engine.state.paused,
        speed: engine.ball.speed
      }
    })
    if (ball) positions.push(ball)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return positions
}

/**
 * Analyzes smoothness: computes avg velocity, teleport count.
 */
function analyzeSmoothness(positions) {
  if (positions.length < 2) {
    return { avgVelocity: 0, teleportCount: 0, samples: positions.length }
  }
  let velocities = []
  let teleportCount = 0
  const TELEPORT_THRESHOLD = 300
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x
    const dy = positions[i].y - positions[i - 1].y
    const dist = Math.sqrt(dx * dx + dy * dy)
    velocities.push(dist / 0.1)
    if (dist > TELEPORT_THRESHOLD) teleportCount++
  }
  const avgVelocity = velocities.length
    ? velocities.reduce((s, v) => s + v, 0) / velocities.length
    : 0
  return { avgVelocity, teleportCount, samples: positions.length }
}

/**
 * Simulates network latency via CDP.
 */
async function setNetworkThrottle(page, latencyMs) {
  const client = await page.createCDPSession()
  if (latencyMs > 0) {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: latencyMs,
      downloadThroughput: (1.5 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8
    })
  } else {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1
    })
  }
  await client.detach()
}

async function main() {
  console.log(`\n\U0001f680 Ball Sync E2E: ${BASE_URL}\n`)

  await reserveSession(TEST_SESSION)

  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

  const ctrlPage = await browser.newPage()
  await ctrlPage.goto(`${BASE_URL}/c/${TEST_SESSION}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  })
  await ctrlPage.waitForSelector('#preview', { timeout: 10000 })

  const viewPage = await browser.newPage()
  await viewPage.goto(`${BASE_URL}/s/${TEST_SESSION}`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  })
  await viewPage.waitForSelector('canvas', { timeout: 10000 })

  await new Promise((r) => setTimeout(r, 3000))

  // Test 1: Normal network — ball movement is smooth
  await test('Normal network: viewer ball moves smoothly', async () => {
    await ctrlPage.evaluate(() => {
      const btn = document.getElementById('playPauseBtn')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 1000))

    const positions = await collectViewerPositions(viewPage, 4000, 100)

    if (positions.length < 5) {
      throw new Error(`Too few samples: ${positions.length}`)
    }

    const metrics = analyzeSmoothness(positions)
    console.log(
      `   \u2192 avgVelocity=${metrics.avgVelocity.toFixed(1)}px/s, teleports=${metrics.teleportCount}`
    )

    if (metrics.teleportCount > 2) {
      throw new Error(`Too many teleports: ${metrics.teleportCount} (threshold: 2)`)
    }

    // Ball should be moving (not paused)
    const isPlaying = positions.some((p) => !p.paused)
    if (!isPlaying) {
      throw new Error('Ball is paused — not playing')
    }
  })

  // Pause
  await ctrlPage.evaluate(async () => {
    const sid = globalThis.__current?.sessionId
    if (sid) {
      await fetch(`/api/session/${sid}/controller/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: true, returnToCenter: true })
      })
    }
  })
  await new Promise((r) => setTimeout(r, 1500))

  // Test 2: Slow network — local physics keeps ball smooth
  await test('Slow network (100ms): ball continues smooth (local physics)', async () => {
    await setNetworkThrottle(viewPage, 100)

    await ctrlPage.evaluate(() => {
      const btn = document.getElementById('playPauseBtn')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    const positions = await collectViewerPositions(viewPage, 4000, 100)

    if (positions.length < 3) {
      throw new Error(`Too few samples under slow network: ${positions.length}`)
    }

    const metrics = analyzeSmoothness(positions)
    console.log(
      `   \u2192 avgVelocity=${metrics.avgVelocity.toFixed(1)}px/s, teleports=${metrics.teleportCount}`
    )

    if (metrics.teleportCount > 5) {
      throw new Error(`Too many teleports under slow network: ${metrics.teleportCount}`)
    }
  })

  await setNetworkThrottle(viewPage, 0)

  // Pause
  await ctrlPage.evaluate(async () => {
    const sid = globalThis.__current?.sessionId
    if (sid) {
      await fetch(`/api/session/${sid}/controller/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: true, returnToCenter: true })
      })
    }
  })
  await new Promise((r) => setTimeout(r, 1500))

  // Test 3: Viewer reconnection
  await test('Viewer reconnect: ball state restores correctly', async () => {
    await viewPage.evaluate(() => {
      if (globalThis.wsClient && typeof globalThis.wsClient.disconnect === 'function') {
        globalThis.wsClient.disconnect()
      }
    })
    await new Promise((r) => setTimeout(r, 1000))

    await viewPage.reload({ waitUntil: 'domcontentloaded' })
    await viewPage.waitForSelector('canvas', { timeout: 10000 })
    await new Promise((r) => setTimeout(r, 3000))

    await ctrlPage.evaluate(() => {
      const btn = document.getElementById('playPauseBtn')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 2000))

    const positions = await collectViewerPositions(viewPage, 3000, 100)

    if (positions.length < 3) {
      throw new Error(`Viewer did not track ball after reconnect: ${positions.length} samples`)
    }

    const isMoving = positions.some((p) => !p.paused)
    if (!isMoving) {
      throw new Error('Ball not playing after viewer reconnect')
    }
  })

  // Test 4: Pause sync
  await test('Pause sync: viewer pauses when controller pauses', async () => {
    await ctrlPage.evaluate(async () => {
      const sid = globalThis.__current?.sessionId
      if (sid) {
        await fetch(`/api/session/${sid}/controller/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paused: true, returnToCenter: true })
        })
      }
    })
    await new Promise((r) => setTimeout(r, 2000))

    const viewerPaused = await viewPage.evaluate(() => {
      const engine = globalThis.physicsEngine
      if (!engine) return null
      return engine.state.paused
    })

    if (!viewerPaused) {
      throw new Error('Viewer not paused after controller pause command')
    }
  })

  await browser.close()

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Ball Sync Tests: ${passed}/${passed + failed} passed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Fatal:', e)
  if (browser) browser.close()
  process.exit(1)
})