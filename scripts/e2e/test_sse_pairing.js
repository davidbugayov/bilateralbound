#!/usr/bin/env node
/**
 * E2E: Проверяем, что SSE не стартует до подключения пары и работает после.
 * Сценарий:
 * 1) Создаем сессию через API
 * 2) Открываем controller первым, убеждаемся что нет запросов к /events?role=controller
 * 3) Открываем viewer, ждём подключения обоих, фиксируем запросы к /events
 * 4) Делаем команду controller_update и проверяем, что viewer получает state_update
 *
 * Запуск:
 *   BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_sse_pairing.js
 *   HEADLESS=false BASE_URL=http://localhost:3000 node scripts/e2e/test_sse_pairing.js
 */

const puppeteer = require('puppeteer')
const http = require('http')
const https = require('https')

const BASE_URL = process.env.BASE_URL || process.env.TEST_URL || 'https://dev.emdrbilateral.online'
const HEADLESS = process.env.HEADLESS !== 'false'
const TIMEOUT = 20000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function createSession() {
  const url = new URL('/api/session', BASE_URL)
  const protocol = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = protocol.request(url, { method: 'POST' }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode !== 200 && res.statusCode !== 201) {
          reject(new Error(`Failed to create session: HTTP ${res.statusCode}`))
          return
        }
        try {
          const parsed = JSON.parse(data || '{}')
          if (!parsed.sessionId) {
            reject(new Error('Session id missing in response'))
            return
          }
          resolve(parsed.sessionId)
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

function trackSseRequests(page, sessionId, role, bucket) {
  page.on('request', req => {
    const url = req.url()
    if (url.includes(`/api/session/${sessionId}/events`) && url.includes(`role=${role}`)) {
      bucket.push(url)
    }
  })
}

function setupErrorLogging(page, label) {
  page.on('console', msg => console.log(`[${label}] ${msg.type()}: ${msg.text()}`))
  page.on('pageerror', err => console.error(`[${label} PAGE ERROR]`, err))
  page.on('requestfailed', req => console.error(`[${label} REQUEST FAILED]`, req.url(), req.failure()?.errorText))
}

async function waitForRealtimeConnected(page) {
  return page.waitForFunction(() => {
    return Boolean(globalThis.wsClient?.isConnected)
  }, { timeout: TIMEOUT })
}

async function main() {
  console.log(`🚀 SSE pairing E2E on ${BASE_URL}`)
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  })

  let controllerPage
  let viewerPage
  try {
    const sessionId = await createSession()
    console.log(`✅ Session created: ${sessionId}`)

    controllerPage = await browser.newPage()
    viewerPage = await browser.newPage()

    setupErrorLogging(controllerPage, 'CONTROLLER')
    setupErrorLogging(viewerPage, 'VIEWER')

    const controllerSse = []
    const viewerSse = []
    trackSseRequests(controllerPage, sessionId, 'controller', controllerSse)
    trackSseRequests(viewerPage, sessionId, 'viewer', viewerSse)

    const controllerUrl = `${BASE_URL}/session-controller.html?sessionId=${sessionId}`
    const viewerUrl = `${BASE_URL}/viewer.html?sessionId=${sessionId}`

    console.log('🌐 Opening controller (first)...')
    await controllerPage.goto(controllerUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    await sleep(3000)
    if (controllerSse.length !== 0) {
      throw new Error(`Controller started SSE before viewer (${controllerSse.length} requests)`)
    }
    console.log('✅ Controller did not start SSE before viewer')

    console.log('🌐 Opening viewer (second)...')
    await viewerPage.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })

    await Promise.all([
      waitForRealtimeConnected(controllerPage),
      waitForRealtimeConnected(viewerPage)
    ])
    console.log('✅ Both roles report realtime connected')

    // Ждём появления реальных SSE запросов после пары
    await sleep(2000)
    if (controllerSse.length === 0 || viewerSse.length === 0) {
      throw new Error(`Missing SSE connects after pairing (controller=${controllerSse.length}, viewer=${viewerSse.length})`)
    }

    // Подписываемся на новые state_update
    await viewerPage.evaluate(() => {
      globalThis.__sseEvents = []
      if (globalThis.wsClient?.on) {
        globalThis.wsClient.on('state_update', evt => {
          try {
            globalThis.__sseEvents.push(evt)
          } catch {
            // ignore
          }
        })
      }
    })

    // Отправляем обновление от контроллера
    await controllerPage.evaluate(() => {
      const payload = { colorBg: '#0a2540', timestamp: Date.now() }
      if (globalThis.wsClient?.send) {
        globalThis.wsClient.send('controller_update', payload)
      }
    })

    await viewerPage.waitForFunction(() => Array.isArray(globalThis.__sseEvents) && globalThis.__sseEvents.length > 0, { timeout: TIMEOUT })
    console.log('✅ Viewer received state_update after controller update')

    console.log('\n🎉 TEST PASSED')
    process.exit(0)
  } catch (error) {
    console.error('❌ TEST FAILED:', error.message)
    process.exit(1)
  } finally {
    if (controllerPage) await controllerPage.close().catch(() => {})
    if (viewerPage) await viewerPage.close().catch(() => {})
    await browser.close()
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err)
  process.exit(1)
})
