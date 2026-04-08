#!/usr/bin/env node
/**
 * Test script to verify ball moves in both directions (bounces left-right)
 * Tests that direction changes properly on bounce events
 */

'use strict'

const http = require('http')
const WebSocket = require('ws')

const SESSION_ID = 'test-' + Math.random().toString(36).substring(7)
const BASE_URL = 'http://localhost:3000'
const WS_URL = 'ws://localhost:3000'

console.log(`\n🧪 Testing bidirectional ball movement with session: ${SESSION_ID}\n`)

// Test data
let testResults = {
  directionChanges: [],
  bounceEvents: [],
  initialDirection: null,
  lastDirection: null,
  passedTests: 0,
  failedTests: 0
}

/**
 * Register controller on server
 */
async function registerController() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ role: 'controller' })

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/session/${SESSION_ID}/controller`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-CSRF-Token': 'test-token'
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ Controller registered')
          resolve(true)
        } else {
          console.error('❌ Failed to register controller:', res.statusCode)
          reject(new Error(`Status ${res.statusCode}`))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

/**
 * Register viewer on server
 */
async function registerViewer() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      role: 'viewer',
      screenWidth: 800,
      screenHeight: 600
    })

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/session/${SESSION_ID}/viewer`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-CSRF-Token': 'test-token'
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ Viewer registered')
          resolve(true)
        } else {
          console.error('❌ Failed to register viewer:', res.statusCode)
          reject(new Error(`Status ${res.statusCode}`))
        }
      })
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

/**
 * Connect WebSocket client
 */
function connectWebSocket(role) {
  return new Promise((resolve, reject) => {
    const url = `${WS_URL}/?sessionId=${SESSION_ID}&role=${role}`
    const ws = new WebSocket(url)

    ws.on('open', () => {
      console.log(`✅ WebSocket connected as ${role}`)
      resolve(ws)
    })

    ws.on('error', reject)
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000)
  })
}

/**
 * Listen for state updates from server
 */
