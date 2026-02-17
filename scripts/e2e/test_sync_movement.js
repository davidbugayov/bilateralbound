#!/usr/bin/env node
/**
 * E2E Test: Smooth Sync Movement между Controller и Viewer
 * TDD подход: тест должен пройти когда синхронизация работает правильно
 *
 * Проверяет:
 * 1. Старт движения - мяч начинает двигаться после нажатия Play
 * 2. Синхронизация позиций - Controller Preview и Viewer двигаются синхронно
 * 3. Плавность движения - нет резких скачков, vx/vy != 0
 * 4. Синхронизация свойств - цвет, размер, направление, скорость
 */

const puppeteer = require('puppeteer')
const { execSync } = require('child_process')

// Конфигурация
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS !== 'false'
const SYNC_TOLERANCE = 150 // Допустимое расхождение позиций в пикселях
const MIN_VELOCITY = 10 // Минимальная скорость для "движения"

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function createSession() {
  try {
    const cmd = `curl -s -X POST "${BASE_URL}/api/session"`
    const output = execSync(cmd).toString()
    return JSON.parse(output).sessionId
  } catch (e) {
    console.error('❌ Failed to create session:', e.message)
    throw e
  }
}

// Получение состояния вьювера
async function getViewerState(page) {
  return page.evaluate(() => {
    const engine = window.physicsEngine
    if (!engine || !engine.ball) return null
    return {
      x: engine.ball.x,
      y: engine.ball.y,
      vx: engine.ball.vx,
      vy: engine.ball.vy,
      radius: engine.ball.radius,
      speed: engine.ball.speed,
      colorBall: engine.colors?.ball,
      colorBg: engine.colors?.bg,
      paused: engine.state?.paused ?? true,
      dirX: engine.state?.lastDirection?.x ?? 0,
      dirY: engine.state?.lastDirection?.y ?? 0
    }
  })
}

// Получение состояния контроллера (preview)
// Note: Controller preview может использовать интерполяцию (smoothVx/smoothVy)
async function getControllerState(page) {
  return page.evaluate(() => {
    const engine = window.__previewPhysics || window.previewPhysicsEngine
    if (!engine || !engine.ball) return null
    // Controller preview в режиме isViewer использует smoothVx/smoothVy для интерполяции
    // ball.vx/vy могут быть 0, но smoothVx/smoothVy показывают реальное движение
    const effectiveVx = engine.state?.smoothVx || engine.ball.vx || 0
    const effectiveVy = engine.state?.smoothVy || engine.ball.vy || 0
    return {
      x: engine.ball.x,
      y: engine.ball.y,
      vx: effectiveVx,
      vy: effectiveVy,
      radius: engine.ball.radius,
      speed: engine.ball.speed,
      colorBall: engine.colors?.ball,
      colorBg: engine.colors?.bg,
      paused: engine.state?.paused ?? true,
      dirX: engine.state?.lastDirection?.x ?? 0,
      dirY: engine.state?.lastDirection?.y ?? 0
    }
  })
}

// Результаты тестов
const results = {
  passed: 0,
  failed: 0,
  tests: []
}

function test(name, passed, details = '') {
  if (passed) {
    console.log(`✅ ${name}`)
    results.passed++
  } else {
    console.log(`❌ ${name}${details ? ': ' + details : ''}`)
    results.failed++
  }
  results.tests.push({ name, passed, details })
}

