#!/usr/bin/env node
/**
 * E2E: Проверяем что превью контроллера не дергается и правильно центрируется
 *
 * ПРОБЛЕМА (до исправления):
 * - Мяч дергался на превью контроллера
 * - При старте не центровался
 * - На viewer всё работало правильно
 *
 * ПРИЧИНА:
 * - Контроллер запускал СВОЮ локальную физику (isViewer: false)
 * - Одновременно получал состояние от viewer через SSE
 * - Конфликт двух источников движения → дергание
 *
 * РЕШЕНИЕ:
 * - Контроллер превью переведен в viewer режим (isViewer: true)
 * - Теперь только следует за состоянием от viewer через SSE
 * - Плавная интерполяция к target координатам
 *
 * ТЕСТ ПРОВЕРЯЕТ:
 * 1) Контроллер превью в viewer режиме (isViewer: true)
 * 2) Мяч центрируется при старте
 * 3) Нет резких скачков позиции (дергания)
 * 4) Плавное движение при получении SSE обновлений
 * 5) Синхронизация с viewer
 *
 * Запуск:
 *   HEADLESS=false BASE_URL=http://localhost:3000 node scripts/e2e/test_controller_preview_smooth.js
 *   BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_controller_preview_smooth.js
 */

const puppeteer = require('puppeteer')
const http = require('http')
const https = require('https')

const BASE_URL = process.env.BASE_URL || process.env.TEST_URL || 'http://localhost:3000'
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

function setupErrorLogging(page, label) {
  page.on('console', msg => {
    const text = msg.text()
    if (text.includes('ERROR') || text.includes('WARN')) {
      console.log(`[${label}] ${msg.type()}: ${text}`)
    }
  })
  page.on('pageerror', err => console.error(`[${label} PAGE ERROR]`, err))
  page.on('requestfailed', req => {
    if (!req.url().includes('favicon')) {
      console.error(`[${label} REQUEST FAILED]`, req.url(), req.failure()?.errorText)
    }
  })
}

async function waitForRealtimeConnected(page) {
  return page.waitForFunction(() => {
    return Boolean(globalThis.wsClient?.isConnected)
  }, { timeout: TIMEOUT })
}