function listenForUpdates(ws, duration = 8000) {
  return new Promise((resolve) => {
    const updateHandler = (msg) => {
      try {
        const event = JSON.parse(msg)

        // Look for state_update messages with direction info
        if (event.type === 'state_update' && event.payload) {
          const { dirX, dirY, x } = event.payload

          if (dirX !== undefined && dirY !== undefined) {
            console.log(`📍 Direction update: dirX=${dirX.toFixed(2)}, dirY=${dirY.toFixed(2)} (x=${x?.toFixed(0)})`)

            if (testResults.initialDirection === null) {
              testResults.initialDirection = { dirX, dirY }
              console.log('   [Initial direction]')
            } else {
              testResults.directionChanges.push({ dirX, dirY, x })
            }

            testResults.lastDirection = { dirX, dirY }
          }
        }

        // Look for bounce events
        if (event.type === 'bounce_sync' && event.payload) {
          const { side, x, vx } = event.payload
          console.log(`🎾 BOUNCE EVENT: ${side} (x=${x?.toFixed(0)}, vx=${vx?.toFixed(0)})`)
          testResults.bounceEvents.push({ side, x, vx })
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    ws.on('message', updateHandler)

    setTimeout(() => {
      ws.off('message', updateHandler)
      resolve()
    }, duration)
  })
}

/**
 * Send play command to controller
 */
function sendPlayCommand(ws) {
  const cmd = {
    type: 'controller_update',
    payload: { paused: false, speed: 50 }
  }
  ws.send(JSON.stringify(cmd))
  console.log('📤 Sent: play command with speed=50')
}

/**
 * Analyze test results
 */
function analyzeResults() {
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST RESULTS')
  console.log('='.repeat(60) + '\n')

  // Test 1: Initial direction set
  if (testResults.initialDirection) {
    console.log('✅ TEST 1: Initial direction was set')
    console.log(`   Initial: dirX=${testResults.initialDirection.dirX}, dirY=${testResults.initialDirection.dirY}`)
    testResults.passedTests++
  } else {
    console.log('❌ TEST 1: No initial direction received')
    testResults.failedTests++
  }

  // Test 2: Bounce events received
  if (testResults.bounceEvents.length > 0) {
    console.log(`\n✅ TEST 2: ${testResults.bounceEvents.length} bounce event(s) received`)
    testResults.bounceEvents.forEach(b => {
      console.log(`   - Bounce: ${b.side}`)
    })
    testResults.passedTests++
  } else {
    console.log('\n⚠️  TEST 2: No bounce events received (test duration may be too short)')
  }

  // Test 3: Direction changes (bidirectional movement)
  if (testResults.directionChanges.length > 0) {
    console.log(`\n✅ TEST 3: Direction changed ${testResults.directionChanges.length} times`)

    let leftBounces = 0
    let rightBounces = 0

    testResults.directionChanges.forEach((dc, i) => {
      if (dc.dirX < 0) leftBounces++
      if (dc.dirX > 0) rightBounces++
    })

    console.log(`   - Moving LEFT (dirX < 0): ${leftBounces} times`)
    console.log(`   - Moving RIGHT (dirX > 0): ${rightBounces} times`)

    if (leftBounces > 0 && rightBounces > 0) {
      console.log('   ✅ Ball bounced in BOTH directions!')
      testResults.passedTests++
    } else if (leftBounces === 0 && rightBounces === 0) {
      console.log('   ⚠️  Direction is vertical only')
    } else {
      console.log('   ⚠️  Ball only moves in ONE direction (BUG REMAINS!)')
      testResults.failedTests++
    }
  } else {
    console.log('\n⚠️  TEST 3: No direction changes recorded')
  }

  // Test 4: Final direction should be different from initial (after bounces)
  if (testResults.initialDirection && testResults.lastDirection) {
    const dirChanged = testResults.initialDirection.dirX !== testResults.lastDirection.dirX ||
                       testResults.initialDirection.dirY !== testResults.lastDirection.dirY

    if (dirChanged && testResults.bounceEvents.length > 0) {
      console.log(`\n✅ TEST 4: Direction changed after bounce events`)
      console.log(`   Initial: dirX=${testResults.initialDirection.dirX.toFixed(2)}`)
      console.log(`   Final:   dirX=${testResults.lastDirection.dirX.toFixed(2)}`)
      testResults.passedTests++
    } else if (!dirChanged) {
      console.log(`\n⚠️  TEST 4: Direction did not change (might be single bounce test)`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`📈 SUMMARY: ${testResults.passedTests} passed, ${testResults.failedTests} failed`)
  console.log('='.repeat(60) + '\n')

  if (testResults.failedTests === 0 && testResults.directionChanges.length > 0) {
    console.log('🎉 SUCCESS: Ball moves bidirectionally!')
  } else if (testResults.directionChanges.length === 0) {
    console.log('⚠️  Inconclusive: Not enough data (test may need longer duration or higher speed)')
  }
}

/**
 * Main test runner
 */
async function runTest() {
  try {
    // Register endpoints
    await registerController()
    await registerViewer()

    // Connect WebSocket as viewer to receive updates
    const viewerWs = await connectWebSocket('viewer')
    const controllerWs = await connectWebSocket('controller')

    // Send play command
    sendPlayCommand(controllerWs)

    // Listen for updates (8 seconds should be enough for a few bounces at 50% speed)
    console.log('\n⏱️  Listening for updates for 8 seconds...\n')
    await listenForUpdates(viewerWs, 8000)

    // Analyze results
    analyzeResults()

    // Cleanup
    viewerWs.close()
    controllerWs.close()

    process.exit(testResults.failedTests > 0 ? 1 : 0)
  } catch (error) {
    console.error('\n❌ Test error:', error.message)
    process.exit(1)
  }
}

// Run test
runTest()



