#!/usr/bin/env node
'use strict'

/**
 * Simple manual test - opens browser to check ball bounce behavior
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function run() {
  console.log('🧪 Manual Test: Open browser and check ball bounce')

  const browser = await puppeteer.launch({
    headless: false,
    devtools: true, // Open devtools automatically
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  try {
    // Create session
    const { execSync } = require('child_process')
    const cmd = `curl -s -X POST "${BASE_URL}/api/session"`
    const output = execSync(cmd).toString()
    const data = JSON.parse(output)
    const sessionId = data.sessionId

    console.log(`✅ Session Created: ${sessionId}`)

    const page = await browser.newPage()
    const viewerUrl = `${BASE_URL}/viewer.html?sessionId=${sessionId}`

    await page.goto(viewerUrl, { waitUntil: 'networkidle2' })
    await page.waitForFunction(() => window.physicsEngine, { timeout: 10000 })

    console.log('✅ Page loaded, physics engine ready')
    console.log('\n📝 Manual Steps:')
    console.log('1. Open DevTools Console (already open)')
    console.log('2. Run: window.physicsEngine.setDirection(1, 0)')
    console.log('3. Run: window.physicsEngine.setSpeed(50)')
    console.log('4. Run: window.physicsEngine.setPaused(false)')
    console.log('5. Watch console logs and ball movement')
    console.log('\n⏸️  Press Ctrl+C to stop\n')

    // Keep browser open
    await new Promise(() => {}) // Never resolves

  } catch (error) {
    console.error('\n❌ Error:', error)
  }
}

run()