async function run() {
  console.log(`\n🚀 E2E Sync Movement Test`)
  console.log(`📍 URL: ${BASE_URL}`)
  console.log(`🔧 Headless: ${HEADLESS}\n`)

  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  })

  try {
    // 1. Создаём сессию
    const sessionId = await createSession()
    console.log(`✅ Session: ${sessionId}\n`)

    // 2. Открываем страницы
    const controllerPage = await browser.newPage()
    const viewerPage = await browser.newPage()

    controllerPage.setDefaultNavigationTimeout(30000)
    viewerPage.setDefaultNavigationTimeout(30000)

    // Логирование консоли
    viewerPage.on('console', msg => {
      if (msg.type() === 'error') console.log(`[VIEWER ERR] ${msg.text()}`)
    })
    controllerPage.on('console', msg => {
      if (msg.type() === 'error') console.log(`[CTRL ERR] ${msg.text()}`)
    })

    const controllerUrl = `${BASE_URL}/session-controller.html?sessionId=${sessionId}`
    const viewerUrl = `${BASE_URL}/viewer.html?sessionId=${sessionId}`

    // Загружаем страницы
    await Promise.all([
      controllerPage.goto(controllerUrl, { waitUntil: 'domcontentloaded' }),
      viewerPage.goto(viewerUrl, { waitUntil: 'domcontentloaded' })
    ])

    console.log('📄 Pages loaded, waiting for initialization...')

    // Ждём инициализации
    await viewerPage.waitForFunction(() => window.physicsEngine, { timeout: 15000 })
    await controllerPage.waitForFunction(
      () => window.__previewPhysics || window.previewPhysicsEngine,
      { timeout: 15000 }
    )

    console.log('✅ Physics engines initialized')
    await sleep(2000) // Ждём SSE подключения

    // ==========================================
    // TEST 1: Начальное состояние - мяч на паузе
    // ==========================================
    console.log('\n🧪 Test 1: Initial State (paused)')

    let viewerState = await getViewerState(viewerPage)
    let controllerState = await getControllerState(controllerPage)

    test('Viewer initialized', viewerState !== null)
    test('Controller initialized', controllerState !== null)
    test('Viewer paused initially', viewerState?.paused === true)
    test('Controller paused initially', controllerState?.paused === true)

    // ==========================================
    // TEST 2: Нажимаем Play - мяч должен двигаться
    // ==========================================
    console.log('\n🧪 Test 2: Start Movement (click Play)')

    await controllerPage.evaluate(() => {
      const btn = document.getElementById('playPauseBtn')
      if (btn) btn.click()
      else if (window.togglePlayPause) window.togglePlayPause()
    })

    await sleep(2000) // Даём время на синхронизацию и стабилизацию интерполяции

    viewerState = await getViewerState(viewerPage)
    controllerState = await getControllerState(controllerPage)

    const viewerMoving = viewerState && (Math.abs(viewerState.vx) > MIN_VELOCITY || Math.abs(viewerState.vy) > MIN_VELOCITY)

    // Controller Preview использует интерполяцию - проверяем изменение позиции вместо velocity
    const controllerPos1 = await getControllerState(controllerPage)
    await sleep(500)
    const controllerPos2 = await getControllerState(controllerPage)
    const controllerMoving = controllerPos1 && controllerPos2 &&
      (Math.abs(controllerPos2.x - controllerPos1.x) > 5 || Math.abs(controllerPos2.y - controllerPos1.y) > 5)

    test('Viewer not paused after Play', viewerState?.paused === false, `paused=${viewerState?.paused}`)
    test('Controller not paused after Play', controllerState?.paused === false, `paused=${controllerState?.paused}`)
    test('Viewer ball is moving (vx/vy > 0)', viewerMoving, `vx=${viewerState?.vx?.toFixed(1)}, vy=${viewerState?.vy?.toFixed(1)}`)
    test('Controller ball position changes', controllerMoving,
      `dx=${Math.abs((controllerPos2?.x||0) - (controllerPos1?.x||0)).toFixed(1)}, dy=${Math.abs((controllerPos2?.y||0) - (controllerPos1?.y||0)).toFixed(1)}`)

    // ==========================================
    // TEST 3: Синхронизация позиций
    // ==========================================
    console.log('\n🧪 Test 3: Position Sync')

    // Собираем несколько замеров для проверки плавности и синхронизации
    const samples = []
    for (let i = 0; i < 5; i++) {
      await sleep(300)
      const v = await getViewerState(viewerPage)
      const c = await getControllerState(controllerPage)
      if (v && c) {
        samples.push({ viewer: v, controller: c, time: Date.now() })
      }
    }

    // Проверяем что позиции изменяются (мяч двигается)
    const positionsChange = samples.length >= 2 && (
      Math.abs(samples[0].viewer.x - samples[samples.length - 1].viewer.x) > 5 ||
      Math.abs(samples[0].viewer.y - samples[samples.length - 1].viewer.y) > 5
    )
    test('Ball position changes over time', positionsChange)

    // Проверяем синхронизацию (разница позиций в пределах допуска)
    const lastSample = samples[samples.length - 1]
    if (lastSample) {
      const dx = Math.abs(lastSample.viewer.x - lastSample.controller.x)
      const dy = Math.abs(lastSample.viewer.y - lastSample.controller.y)
      const isSynced = dx < SYNC_TOLERANCE && dy < SYNC_TOLERANCE
      test('Positions synced (tolerance: ' + SYNC_TOLERANCE + 'px)', isSynced,
        `dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`)
    }

    // ==========================================
    // TEST 4: Плавность движения (нет резких скачков)
    // ==========================================
    console.log('\n🧪 Test 4: Smooth Movement')

    let maxJump = 0
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1].viewer
      const curr = samples[i].viewer
      const jump = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2))
      const dt = (samples[i].time - samples[i - 1].time) / 1000
      const jumpPerSec = jump / dt
      if (jumpPerSec > maxJump) maxJump = jumpPerSec
    }

    // При скорости 30% от 5000px/s = 1500px/s максимум
    // С учётом задержки SSE допускаем до 2000px/s
    test('Movement is smooth (no teleports)', maxJump < 3000, `max velocity: ${maxJump.toFixed(0)}px/s`)

    // ==========================================
    // TEST 5: Синхронизация свойств
    // ==========================================
    console.log('\n🧪 Test 5: Properties Sync')

    if (lastSample) {
      test('Color synced', lastSample.viewer.colorBall === lastSample.controller.colorBall,
        `viewer=${lastSample.viewer.colorBall}, ctrl=${lastSample.controller.colorBall}`)
      test('Radius synced', lastSample.viewer.radius === lastSample.controller.radius,
        `viewer=${lastSample.viewer.radius}, ctrl=${lastSample.controller.radius}`)
      test('Direction synced',
        Math.abs(lastSample.viewer.dirX - lastSample.controller.dirX) < 0.1 &&
        Math.abs(lastSample.viewer.dirY - lastSample.controller.dirY) < 0.1,
        `viewer=(${lastSample.viewer.dirX},${lastSample.viewer.dirY}), ctrl=(${lastSample.controller.dirX},${lastSample.controller.dirY})`)
    }

    // ==========================================
    // TEST 6: Пауза
    // ==========================================
    console.log('\n🧪 Test 6: Pause')

    await controllerPage.evaluate(() => {
      const btn = document.getElementById('playPauseBtn')
      if (btn) btn.click()
      else if (window.togglePlayPause) window.togglePlayPause()
    })

    await sleep(1000)

    viewerState = await getViewerState(viewerPage)
    controllerState = await getControllerState(controllerPage)

    test('Viewer paused after stop', viewerState?.paused === true, `paused=${viewerState?.paused}`)
    test('Controller paused after stop', controllerState?.paused === true, `paused=${controllerState?.paused}`)

    // ==========================================
    // Итоги
    // ==========================================
    console.log('\n' + '='.repeat(50))
    console.log(`📊 Results: ${results.passed}/${results.passed + results.failed} passed`)

    if (results.failed === 0) {
      console.log('✅ All tests passed!')
    } else {
      console.log(`❌ ${results.failed} test(s) failed`)
      results.tests.filter(t => !t.passed).forEach(t => {
        console.log(`   - ${t.name}${t.details ? ': ' + t.details : ''}`)
      })
    }

  } catch (error) {
    console.error('\n❌ Test execution error:', error.message)
    results.failed++
  } finally {
    await browser.close()
  }

  process.exit(results.failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})





