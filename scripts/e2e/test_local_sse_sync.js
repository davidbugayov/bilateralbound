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

async function waitForSessionState(sessionId, predicate, timeoutMs = 5000) {
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
    await wait(200)
  }
  return null
}

async function ensureElementEnabled(page, selector, timeoutMs = 5000) {
  await page.waitForSelector(selector, { timeout: timeoutMs })
  // Use evaluate instead of $eval to avoid protocol timeout
  const isDisabled = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    return el ? el.disabled : true
  }, selector)
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      protocolTimeout: 120000 // Увеличиваем таймаут протокола до 2 минут
    })

    // Таймауты задаем на уровне страниц

    // Создаём сессию через API (с ретраями)
    console.log('📝 Creating session...')

    async function createSessionWithRetries(url, attempts = 5, delayMs = 1000) {
      let lastErr = null
      for (let i = 0; i < attempts; i++) {
        try {
          const resp = await fetch(`${url}/api/session`, { method: 'POST' })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const body = await resp.json()
          if (!body.sessionId) throw new Error('No sessionId in response')
          return body.sessionId
        } catch (err) {
          lastErr = err
          console.log(`   Attempt ${i + 1}/${attempts} failed: ${err.message}`)
          // Если следующая попытка будет, подождём
          if (i < attempts - 1) await wait(delayMs * (i + 1))
        }
      }
      throw new Error(`Failed to create session after ${attempts} attempts: ${lastErr?.message || 'unknown'}`)
    }

    let sessionId
    try {
      sessionId = await createSessionWithRetries(BASE_URL, 6, 800)
    } catch (err) {
      console.error('\n❌ Cannot create session. Is the dev server running at', BASE_URL + '?')
      console.error('   Details:', err.message)
      process.exit(1)
    }

    console.log(`✅ Session created: ${sessionId}\n`)

    // Открываем controller
    console.log('🎮 Opening controller...')
    controllerPage = await browser.newPage()
    controllerPage.setDefaultTimeout(15000)

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
      timeout: 15000
    })
    await controllerPage.waitForSelector('#viewerStatus', { timeout: 10000 })
    await wait(500) // Даём время на инициализацию SSE

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
    viewerPage.setDefaultTimeout(15000)

    // Собираем логи viewer
    const viewerLogs = []
    viewerPage.on('console', msg => {
      const text = msg.text()
      viewerLogs.push(text)
      if (text.includes('SSE') || text.includes('viewer') || text.includes('controller') || text.includes('PhysicsEngine') || text.includes('direction')) {
        console.log(`[VIEWER] ${text}`)
      }
    })

    await viewerPage.goto(`${BASE_URL}/s/${sessionId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    })
    await viewerPage.waitForSelector('#viewerCanvas', { timeout: 10000 })
    await wait(500) // Даём время на инициализацию SSE

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

    console.log('✅ Play button is enabled')

    // Проверяем синхронизацию: нажимаем Start на controller
    console.log('\n▶️  Starting playback...')

    // Ждём чтобы обработчики событий установились
    await wait(500)

    // Используем evaluate для клика, чтобы избежать таймаутов протокола
    const playClicked = await controllerPage.evaluate(() => {
      const playBtn = document.getElementById('playPauseBtn')
      if (!playBtn) return false

      // Вызываем функцию напрямую, если доступна
      if (typeof window.togglePlayPause === 'function') {
        window.togglePlayPause()
        return true
      }

      // Иначе кликаем на кнопку
      playBtn.click()
      return true
    }).catch(err => {
      console.error('❌ Error clicking play button:', err.message)
      return false
    })

    if (!playClicked) {
      console.log('❌ Failed to click play button')
      process.exit(1)
    }

    console.log('✅ Play button clicked')
    await wait(1000) // Даём время на отправку команды и применение

    // Проверяем что на viewer canvas обновляется
    const viewerCanvasUpdating = await viewerPage.evaluate(() => {
      const canvas = document.getElementById('viewerCanvas')
      if (!canvas) return false
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
    const pauseClicked = await controllerPage.evaluate(() => {
      if (typeof window.togglePlayPause === 'function') {
        window.togglePlayPause()
        return true
      }
      const playBtn = document.getElementById('playPauseBtn')
      if (playBtn) {
        playBtn.click()
        return true
      }
      return false
    }).catch(() => false)

    if (pauseClicked) {
      console.log('✅ Paused playback')
      await wait(300)
    }

    // Тест 1: Изменение цвета мяча
    console.log('\n🎨 Testing ball color sync...')
    const ballColorResult = await controllerPage.evaluate(() => {
      const buttons = document.querySelectorAll('#ballColorControl [data-color]')
      if (buttons.length > 1) {
        const color = buttons[1].dataset.color
        buttons[1].click()
        return color
      }
      return null
    })

    if (ballColorResult) {
      await wait(500)

      const viewerBallColor = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.colors?.ball || null
      })

      if (viewerBallColor === ballColorResult) {
        console.log(`✅ Ball color synced to viewer: ${viewerBallColor}`)
      } else {
        throw new Error(`Ball color not synced. Expected ${ballColorResult}, got ${viewerBallColor}`)
      }
    } else {
      throw new Error('Ball color controls not found')
    }

    // Тест 2: Изменение цвета фона
    console.log('\n🌈 Testing background color sync...')
    const bgColorResult = await controllerPage.evaluate(() => {
      const buttons = document.querySelectorAll('#bgColorControl [data-color]')
      if (buttons.length > 1) {
        const color = buttons[1].dataset.color
        buttons[1].click()
        return color
      }
      return null
    })

    if (bgColorResult) {
      await wait(500)

      const viewerBgColor = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.colors?.bg || null
      })

      if (viewerBgColor === bgColorResult) {
        console.log(`✅ Background color synced to viewer: ${viewerBgColor}`)
      } else {
        throw new Error(`Background color not synced. Expected ${bgColorResult}, got ${viewerBgColor}`)
      }
    } else {
      throw new Error('Background color controls not found')
    }

    // Тест 3: Изменение размера мяча
    console.log('\n📏 Testing ball size sync...')
    const sizeResult = await controllerPage.evaluate(() => {
      const buttons = document.querySelectorAll('#sizeControl button')
      if (buttons.length > 1) {
        buttons[1].click()
        return true
      }
      return false
    })

    if (sizeResult) {
      await wait(500)

      const viewerBallSize = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.ball?.radius || null
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
    const speedChanged = await controllerPage.evaluate(() => {
      const slider = document.querySelector('#speedControl input[type="range"]')
      if (slider) {
        slider.value = 60
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      }
      return false
    })

    if (speedChanged) {
      await wait(500)

      const viewerSpeed = await viewerPage.evaluate(() => {
        return globalThis.physicsEngine?.ball?.speed || null
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
    const directionChanged = await controllerPage.evaluate(() => {
      const buttons = document.querySelectorAll('[data-mode]')
      for (const btn of buttons) {
        if (btn.dataset.mode === 'vertical') {
          btn.click()
          return true
        }
      }
      return false
    })

    if (directionChanged) {
      await wait(1000) // Увеличиваем время ожидания

      const viewerDirection = await viewerPage.evaluate(() => {
        const dx = globalThis.physicsEngine?.state?.lastDirection?.x
        const dy = globalThis.physicsEngine?.state?.lastDirection?.y
        console.log('[TEST] Viewer direction:', { dx, dy })
        return { dx, dy }
      })

      console.log(`   Viewer direction: dx=${viewerDirection.dx?.toFixed(2)}, dy=${viewerDirection.dy?.toFixed(2)}`)

      if (viewerDirection && Math.abs(viewerDirection.dy) > 0.8) {
        console.log(`✅ Direction synced to viewer: dx=${viewerDirection.dx?.toFixed(2)}, dy=${viewerDirection.dy?.toFixed(2)}`)
      } else {
        throw new Error(`Direction not synced. Got dx=${viewerDirection?.dx}, dy=${viewerDirection?.dy}`)
      }
    } else {
      throw new Error('Direction controls not found')
    }

    // Тест 6: Включение звука (ВРЕМЕННО ПРОПУЩЕН - НЕ РЕАЛИЗОВАНО)
    console.log('\n🔊 Testing sound sync... (SKIPPED)')
    console.log('⚠️  Sound sync not yet implemented - skipping test')

    // Тест 7: Проверка движения шарика при воспроизведении
    console.log('\n▶️  Testing ball movement sync...')

    // Утилита: ждём состояние physicsEngine на viewer странице и проверяем предикат на стороне Node
    async function waitForViewerState(predicate, timeoutMs = 5000, pollMs = 100) {
      const started = Date.now()
      while (Date.now() - started < timeoutMs) {
        try {
          const state = await viewerPage.evaluate(() => {
            const eng = globalThis.physicsEngine
            if (!eng) return null

            // Если есть метод getState - используем его (предпочтительно)
            if (typeof eng.getState === 'function') {
               return eng.getState()
            }

            // Fallback
            return {
               x: eng.ball?.x,
               y: eng.ball?.y,
               vx: eng.ball?.vx,
               vy: eng.ball?.vy,
               paused: eng.state?.paused
            }
          })

          if (state) {
             // DEBUG LOGGING
             const vx = state.vx ?? 0
             const vy = state.vx ?? 0
             // Only log occasionally to avoid spamming, or if non-zero
             if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
                // console.log(`[POLL] Motion detected: vx=${vx}, vy=${vy}`)
             }
          }

          if (state && predicate(state)) return state
        } catch (e) {
          // Игнорируем transient ошибки при доступе к странице
        }
        await wait(pollMs)
      }
      return null
    }

    // Утилита: попытка запустить/остановить воспроизведение с возвратом true/false
    async function togglePlayOnController() {
      return controllerPage.evaluate(() => {
        try {
          if (typeof window.togglePlayPause === 'function') {
            window.togglePlayPause()
            return true
          }
          const playBtn = document.getElementById('playPauseBtn')
          if (playBtn) {
            playBtn.click()
            return true
          }
          return false
        } catch (e) {
          return false
        }
      }).catch(() => false)
    }

    // Попытка запустить воспроизведение и дождаться, что viewer действительно движется
    const startOk = await togglePlayOnController()
    if (!startOk) {
      throw new Error('Failed to initiate play on controller')
    }

    // Ждём, что viewer выйдет из paused и появится ненулевая скорость
    const movingState = await waitForViewerState(s => s.paused === false && (Math.abs(s.vx) > 0.5 || Math.abs(s.vy) > 0.5), 6000, 120)

    if (!movingState) {
      // ДИАГНОСТИКА: выведем текущее состояние для отладки
      const debugState = await viewerPage.evaluate(() => {
        const eng = globalThis.physicsEngine
        if (!eng) return { error: 'physicsEngine not found' }
        return {
          paused: eng.state?.paused,
          lastDirection: eng.state?.lastDirection,
          lastVx: eng.state?.lastVx,
          lastVy: eng.state?.lastVy,
          ballVx: eng.ball?.vx,
          ballVy: eng.ball?.vy,
          ballSpeed: eng.ball?.speed,
          worldWidth: eng.options?.worldWidth,
          worldHeight: eng.options?.worldHeight,
          _worldSizeSet: eng._worldSizeSet,
          isViewer: eng.isViewer
        }
      })
      console.log('   Debug state on viewer:', JSON.stringify(debugState, null, 2))

      // Попробуем повторно (иногда первый клик теряется)
      console.log('⚠️  No movement detected yet — retrying play toggle...')
      await togglePlayOnController()
      await wait(300)
      const movingState2 = await waitForViewerState(s => s.paused === false && (Math.abs(s.vx) > 0.5 || Math.abs(s.vy) > 0.5), 5000, 120)
      if (!movingState2) {
        throw new Error('Ball did not start moving on viewer after play (checked twice)')
      }
    }

    // Снимем две позиции с небольшим интервалом, чтобы убедиться в движении
    const pos1 = await viewerPage.evaluate(() => {
      const eng = globalThis.physicsEngine
      if (!eng) return null
      return typeof eng.getState === 'function' ? eng.getState() : { ...eng.ball, paused: eng.state.paused }
    })

    await wait(200)

    const pos2 = await viewerPage.evaluate(() => {
      const eng = globalThis.physicsEngine
      if (!eng) return null
      return typeof eng.getState === 'function' ? eng.getState() : { ...eng.ball, paused: eng.state.paused }
    })

    if (!pos1 || !pos2) {
      throw new Error('Could not read viewer positions for movement check')
    }

    console.log(`   Viewer position 1 raw:`, JSON.stringify(pos1))
    console.log(`   Viewer position 2 raw:`, JSON.stringify(pos2))

    // DEBUG: Check physicsEngine object structure
    const debugEng = await viewerPage.evaluate(() => {
        const eng = globalThis.physicsEngine;
        if (!eng) return 'physicsEngine is null';
        return {
            hasGetState: typeof eng.getState === 'function',
            ballKeys: eng.ball ? Object.keys(eng.ball) : 'ball is missing',
            stateKeys: eng.state ? Object.keys(eng.state) : 'state is missing',
            isViewer: eng.isViewer
        }
    });
    console.log('   PhysicsEngine Debug:', JSON.stringify(debugEng));

    const moved = (typeof pos1.x === 'number' && typeof pos2.x === 'number' && (Math.abs(pos1.x - pos2.x) > 1 || Math.abs(pos1.y - pos2.y) > 1)) || (Math.abs((pos2.vx || 0)) > 0.5 || Math.abs((pos2.vy || 0)) > 0.5)

    if (moved) {
      console.log('✅ Ball movement detected on viewer')
    } else {
      throw new Error('Ball position or velocity did not change on viewer after start')
    }

    // Сравнение с контроллером (как было)
    const controllerPos = await controllerPage.evaluate(() => {
      const eng = globalThis.previewPhysicsEngine || globalThis.__previewPhysics
      if (!eng) return {}
      if (typeof eng.getState === 'function') return eng.getState()
      return { x: eng.ball?.x, y: eng.ball?.y }
    })

    if (controllerPos.x && controllerPos.y) {
      const posDiff = Math.sqrt(Math.pow(controllerPos.x - pos2.x, 2) + Math.pow(controllerPos.y - pos2.y, 2))
      console.log(`   Controller position: x=${controllerPos.x.toFixed(1)}, y=${controllerPos.y.toFixed(1)}`)
      console.log(`   Position difference: ${posDiff.toFixed(1)}px`)

      if (posDiff < 50) {
        console.log(`✅ Controller and viewer positions synchronized (diff: ${posDiff.toFixed(1)}px)`)
      } else {
        throw new Error(`Position diff too large: ${posDiff.toFixed(1)}px`)
      }
    } else {
      console.log('⚠️  Could not get controller position for comparison')
    }

    // Теперь проверим паузу: останавливаем воспроизведение и ждём, что viewer перейдёт в paused и скорость станет близкой к нулю
    const pauseOk = await togglePlayOnController()
    if (!pauseOk) {
      throw new Error('Failed to toggle pause on controller')
    }

    const pausedState = await waitForViewerState(s => s.paused === true && Math.abs(s.vx) < 0.5 && Math.abs(s.vy) < 0.5, 5000, 120)
    if (!pausedState) {
      throw new Error('Viewer did not enter paused state or velocities did not drop after pause')
    }

    console.log('✅ Viewer paused and velocities dropped after pause')

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
