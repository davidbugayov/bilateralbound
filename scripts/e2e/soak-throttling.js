#!/usr/bin/env node
'use strict'

const puppeteer = require('puppeteer')

const BASE_URL = process.argv[2] || 'http://localhost:3000'
const DURATION_MIN = Math.max(1, Number.parseInt(process.argv[3] || '30', 10))
const SAMPLE_MS = 1000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function emulateBadNetwork(page) {
  const cdp = await page.target().createCDPSession()
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 180,
    downloadThroughput: (600 * 1024) / 8,
    uploadThroughput: (300 * 1024) / 8
  })
}

async function createSession(browser) {
  const page = await browser.newPage()
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('#createSessionBtn', { timeout: 15000 })
  await page.click('#createSessionBtn')
  await page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: 30000
  })
  const sessionId = page.url().match(/\/c\/([^/]+)/)?.[1]
  if (!sessionId) throw new Error('Cannot extract sessionId')
  return { page, sessionId }
}

async function getDiag(page, key) {
  return page.evaluate((engineKey) => {
    const engine = globalThis[engineKey]
    if (!engine || !engine.getSyncDiagnostics) return null
    const d = engine.getSyncDiagnostics()
    return {
      driftPx: d.driftPx,
      jitterMs: d.jitterMs,
      springActive: d.springActive,
      paused: engine.state?.paused === true
    }
  }, key)
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  })
  let controllerPage
  let viewerPage

  try {
    const created = await createSession(browser)
    controllerPage = created.page
    const sessionId = created.sessionId

    viewerPage = await browser.newPage()
    await viewerPage.goto(`${BASE_URL}/s/${sessionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })
    await viewerPage.waitForSelector('#viewerCanvas', { timeout: 15000 })

    await emulateBadNetwork(controllerPage)
    await emulateBadNetwork(viewerPage)

    await sleep(3000)
    await controllerPage.click('#playPauseBtn')

    const startedAt = Date.now()
    const finishAt = startedAt + DURATION_MIN * 60 * 1000
    const stats = {
      samples: 0,
      viewerDriftMax: 0,
      controllerDriftMax: 0,
      viewerJitterMax: 0,
      controllerJitterMax: 0,
      severeEvents: 0
    }

    while (Date.now() < finishAt) {
      const viewer = await getDiag(viewerPage, 'physicsEngine')
      const controller = await getDiag(controllerPage, '__previewPhysics')

      if (viewer && !viewer.paused) {
        stats.viewerDriftMax = Math.max(
          stats.viewerDriftMax,
          viewer.driftPx || 0
        )
        stats.viewerJitterMax = Math.max(
          stats.viewerJitterMax,
          viewer.jitterMs || 0
        )
        if ((viewer.driftPx || 0) > 180 || (viewer.jitterMs || 0) > 45)
          stats.severeEvents++
      }

      if (controller && !controller.paused) {
        stats.controllerDriftMax = Math.max(
          stats.controllerDriftMax,
          controller.driftPx || 0
        )
        stats.controllerJitterMax = Math.max(
          stats.controllerJitterMax,
          controller.jitterMs || 0
        )
        if ((controller.driftPx || 0) > 180 || (controller.jitterMs || 0) > 45)
          stats.severeEvents++
      }

      stats.samples++
      await sleep(SAMPLE_MS)
    }

    console.log('\n=== SOAK THROTTLING REPORT ===')
    console.log(`baseUrl: ${BASE_URL}`)
    console.log(`durationMin: ${DURATION_MIN}`)
    console.log(`samples: ${stats.samples}`)
    console.log(`viewerDriftMaxPx: ${stats.viewerDriftMax}`)
    console.log(`controllerDriftMaxPx: ${stats.controllerDriftMax}`)
    console.log(`viewerJitterMaxMs: ${stats.viewerJitterMax}`)
    console.log(`controllerJitterMaxMs: ${stats.controllerJitterMax}`)
    console.log(`severeEvents: ${stats.severeEvents}`)

    const pass =
      stats.viewerDriftMax <= 220 &&
      stats.controllerDriftMax <= 220 &&
      stats.viewerJitterMax <= 60 &&
      stats.controllerJitterMax <= 60 &&
      stats.severeEvents <= Math.max(3, Math.floor(stats.samples * 0.02))

    console.log(`result: ${pass ? 'PASS' : 'FAIL'}`)
    process.exit(pass ? 0 : 1)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('Soak test failed:', err.message)
  process.exit(1)
})
