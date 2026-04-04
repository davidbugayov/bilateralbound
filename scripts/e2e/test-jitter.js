#!/usr/bin/env node
'use strict'

/**
 * E2E Jitter Test for BilateralBound
 * Tests ball movement smoothness on dev server
 *
 * Usage: node scripts/e2e/test-jitter.js
 */

const https = require('https')
const http = require('http')

const BASE_URL = 'https://dev.emdrbilateral.online'

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }

    const client = url.protocol === 'https:' ? https : http
    const req = client.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function runJitterTest() {
  console.log('🧪 Starting Jitter Test on dev.emdrbilateral.online\n')

  // 1. Create session
  console.log('1️⃣ Creating session...')
  const createRes = await makeRequest('/api/session', 'POST', {})
  if (createRes.status !== 200) {
    console.error('❌ Failed to create session:', createRes)
    process.exit(1)
  }
  const sessionId = createRes.data.sessionId
  console.log(`✅ Session created: ${sessionId}\n`)

  // 2. Connect controller
  console.log('2️⃣ Connecting controller...')
  const controllerRes = await makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {})
  console.log(`✅ Controller connected: ${controllerRes.status === 200}\n`)

  // 3. Connect viewer
  console.log('3️⃣ Connecting viewer...')
  const viewerRes = await makeRequest(`/api/session/${sessionId}/viewer/connect`, 'POST', {
    screenSize: { width: 1920, height: 1080 }
  })
  console.log(`✅ Viewer connected: ${viewerRes.status === 200}\n`)

  // 4. Start movement
  console.log('4️⃣ Starting ball movement...')
  await makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
    paused: false,
    dirX: 1,
    dirY: 0,
    speed: 40
  })
  console.log('✅ Ball movement started\n')

  // 5. Collect state samples for jitter analysis
  console.log('5️⃣ Collecting state samples (2 seconds, every 50ms)...')
  const samples = []
  const sampleCount = 40 // 40 samples * 50ms = 2 seconds

  for (let i = 0; i < sampleCount; i++) {
    const stateRes = await makeRequest(`/api/session/${sessionId}/state`)
    if (stateRes.status === 200 && stateRes.data) {
      samples.push({
        time: Date.now(),
        x: stateRes.data.x,
        y: stateRes.data.y,
        vx: stateRes.data.vx,
        vy: stateRes.data.vy
      })
    }
    await sleep(50)
  }

  console.log(`✅ Collected ${samples.length} samples\n`)

  // 6. Analyze jitter
  console.log('6️⃣ Analyzing jitter...\n')

  // Calculate position deltas
  const deltas = []
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].time - samples[i-1].time
    const dx = samples[i].x - samples[i-1].x
    const dy = samples[i].y - samples[i-1].y
    const expectedDx = (samples[i-1].vx || 0) * (dt / 1000)
    const expectedDy = (samples[i-1].vy || 0) * (dt / 1000)
    const jitterX = Math.abs(dx - expectedDx)
    const jitterY = Math.abs(dy - expectedDy)
    deltas.push({ dt, dx, dy, expectedDx, expectedDy, jitterX, jitterY })
  }

  // Calculate statistics
  const avgJitterX = deltas.reduce((s, d) => s + d.jitterX, 0) / deltas.length
  const avgJitterY = deltas.reduce((s, d) => s + d.jitterY, 0) / deltas.length
  const maxJitterX = Math.max(...deltas.map(d => d.jitterX))
  const maxJitterY = Math.max(...deltas.map(d => d.jitterY))
  const avgDt = deltas.reduce((s, d) => s + d.dt, 0) / deltas.length
  const dtVariance = deltas.reduce((s, d) => s + (d.dt - avgDt) ** 2, 0) / deltas.length
  const dtStdDev = Math.sqrt(dtVariance)

  console.log('📊 Jitter Analysis Results:')
  console.log('─────────────────────────────────────')
  console.log(`   Samples collected: ${samples.length}`)
  console.log(`   Average dt: ${avgDt.toFixed(2)}ms`)
  console.log(`   dt Std Dev: ${dtStdDev.toFixed(2)}ms`)
  console.log(`   Average Jitter X: ${avgJitterX.toFixed(2)}px`)
  console.log(`   Average Jitter Y: ${avgJitterY.toFixed(2)}px`)
  console.log(`   Max Jitter X: ${maxJitterX.toFixed(2)}px`)
  console.log(`   Max Jitter Y: ${maxJitterY.toFixed(2)}px`)
  console.log('─────────────────────────────────────\n')

  // 7. Evaluate results
  const JITTER_THRESHOLD = 5 // pixels
  const DT_STDDEV_THRESHOLD = 20 // ms

  const passed = avgJitterX < JITTER_THRESHOLD &&
                 avgJitterY < JITTER_THRESHOLD &&
                 dtStdDev < DT_STDDEV_THRESHOLD

  if (passed) {
    console.log('✅ PASS: Jitter is within acceptable limits')
    console.log(`   (avg jitter < ${JITTER_THRESHOLD}px, dt stddev < ${DT_STDDEV_THRESHOLD}ms)`)
  } else {
    console.log('⚠️ WARN: Jitter exceeds recommended limits')
    if (avgJitterX >= JITTER_THRESHOLD || avgJitterY >= JITTER_THRESHOLD) {
      console.log(`   Average jitter (${avgJitterX.toFixed(2)}, ${avgJitterY.toFixed(2)}) exceeds ${JITTER_THRESHOLD}px`)
    }
    if (dtStdDev >= DT_STDDEV_THRESHOLD) {
      console.log(`   dt stddev (${dtStdDev.toFixed(2)}ms) exceeds ${DT_STDDEV_THRESHOLD}ms`)
    }
  }

  // 8. Cleanup
  console.log('\n7️⃣ Cleaning up...')
  await makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', { paused: true })
  console.log('✅ Session paused\n')

  console.log('🏁 Jitter test completed!')
  console.log(`🔗 Session URL: ${BASE_URL}/c/${sessionId}`)
  console.log(`🔗 Viewer URL: ${BASE_URL}/s/${sessionId}`)

  process.exit(passed ? 0 : 1)
}

runJitterTest().catch(err => {
  console.error('❌ Test failed:', err.message)
  process.exit(1)
})