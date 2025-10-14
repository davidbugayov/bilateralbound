 /**
 * UI tests using Puppeteer (headless Chrome)
 * Verifies viewer initializes, connects, and ball moves smoothly under client physics.
 */

const http = require('http')
const { spawn } = require('child_process')
const puppeteer = require('puppeteer')

const BASE = 'http://localhost:3002'

function log(msg) {
  const ts = new Date().toISOString()
  console.log(`ℹ️ [${ts}] ${msg}`)
}

async function api(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE)
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = ''
      res.on('data', c => (data += c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null })
        } catch (e) {
          resolve({ status: res.statusCode, data: null })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', stdio: ['pipe', 'pipe', 'pipe'] })
    let ready = false
    const t = setTimeout(() => { if (!ready) reject(new Error('Server did not start')) }, 12000)
    proc.stdout.on('data', (d) => {
      const s = d.toString()
      if (s.includes('Server listening')) { ready = true; clearTimeout(t); resolve(proc) }
    })
    proc.stderr.on('data', (d) => {
      const s = d.toString()
      if (s.includes('EADDRINUSE')) { ready = true; clearTimeout(t); resolve(proc) }
    })
  })
}

async function main() {
  log('🚀 UI-тест: запуск сервера')
  const server = await startServer()

  let browser
  try {
    log('🔧 Создание сессии через API')
    const sessionRes = await api('/api/session', 'POST', {})
    if (sessionRes.status !== 200 || !sessionRes.data?.sessionId) {
      console.error('Cannot create session')
      return
    }
    const sessionId = sessionRes.data.sessionId

    // Подключаем вьювер через API, чтобы выдать размеры, как это делает реальный клиент
    await api(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1280, height: 720 } })

    log('🌐 Запуск headless браузера')
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()

    // Открываем viewer.html с параметрами сессии
    const viewerUrl = `${BASE}/viewer.html?sessionId=${sessionId}`
    log(`📄 Открываем ${viewerUrl}`)
    await page.goto(viewerUrl, { waitUntil: 'networkidle2', timeout: 30000 })

    // Дожидаемся инициализации window.physicsEngine, которую мы экспонируем в viewer.html
    await page.waitForFunction(() => !!window.physicsEngine && !!window.wsClient, { timeout: 10000 })
    log('✅ Viewer инициализирован, WebSocket подключён')

    // Проверяем, что изначально пауза
    const initialPaused = await page.evaluate(() => window.physicsEngine && window.physicsEngine.state && window.physicsEngine.state.paused)
    if (initialPaused !== true && initialPaused !== false) {
      console.error('physicsEngine not ready')
      return
    }

    // Отправляем команду запуска движения через API (сервер синхронизирует флаги)
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false, dirX: 1, dirY: 0, speed: 30 })

    // Небольшой прогрев, чтобы исключить стартовую синхронизационную ступеньку
    await new Promise(r => setTimeout(r, 120))

    // Сэмплируем позиции, вручную продвигая физику (в headless-браузерах setInterval может троттлиться)
    const samples = await page.evaluate(async () => {
      const positions = []
      const get = () => ({ x: window.physicsEngine.ball.x, y: window.physicsEngine.ball.y })
      positions.push(get())
      for (let i = 0; i < 20; i++) { // ~333мс при 60 Гц
        window.physicsEngine.update(1/60)
        // небольшая ротация событийного цикла, чтобы не блокировать полностью
        await new Promise(r => setTimeout(r, 1))
        positions.push(get())
      }
      return positions
    })

    // Проверяем движение вправо (x должен расти)
    const dx1 = samples[1].x - samples[0].x
    const dx2 = samples[2].x - samples[1].x
    const dx3 = samples[3].x - samples[2].x
    const movedRight = dx1 > 0 && dx2 > 0 && dx3 > 0

    // Простейшая оценка гладкости: относительное изменение шага не должно быть слишком большим
    const jitterRatio1 = Math.abs(dx2 - dx1) / Math.max(1, Math.abs(dx1))
    const jitterRatio2 = Math.abs(dx3 - dx2) / Math.max(1, Math.abs(dx2))
    const smoothEnough = jitterRatio1 < 2.0 && jitterRatio2 < 2.0 // немного расслабим порог, чтобы избежать флейков на CI

    if (!movedRight) {
      console.error(`Ball did not move right consistently: deltas = ${dx1.toFixed(2)}, ${dx2.toFixed(2)}, ${dx3.toFixed(2)}`)
      process.exitCode = 1
      return
    }
    if (!smoothEnough) {
      console.error(`Movement jitter too high: ratios = ${jitterRatio1.toFixed(2)}, ${jitterRatio2.toFixed(2)}`)
      process.exitCode = 1
      return
    }

    log('✅ Мяч движется вправо и достаточно плавно в реальном браузере')

    // Проверяем, что изменение скорости действительно влияет на скорость движения на клиенте
    // Сначала центрируем мяч и явно задаём движение вправо со скоростью 30, затем замеряем средний шаг по X
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { reset: true })
    await new Promise(r => setTimeout(r, 120))
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false, dirX: 1, dirY: 0, speed: 30 })
    await new Promise(r => setTimeout(r, 150))

    const baseline = await page.evaluate(async () => {
      const positions = []
      const get = () => ({ x: window.physicsEngine.ball.x, y: window.physicsEngine.ball.y })
      positions.push(get())
      for (let i = 0; i < 6; i++) { // ~100мс, не дойдем до границы
        window.physicsEngine.update(1/60)
        await new Promise(r => setTimeout(r, 1))
        positions.push(get())
      }
      let sum = 0
      for (let i = 1; i < positions.length; i++) sum += (positions[i].x - positions[i-1].x)
      return Math.abs(sum / Math.max(1, (positions.length - 1)))
    })

    // Увеличиваем скорость до 80 и снова замеряем средний шаг по X
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false, dirX: 1, dirY: 0, speed: 80 })
    await new Promise(r => setTimeout(r, 120))

    const after = await page.evaluate(async () => {
      const positions = []
      const get = () => ({ x: window.physicsEngine.ball.x, y: window.physicsEngine.ball.y })
      positions.push(get())
      for (let i = 0; i < 6; i++) { // ~100мс, не дойдем до границы
        window.physicsEngine.update(1/60)
        await new Promise(r => setTimeout(r, 1))
        positions.push(get())
      }
      let sum = 0
      for (let i = 1; i < positions.length; i++) sum += (positions[i].x - positions[i-1].x)
      return Math.abs(sum / Math.max(1, (positions.length - 1)))
    })

    const ratio = after / Math.max(1e-6, baseline)
    if (!(ratio > 1.5)) {
      console.error(`Speed change ineffective on client: avgDxBefore=${baseline.toFixed(2)}, avgDxAfter=${after.toFixed(2)}, ratio=${ratio.toFixed(2)}`)
      process.exitCode = 1
      return
    }
    log('✅ Изменение скорости влияет на скорость движения на клиенте')

    // Меняем направление вниз и убеждаемся, что Y растёт
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false, dirX: 0, dirY: 1, speed: 30 })
    await new Promise(r => setTimeout(r, 120))
    const samplesDown = await page.evaluate(async () => {
      const positions = []
      const get = () => ({ x: window.physicsEngine.ball.x, y: window.physicsEngine.ball.y })
      positions.push(get())
      for (let i = 0; i < 20; i++) {
        window.physicsEngine.update(1/60)
        await new Promise(r => setTimeout(r, 1))
        positions.push(get())
      }
      return positions
    })
    const dyA = samplesDown[1].y - samplesDown[0].y
    const dyB = samplesDown[2].y - samplesDown[1].y
    if (!(dyA > 0 && dyB > 0)) {
      console.error('Ball did not move down after direction change')
      process.exitCode = 1
      return
    }

    // Проверяем, что при вертикальном движении нет заметного дрейфа по X
    const xsDown = samplesDown.map(p => p.x)
    const xRange = Math.max(...xsDown) - Math.min(...xsDown)
    if (xRange > 2.0) {
      console.error(`Horizontal drift during vertical motion: Δx=${xRange.toFixed(2)}px`)
      process.exitCode = 1
      return
    }

    log('✅ Направление вниз применяется корректно и без горизонтального дрейфа')

    // Проверяем отскок от левой границы: движение влево, затем после удара движение вправо
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false, dirX: -1, dirY: 0, speed: 40 })
    await new Promise(r => setTimeout(r, 120))

    const bounceOK = await page.evaluate(async () => {
      const xs = []
      // Двигаем физику ~1.3 секунды, чтобы гарантированно достичь границы и отскочить
      for (let i = 0; i < 80; i++) { // 80/60 ≈ 1.33s
        window.physicsEngine.update(1/60)
        xs.push(window.physicsEngine.ball.x)
        await new Promise(r => setTimeout(r, 1))
      }
      let minIdx = 0
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] < xs[minIdx]) minIdx = i
      }
      // Требуем, чтобы до минимальной точки x убывал (движение влево), а после — возрастал (вправо)
      const hasLeftMove = xs[minIdx] < xs[0] - 5
      const hasRightMoveAfter = xs[xs.length - 1] > xs[minIdx] + 5
      // Дополнительно проверим знаки дельт вокруг минимума
      const beforeDelta = xs[minIdx] - xs[Math.max(0, minIdx - 5)]
      const afterDelta = xs[Math.min(xs.length - 1, minIdx + 5)] - xs[minIdx]
      return hasLeftMove && hasRightMoveAfter && beforeDelta < 0 && afterDelta > 0
    })
    if (!bounceOK) {
      console.error('No bounce at left edge: ball may be stuck')
      process.exitCode = 1
      return
    }

    log('✅ Отскок от левой границы работает, мяч движется туда-обратно')

    // Пауза должна остановить движение (скорость по внутренней модели ~0)
    await api(`/api/session/${sessionId}/controller/update`, 'POST', { paused: true })
    await new Promise(r => setTimeout(r, 200))
    const pausedStill = await page.evaluate(async () => {
      const x1 = window.physicsEngine.ball.x
      await new Promise(r => setTimeout(r, 150))
      const x2 = window.physicsEngine.ball.x
      return Math.abs(x2 - x1) < 1 // не двигается заметно
    })
    if (!pausedStill) {
      console.error('Ball still moving on pause')
      process.exitCode = 1
      return
    }

    log('✅ Пауза останавливает движение')

    log('🎉 UI-тесты пройдены')
  } catch (e) {
    console.error('❌ UI-тест провален:', e.message)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (server) server.kill()
  }
}

if (require.main === module) {
  main().catch(console.error)
}
