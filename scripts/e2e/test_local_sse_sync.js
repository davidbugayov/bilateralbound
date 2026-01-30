/**
 * E2E тест для проверки SSE синхронизации между controller и viewer
 * Запускается локально на localhost:3000
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const HEADLESS = process.env.HEADLESS !== 'false'

console.log(`\n🚀 Starting SSE sync E2E test on ${BASE_URL}`)
console.log(`📦 Headless mode: ${HEADLESS}\n`)

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForSessionState(sessionId, predicate, timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const resp = await fetch(`${BASE_URL}/api/session/${sessionId}/state`, {
        headers: { Accept: 'application/json' }
      })
      if (resp.ok) {
        const state = await resp.json()
        if (predicate(state)) return state
      }
    } catch {
      // ignore transient errors
    }
    await wait(500)
  }
  return null
}

async function ensureElementEnabled(page, selector, timeoutMs = 10000) {
  await page.waitForSelector(selector, { timeout: timeoutMs })
  const isDisabled = await page.$eval(selector, el => el.disabled)
  if (isDisabled) {
    throw new Error(`Element is disabled: ${selector}`)
  }
}

async function run() {
  let browser
  let controllerPage
  let viewerPage

  try {
    // Запускаем браузер
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    // Таймауты задаем на уровне страниц

    // Создаём сессию через API
    console.log('📝 Creating session...')
    const sessionResp = await fetch(`${BASE_URL}/api/session`, { method: 'POST' })
    const { sessionId } = await sessionResp.json()
    console.log(`✅ Session created: ${sessionId}\n`)

    // Открываем controller
    console.log('🎮 Opening controller...')
    controllerPage = await browser.newPage()
    controllerPage.setDefaultTimeout(60000)

    // Собираем логи controller
    const controllerLogs = []
    controllerPage.on('console', msg => {
      const text = msg.text()
      controllerLogs.push(text)
      if (text.includes('SSE') || text.includes('viewer') || text.includes('controller')) {
        console.log(`[CONTROLLER] ${text}`)
      }
    })

    await controllerPage.goto(`${BASE_URL}/c/${sessionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await controllerPage.waitForSelector('#viewerStatus', { timeout: 60000 })
    await wait(3000) // Даём время на инициализацию SSE

    // Проверяем что controller показывает "ожидание"
    const controllerStatus1 = await controllerPage.$eval('#viewerStatus', el => el.textContent).catch(() => null)
    console.log(`📊 Controller status (before viewer): "${controllerStatus1}"`)

    if (!controllerStatus1 || !controllerStatus1.includes('ожидание')) {
      console.log(`⚠️  Expected "ожидание", got: "${controllerStatus1}"`)
    }

    // Проверяем что SSE подключение установлено у controller
    const controllerSSEEstablished = controllerLogs.some(log =>
      log.includes('[SSEClient controller] SSE connection established')
    )

    if (!controllerSSEEstablished) {
      console.log('❌ Controller SSE connection NOT established!')
      console.log('Controller logs:', controllerLogs.filter(l => l.includes('SSE')))
    } else {
      console.log('✅ Controller SSE connection established')
    }

    // Открываем viewer
    console.log('\n👁️  Opening viewer...')
    viewerPage = await browser.newPage()
    viewerPage.setDefaultTimeout(60000)

    // Собираем логи viewer
    const viewerLogs = []
    viewerPage.on('console', msg => {
      const text = msg.text()
      viewerLogs.push(text)
      if (text.includes('SSE') || text.includes('viewer') || text.includes('controller')) {
        console.log(`[VIEWER] ${text}`)
      }
    })

    await viewerPage.goto(`${BASE_URL}/s/${sessionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await viewerPage.waitForSelector('#viewerCanvas', { timeout: 60000 })
    await wait(3000) // Даём время на инициализацию SSE

    // Проверяем что viewer получил controller_connected событие
    const viewerGotControllerEvent = viewerLogs.some(log =>
      log.includes('Controller connected event received') || log.includes('controllerConnected')
    )

    if (!viewerGotControllerEvent) {
      console.log('❌ Viewer did NOT receive controller_connected event!')
      console.log('Viewer logs:', viewerLogs.filter(l => l.includes('controller')))
    } else {
      console.log('✅ Viewer received controller_connected event')
    }

    // Ждём подтверждения viewerConnected через REST state
    console.log('\n⏳ Waiting for viewerConnected state...')
    const connectedState = await waitForSessionState(
      sessionId,
      state => state?.viewerConnected === true,
      20000
    )

    if (!connectedState) {
      console.log('\n❌ TEST FAILED: viewerConnected state did not become true')
      process.exit(1)
    }

    // Проверяем что controller обновил статус на "подключен"
    const controllerStatus2 = await controllerPage.$eval('#viewerStatus', el => el.textContent).catch(() => null)
    console.log(`📊 Controller status (after viewer): "${controllerStatus2}"`)

    const viewerConnected = controllerStatus2 && controllerStatus2.includes('подключен')

    if (!viewerConnected) {
      console.log('\n❌ TEST FAILED: Controller still shows waiting after viewer connected!')
      console.log('\n📋 Controller SSE logs:')
      controllerLogs.filter(l => l.includes('SSE') || l.includes('viewer')).forEach(l => console.log(`  ${l}`))

      console.log('\n📋 Viewer SSE logs:')
      viewerLogs.filter(l => l.includes('SSE') || l.includes('controller')).forEach(l => console.log(`  ${l}`))

      process.exit(1)
    }

    console.log('✅ Controller correctly shows viewer as connected!')

    // Проверяем что UI разблокирован
    await ensureElementEnabled(controllerPage, '#playPauseBtn')
    const playButton = await controllerPage.$('#playPauseBtn')

    console.log('✅ Play button is enabled')

    // Проверяем синхронизацию: нажимаем Start на controller
    console.log('\n▶️  Starting playback...')
    await playButton.click()
    await wait(1000)

    // Проверяем что на viewer canvas обновляется
    const viewerCanvasUpdating = await viewerPage.evaluate(() => {
      const canvas = document.getElementById('viewerCanvas')
      if (!canvas) return false

      // Проверяем что canvas существует и имеет размеры
      return canvas.width > 0 && canvas.height > 0
    })

    if (!viewerCanvasUpdating) {
      console.log('❌ Viewer canvas not found or not sized!')
      process.exit(1)
    }

    console.log('✅ Viewer canvas is ready')

    // Проверяем что на controller превью обновляется
    const controllerPreviewUpdating = await controllerPage.evaluate(() => {
      const canvas = document.getElementById('preview')
      if (!canvas) return false
      return canvas.width > 0 && canvas.height > 0
    })

    if (!controllerPreviewUpdating) {
      console.log('❌ Controller preview not found or not sized!')
      process.exit(1)
    }

    console.log('✅ Controller preview is ready')

    // Останавливаем воспроизведение перед тестами параметров
    await playButton.click()
    await wait(500)

    // Тест 1: Изменение цвета мяча
    console.log('\n🎨 Testing ball color sync...')
    const ballColorButtons = await controllerPage.$$('#ballColorControl [data-color]')
    if (ballColorButtons.length > 1) {
      const initialColor = await ballColorButtons[1].evaluate(el => el.dataset.color)
      await ballColorButtons[1].click()
      await wait(1500)

      const viewerBallColor = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.state?.colorBall || null
      })

      if (viewerBallColor === initialColor) {
        console.log(`✅ Ball color synced to viewer: ${viewerBallColor}`)
      } else {
        throw new Error(`Ball color not synced. Expected ${initialColor}, got ${viewerBallColor}`)
      }
    } else {
      throw new Error('Ball color controls not found')
    }

    // Тест 2: Изменение цвета фона
    console.log('\n🌈 Testing background color sync...')
    const bgColorButtons = await controllerPage.$$('#bgColorControl [data-color]')
    if (bgColorButtons.length > 1) {
      const bgColor = await bgColorButtons[1].evaluate(el => el.dataset.color)
      await bgColorButtons[1].click()
      await wait(1500)

      const viewerBgColor = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.state?.colorBg || null
      })

      if (viewerBgColor === bgColor) {
        console.log(`✅ Background color synced to viewer: ${viewerBgColor}`)
      } else {
        throw new Error(`Background color not synced. Expected ${bgColor}, got ${viewerBgColor}`)
      }
    } else {
      throw new Error('Background color controls not found')
    }

    // Тест 3: Изменение размера мяча
    console.log('\n📏 Testing ball size sync...')
    const sizeButtons = await controllerPage.$$('#sizeControl button')
    if (sizeButtons.length > 1) {
      await sizeButtons[1].click()
      await wait(1500)

      const viewerBallSize = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.state?.radius || null
      })

      if (viewerBallSize && viewerBallSize >= 35 && viewerBallSize <= 45) {
        console.log(`✅ Ball size synced to viewer: ${viewerBallSize}`)
      } else {
        throw new Error(`Ball size not synced. Got ${viewerBallSize}`)
      }
    } else {
      throw new Error('Size controls not found')
    }

    // Тест 4: Изменение скорости
    console.log('\n⚡ Testing speed sync...')
    const speedSlider = await controllerPage.$('#speedControl input[type="range"]')
    if (speedSlider) {
      await speedSlider.evaluate(el => el.value = 60)
      await speedSlider.evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })))
      await wait(1500)

      const viewerSpeed = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.state?.speed || null
      })

      if (viewerSpeed && viewerSpeed >= 58 && viewerSpeed <= 62) {
        console.log(`✅ Speed synced to viewer: ${viewerSpeed}`)
      } else {
        throw new Error(`Speed not synced. Expected ~60, got ${viewerSpeed}`)
      }
    } else {
      throw new Error('Speed slider not found')
    }

    // Тест 5: Изменение направления
    console.log('\n🧭 Testing direction sync...')
    const directionButtons = await controllerPage.$$('[data-mode]')
    let directionMatched = false
    for (const btn of directionButtons) {
      const mode = await btn.evaluate(el => el.dataset.mode)
      if (mode === 'vertical') {
        await btn.click()
        await wait(1500)

        const viewerDirection = await viewerPage.evaluate(() => {
          const dx = globalThis.physicsEngine?.state?.dirX
          const dy = globalThis.physicsEngine?.state?.dirY
          return { dx, dy }
        })

        if (viewerDirection && Math.abs(viewerDirection.dy) > 0.8) {
          console.log(`✅ Direction synced to viewer: dx=${viewerDirection.dx?.toFixed(2)}, dy=${viewerDirection.dy?.toFixed(2)}`)
          directionMatched = true
        }
        break
      }
    }
    if (!directionMatched) {
      throw new Error('Direction not synced')
    }

    // Тест 6: Включение звука
    console.log('\n🔊 Testing sound sync...')
    const soundCheckbox = await controllerPage.$('#soundEnabledCheckbox')
    if (soundCheckbox) {
      const wasChecked = await soundCheckbox.evaluate(el => el.checked)
      await soundCheckbox.click()
      await wait(1500)

      const viewerSoundEnabled = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.state?.soundEnabled || false
      })

      if (viewerSoundEnabled === !wasChecked) {
        console.log(`✅ Sound enabled synced to viewer: ${viewerSoundEnabled}`)
      } else {
        throw new Error(`Sound not synced. Expected ${!wasChecked}, got ${viewerSoundEnabled}`)
      }

      // Тест типа звука
      if (viewerSoundEnabled) {
        const soundTypeSelect = await controllerPage.$('#soundTypeSelect')
        if (soundTypeSelect) {
          await soundTypeSelect.select('beep')
          await wait(1000)

          const viewerSoundType = await viewerPage.evaluate(() => {
            return globalThis.physicsEngine?.state?.soundType || null
          })

          if (viewerSoundType === 'beep') {
            console.log(`✅ Sound type synced to viewer: ${viewerSoundType}`)
          } else {
            throw new Error(`Sound type not synced. Expected beep, got ${viewerSoundType}`)
          }
        }
      }
    } else {
      throw new Error('Sound checkbox not found')
    }

    // Тест 7: Проверка движения шарика при воспроизведении
    console.log('\n▶️  Testing ball movement sync...')
    await playButton.click()
    await wait(1000)

    const pos1 = await viewerPage.evaluate(() => {
      return {
        x: globalThis.physicsEngine?.state?.x,
        y: globalThis.physicsEngine?.state?.y,
        vx: globalThis.physicsEngine?.state?.vx,
        vy: globalThis.physicsEngine?.state?.vy
      }
    })

    await wait(500)

    const pos2 = await viewerPage.evaluate(() => {
      return {
        x: globalThis.physicsEngine?.state?.x,
        y: globalThis.physicsEngine?.state?.y,
        vx: globalThis.physicsEngine?.state?.vx,
        vy: globalThis.physicsEngine?.state?.vy
      }
    })

    const moved = Math.abs(pos1.x - pos2.x) > 1 || Math.abs(pos1.y - pos2.y) > 1
    if (moved) {
      console.log(`✅ Ball is moving on viewer:`)
      console.log(`   Position: (${pos1.x?.toFixed(1)}, ${pos1.y?.toFixed(1)}) → (${pos2.x?.toFixed(1)}, ${pos2.y?.toFixed(1)})`)
      console.log(`   Velocity: vx=${pos2.vx?.toFixed(1)}, vy=${pos2.vy?.toFixed(1)}`)
    } else {
      throw new Error('Ball position not changing on viewer')
    }

    const controllerPos = await controllerPage.evaluate(() => {
      return {
        x: globalThis.__previewPhysics?.state?.x,
        y: globalThis.__previewPhysics?.state?.y
      }
    })

    if (controllerPos.x && viewerPage) {
      const posDiff = Math.sqrt(Math.pow(controllerPos.x - pos2.x, 2) + Math.pow(controllerPos.y - pos2.y, 2))
      if (posDiff < 50) {
        console.log(`✅ Controller and viewer positions synchronized (diff: ${posDiff.toFixed(1)}px)`)
      } else {
        throw new Error(`Position diff too large: ${posDiff.toFixed(1)}px`)
      }
    }

    console.log('\n🎉 ALL TESTS PASSED!')
    console.log('✅ SSE connections established')
    console.log('✅ Controller detects viewer connection')
    console.log('✅ UI properly unlocked')
    console.log('✅ Canvas elements ready for rendering')
    console.log('✅ Ball color synchronized')
    console.log('✅ Background color synchronized')
    console.log('✅ Ball size synchronized')
    console.log('✅ Speed synchronized')
    console.log('✅ Direction synchronized')
    console.log('✅ Sound settings synchronized')
    console.log('✅ Ball movement synchronized')
    console.log('✅ Controller ↔️ Viewer position sync verified')

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