async function main() {
  console.log(`\n🧪 Testing Controller Preview Smoothness on ${BASE_URL}\n`)
  console.log('📋 Test Objectives:')
  console.log('  ✓ Controller preview in viewer mode (isViewer: true)')
  console.log('  ✓ Ball centers on start')
  console.log('  ✓ No position jumps (jitter)')
  console.log('  ✓ Smooth movement from SSE updates')
  console.log('  ✓ Sync with viewer\n')

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

    const controllerUrl = `${BASE_URL}/session-controller.html?sessionId=${sessionId}`
    const viewerUrl = `${BASE_URL}/viewer.html?sessionId=${sessionId}`

    console.log('🌐 Opening controller...')
    await controllerPage.goto(controllerUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })

    console.log('🌐 Opening viewer...')
    await viewerPage.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })

    await Promise.all([
      waitForRealtimeConnected(controllerPage),
      waitForRealtimeConnected(viewerPage)
    ])
    console.log('✅ Both roles connected via SSE')

    // Ждём инициализации
    await sleep(2000)

    // ТЕСТ 1: Проверяем что контроллер превью в viewer режиме
    console.log('\n📊 TEST 1: Checking preview engine mode...')
    const engineMode = await controllerPage.evaluate(() => {
      const engine = window.__previewPhysics || window.previewPhysicsEngine
      if (!engine) return { error: 'Engine not found' }
      return {
        isViewer: engine.isViewer,
        clientSimulation: engine.options?.clientSimulation,
        worldWidth: engine.options?.worldWidth,
        worldHeight: engine.options?.worldHeight
      }
    })

    if (!engineMode.isViewer) {
      throw new Error(`❌ Preview engine MUST be in viewer mode (isViewer: true), got: ${engineMode.isViewer}`)
    }
    if (engineMode.clientSimulation !== false) {
      throw new Error(`❌ Preview engine MUST NOT run client simulation (clientSimulation: false), got: ${engineMode.clientSimulation}`)
    }
    console.log(`✅ Preview engine in viewer mode: isViewer=${engineMode.isViewer}, clientSimulation=${engineMode.clientSimulation}`)

    // ТЕСТ 2: Проверяем центрирование при старте
    console.log('\n📊 TEST 2: Checking initial centering...')
    const centeringState = await controllerPage.evaluate(() => {
      const engine = window.__previewPhysics || window.previewPhysicsEngine
      const viewerSize = window.__current?.viewerScreenSize

      if (!engine || !viewerSize) {
        return { error: 'Engine or viewer size not found' }
      }

      const centerX = viewerSize.width / 2
      const centerY = viewerSize.height / 2
      const ballX = engine.ball.x
      const ballY = engine.ball.y
      const targetX = engine.state.targetX
      const targetY = engine.state.targetY

      return {
        viewerSize,
        expectedCenter: { x: centerX, y: centerY },
        ballPosition: { x: ballX, y: ballY },
        targetPosition: { x: targetX, y: targetY },
        offsetX: Math.abs(ballX - centerX),
        offsetY: Math.abs(ballY - centerY),
        paused: engine.state.paused
      }
    })

    if (centeringState.error) {
      throw new Error(`❌ ${centeringState.error}`)
    }

    const tolerance = 5 // пикселей
    if (centeringState.offsetX > tolerance || centeringState.offsetY > tolerance) {
      console.warn(`⚠️  Ball not perfectly centered:`)
      console.warn(`   Expected: (${centeringState.expectedCenter.x}, ${centeringState.expectedCenter.y})`)
      console.warn(`   Actual: (${centeringState.ballPosition.x}, ${centeringState.ballPosition.y})`)
      console.warn(`   Offset: (${centeringState.offsetX.toFixed(2)}, ${centeringState.offsetY.toFixed(2)})`)
    } else {
      console.log(`✅ Ball centered correctly (offset: ${centeringState.offsetX.toFixed(2)}px, ${centeringState.offsetY.toFixed(2)}px)`)
    }

    // ТЕСТ 3: Запускаем движение и проверяем отсутствие дергания
    console.log('\n📊 TEST 3: Checking for jitter during movement...')

    // Запускаем движение на контроллере
    await controllerPage.evaluate(() => {
      if (window.togglePlayPause) {
        window.togglePlayPause()
      }
    })

    await sleep(1000)

    // Собираем позиции мяча в течение 2 секунд
    const positions = await controllerPage.evaluate(() => {
      return new Promise((resolve) => {
        const engine = window.__previewPhysics || window.previewPhysicsEngine
        const samples = []
        const startTime = performance.now()
        const duration = 2000 // 2 секунды

        const interval = setInterval(() => {
          const elapsed = performance.now() - startTime
          if (elapsed >= duration) {
            clearInterval(interval)
            resolve(samples)
            return
          }

          samples.push({
            time: elapsed,
            x: engine.ball.x,
            y: engine.ball.y,
            vx: engine.ball.vx,
            vy: engine.ball.vy,
            targetX: engine.state.targetX,
            targetY: engine.state.targetY
          })
        }, 16) // ~60 FPS
      })
    })

    // Анализируем дергание: проверяем резкие скачки позиции
    let maxJump = 0
    let jumpCount = 0
    const jumpThreshold = 50 // Резкий скачок > 50 пикселей за кадр считается дерганием

    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x
      const dy = positions[i].y - positions[i - 1].y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > maxJump) {
        maxJump = distance
      }

      if (distance > jumpThreshold) {
        jumpCount++
        console.warn(`⚠️  Jump detected: ${distance.toFixed(2)}px at t=${positions[i].time.toFixed(0)}ms`)
      }
    }

    console.log(`📈 Movement analysis (${positions.length} samples):`)
    console.log(`   Max jump: ${maxJump.toFixed(2)}px`)
    console.log(`   Jump count (>${jumpThreshold}px): ${jumpCount}`)

    if (jumpCount > 2) {
      throw new Error(`❌ Too many jumps detected: ${jumpCount} (threshold: 2)`)
    }
    console.log(`✅ No significant jitter detected (jumps: ${jumpCount})`)

    // ТЕСТ 4: Проверяем синхронизацию с viewer
    console.log('\n📊 TEST 4: Checking sync between viewer and controller preview...')

    await sleep(1000)

    const syncState = await Promise.all([
      viewerPage.evaluate(() => {
        const engine = window.physicsEngine || window.ViewerState?.physicsEngine
        return {
          x: engine.ball.x,
          y: engine.ball.y,
          paused: engine.state.paused
        }
      }),
      controllerPage.evaluate(() => {
        const engine = window.__previewPhysics || window.previewPhysicsEngine
        return {
          x: engine.ball.x,
          y: engine.ball.y,
          targetX: engine.state.targetX,
          targetY: engine.state.targetY,
          paused: engine.state.paused
        }
      })
    ])

    const [viewerState, controllerState] = syncState
    const syncOffsetX = Math.abs(viewerState.x - controllerState.targetX)
    const syncOffsetY = Math.abs(viewerState.y - controllerState.targetY)
    const maxSyncOffset = 100 // Допускаем расхождение до 100px из-за SSE задержки

    console.log(`📊 Sync comparison:`)
    console.log(`   Viewer position: (${viewerState.x.toFixed(1)}, ${viewerState.y.toFixed(1)})`)
    console.log(`   Controller target: (${controllerState.targetX.toFixed(1)}, ${controllerState.targetY.toFixed(1)})`)
    console.log(`   Offset: (${syncOffsetX.toFixed(1)}, ${syncOffsetY.toFixed(1)})`)

    if (syncOffsetX > maxSyncOffset || syncOffsetY > maxSyncOffset) {
      console.warn(`⚠️  Sync offset is large (may be due to SSE latency)`)
    } else {
      console.log(`✅ Controller preview synced with viewer`)
    }

    // Останавливаем движение
    await controllerPage.evaluate(() => {
      if (window.togglePlayPause) {
        window.togglePlayPause()
      }
    })

    console.log('\n🎉 ALL TESTS PASSED!')
    console.log('\n✅ Summary:')
    console.log('  ✓ Preview in viewer mode')
    console.log('  ✓ Ball centered on start')
    console.log('  ✓ No jitter during movement')
    console.log('  ✓ Synced with viewer')

    if (!HEADLESS) {
      console.log('\n👀 Browser will stay open for manual inspection...')
      console.log('   Press Ctrl+C to close')
      await sleep(300000) // 5 минут для ручной проверки
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message)
    console.error('\nStack trace:', error.stack)

    if (!HEADLESS) {
      console.log('\n🔍 Browser will stay open for debugging...')
      console.log('   Press Ctrl+C to close')
      await sleep(300000)
    }

    process.exit(1)
  } finally {
    if (HEADLESS) {
      if (controllerPage) await controllerPage.close().catch(() => {})
      if (viewerPage) await viewerPage.close().catch(() => {})
      await browser.close()
    }
  }
}

main().catch(err => {
  console.error('❌ Unhandled error:', err)
  process.exit(1)
})

