#!/usr/bin/env node
'use strict'

/**
 * Minimal test - just check if ball bounces
 */

const puppeteer = require('puppeteer')

async function run() {
  console.log('🧪 Minimal Bounce Test\n')

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox']
  })

  try {
    // Create session
    const { execSync } = require('child_process')
    const cmd = 'curl -s -X POST "http://localhost:3000/api/session"'
    const output = execSync(cmd).toString()
    const data = JSON.parse(output)
    const sessionId = data.sessionId

    console.log(`Session: ${sessionId}`)

    const page = await browser.newPage()

    // Log console messages
    page.on('console', msg => {
      console.log(`[BROWSER] ${msg.text()}`)
    })

    await page.goto(`http://localhost:3000/viewer.html?sessionId=${sessionId}`)
    await page.waitForFunction(() => window.physicsEngine, { timeout: 10000 })

    console.log('✅ Physics engine ready\n')

    // Start movement
    await page.evaluate(() => {
      window.physicsEngine.setDirection(1, 0)
      window.physicsEngine.setSpeed(50)
      window.physicsEngine.setPaused(false)
      console.log('[TEST] Movement started, direction=1,0 speed=50')
    })

    console.log('⏳ Waiting for first bounce...\n')

    // Wait for bounce
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const listener = (e) => {
          console.log('[TEST] BOUNCE EVENT:', e.detail.side)
          const vx = window.physicsEngine.ball.vx
          const vy = window.physicsEngine.ball.vy
          const dirX = window.physicsEngine.state.lastDirection.x
          const dirY = window.physicsEngine.state.lastDirection.y

          console.log('[TEST] vx=' + vx + ' vy=' + vy + ' dirX=' + dirX + ' dirY=' + dirY)

          window.removeEventListener('bb_bounce', listener)
          resolve({ side: e.detail.side, vx, vy, dirX, dirY })
        }
        window.addEventListener('bb_bounce', listener)
        setTimeout(() => {
          window.removeEventListener('bb_bounce', listener)
          resolve(null)
        }, 15000)
      })
    })

    console.log('\n📊 Result:', result)

    if (result) {
      if (result.vx !== 0) {
        console.log('\n✅ SUCCESS: Ball is bouncing! vx=' + result.vx)
      } else {
        console.log('\n❌ FAIL: Ball stuck! vx=0')
      }
    } else {
      console.log('\n❌ FAIL: No bounce in 15 seconds')
    }

    await new Promise(resolve => setTimeout(resolve, 30000)) // Wait to see movement

  } catch (error) {
    console.error('\n❌ Error:', error.message)
  } finally {
    await browser.close()
  }
}

run()
