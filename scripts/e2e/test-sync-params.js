'use strict'
/**
 * E2E: Smooth movement and viewer-controller sync test.
 * Verifies ball physics sync and all settable parameters.
 *
 * Usage:
 *   node scripts/e2e/test-sync-params.js [BASE_URL]
 *
 * Defaults to https://dev.emdrbilateral.online
 */
const puppeteer = require('puppeteer')

const BASE_URL = process.argv[2] || 'https://dev.emdrbilateral.online'
const SESSION_ID = 'e2e_sync'

let browser, ctrlPage, viewPage
let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 10000))
    ])
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Send controller state update via REST API (from controller page context)
async function ctrl(updates) {
  await ctrlPage.evaluate(async upd => {
    const sid = globalThis.__current?.sessionId
    if (!sid) throw new Error('No sessionId in __current')
    const res = await fetch(`/api/session/${sid}/controller/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upd)
    })
    if (!res.ok) throw new Error(`controller/update HTTP ${res.status}`)
  }, updates)
}

// Get viewer physicsEngine state (uses getState() which returns all physics fields)
async function vState() {
  return viewPage.evaluate(() => {
    const e = globalThis.physicsEngine
    if (!e || typeof e.getState !== 'function') return null
    return e.getState()
  })
}

// Get full session state via REST (includes soundEnabled etc.)
async function sessionState() {
  return viewPage.evaluate(async () => {
    const sid = globalThis.__current?.sessionId
    if (!sid) return null
    const r = await fetch(`/api/session/${sid}/state`)
    if (!r.ok) return null
    return r.json()
  })
}

// Wait for viewer and controller to see each other
async function waitConnected(ms = 8000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const vc = await ctrlPage.evaluate(() => globalThis.__current?.viewerConnected === true)
    const cc = await viewPage.evaluate(() => globalThis.__current?.controllerConnected === true)
    if (vc && cc) return true
    await sleep(400)
  }
  return false
}

// Pause ball and wait for propagation to viewer
async function pause() {
  await ctrl({ paused: true })
  await sleep(600)
}

// Resume with given direction + speed, wait for viewer to receive
async function resume(dirX, dirY, speed = 60) {
  await ctrl({ paused: false, dirX, dirY, speed })
  await sleep(600)
}

async function main() {
  // Reserve session (idempotent)
  try {
    const r = await fetch(`${BASE_URL}/api/session/${SESSION_ID}/reserve`, { method: 'POST' })
    if (!r.ok) console.warn(`⚠️  reserve: HTTP ${r.status}`)
  } catch (e) {
    console.warn(`⚠️  reserve: ${e.message}`)
  }

  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  try {
    ctrlPage = await browser.newPage()
    await ctrlPage.goto(`${BASE_URL}/c/${SESSION_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    })

    viewPage = await browser.newPage()
    await viewPage.setViewport({ width: 1280, height: 720 })
    await viewPage.goto(`${BASE_URL}/s/${SESSION_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    })

    if (!await waitConnected()) {
      console.warn('⚠️  Timeout waiting for both sides to connect')
    }

    // Establish known initial state
    await ctrl({ paused: true, speed: 50, dirX: 1, dirY: 0 })
    await sleep(600)

    // ── Connection ─────────────────────────────────────────────────────────────

    await test('Controller видит Viewer подключённым', async () => {
      const ok = await ctrlPage.evaluate(() => globalThis.__current?.viewerConnected === true)
      if (!ok) throw new Error('viewerConnected !== true на контроллере')
    })

    await test('Viewer видит Controller подключённым', async () => {
      const ok = await viewPage.evaluate(() => globalThis.__current?.controllerConnected === true)
      if (!ok) throw new Error('controllerConnected !== true на viewer')
    })

    // ── Ball movement ──────────────────────────────────────────────────────────

    await test('Мяч движется после Play', async () => {
      await resume(1, 0, 50)
      const s1 = await vState()
      if (!s1) throw new Error('physicsEngine недоступен')
      if (s1.paused) throw new Error('Viewer остался на паузе после Play')
      await sleep(500)
      const s2 = await vState()
      const dist = Math.hypot(s2.x - s1.x, s2.y - s1.y)
      if (dist < 1) throw new Error(`Мяч не двигается: dist=${dist.toFixed(2)}`)
    })

    await test('Плавность: позиция непрерывно обновляется', async () => {
      // Ball should already be playing; sample 6 positions at 100ms intervals
      const samples = []
      for (let i = 0; i < 6; i++) {
        const s = await vState()
        samples.push(`${Math.round(s?.x ?? 0)},${Math.round(s?.y ?? 0)}`)
        await sleep(100)
      }
      const unique = new Set(samples).size
      if (unique < 4) {
        throw new Error(
          `Слишком мало уникальных позиций: ${unique}/6 — [${samples.join(' | ')}]`
        )
      }
    })

    // ── Pause / Resume ─────────────────────────────────────────────────────────

    await test('Пауза синхронизируется на Viewer', async () => {
      await pause()
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!s.paused) throw new Error('Viewer не получил Pause')
    })

    await test('Resume синхронизируется на Viewer', async () => {
      await resume(1, 0, 50)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (s.paused) throw new Error('Viewer не получил Resume')
    })

    // ── Speed ──────────────────────────────────────────────────────────────────

    await test('Скорость 15 синхронизируется на Viewer', async () => {
      await ctrl({ speed: 15 })
      await sleep(600)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (Math.abs(s.speed - 15) > 5) throw new Error(`speed=${s.speed}, ожидалось ~15`)
    })

    await test('Скорость 85 синхронизируется на Viewer', async () => {
      await ctrl({ speed: 85 })
      await sleep(600)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (Math.abs(s.speed - 85) > 5) throw new Error(`speed=${s.speed}, ожидалось ~85`)
    })

    await test('Высокая скорость — мяч перемещается дальше за то же время', async () => {
      await pause(); await resume(1, 0, 10)
      const p1 = await vState(); await sleep(500); const p2 = await vState()
      const dLow = Math.hypot(p2.x - p1.x, p2.y - p1.y)

      await pause(); await resume(1, 0, 90)
      const p3 = await vState(); await sleep(500); const p4 = await vState()
      const dHigh = Math.hypot(p4.x - p3.x, p4.y - p3.y)

      if (dHigh <= dLow * 1.5) {
        throw new Error(
          `Скорость не масштабируется: slow dist=${dLow.toFixed(1)}, fast dist=${dHigh.toFixed(1)}`
        )
      }
    })

    // ── Direction ──────────────────────────────────────────────────────────────
    // Strategy: pause → resume with dirX/dirY → check velocity components after 400ms.
    // With clientSimulation, direction is applied via _handleCommonCommands on resume
    // (runs unconditionally when transitioning from paused to playing).
    // We verify via velocity components: |vx| vs |vy| determines axis.

    await test('Направление: Горизонтальное (dirX=1, dirY=0)', async () => {
      await pause(); await resume(1, 0, 60)
      await sleep(400)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      const ax = Math.abs(s.vx || 0)
      const ay = Math.abs(s.vy || 0)
      if (ax <= ay) {
        throw new Error(`Движение не горизонтальное: vx=${s.vx?.toFixed(1)}, vy=${s.vy?.toFixed(1)}`)
      }
    })

    await test('Направление: Вертикальное (dirX=0, dirY=1)', async () => {
      await pause(); await resume(0, 1, 60)
      await sleep(400)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      const ax = Math.abs(s.vx || 0)
      const ay = Math.abs(s.vy || 0)
      if (ay <= ax) {
        throw new Error(`Движение не вертикальное: vx=${s.vx?.toFixed(1)}, vy=${s.vy?.toFixed(1)}`)
      }
    })

    await test('Направление: Диагональ ↖→↘ (dirX≈dirY≈0.71)', async () => {
      const d = +(1 / Math.SQRT2).toFixed(4)
      await pause(); await resume(d, d, 60)
      await sleep(400)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      const ax = Math.abs(s.vx || 0)
      const ay = Math.abs(s.vy || 0)
      const total = ax + ay
      if (total < 1) throw new Error('Мяч не движется')
      const imbalance = Math.abs(ax - ay) / total
      if (imbalance > 0.4) {
        throw new Error(
          `Неравная диагональ: vx=${s.vx?.toFixed(1)}, vy=${s.vy?.toFixed(1)}`
        )
      }
    })

    await test('Направление: Диагональ ↙→↗ (dirX≈0.71, dirY≈-0.71)', async () => {
      const d = +(1 / Math.SQRT2).toFixed(4)
      await pause(); await resume(d, -d, 60)
      await sleep(400)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      const ax = Math.abs(s.vx || 0)
      const ay = Math.abs(s.vy || 0)
      const total = ax + ay
      if (total < 1) throw new Error('Мяч не движется')
      const imbalance = Math.abs(ax - ay) / total
      if (imbalance > 0.4) {
        throw new Error(
          `Неравная диагональ: vx=${s.vx?.toFixed(1)}, vy=${s.vy?.toFixed(1)}`
        )
      }
    })

    // ── Ball color ─────────────────────────────────────────────────────────────

    await test('Цвет мяча #ef4444 (красный)', async () => {
      await ctrl({ colorBall: '#ef4444' })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!(s.colorBall || '').toLowerCase().includes('ef4444')) {
        throw new Error(`colorBall="${s.colorBall}", ожидалось #ef4444`)
      }
    })

    await test('Цвет мяча #10b981 (зелёный)', async () => {
      await ctrl({ colorBall: '#10b981' })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!(s.colorBall || '').toLowerCase().includes('10b981')) {
        throw new Error(`colorBall="${s.colorBall}", ожидалось #10b981`)
      }
    })

    await test('Цвет мяча #8b5cf6 (фиолетовый)', async () => {
      await ctrl({ colorBall: '#8b5cf6' })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!(s.colorBall || '').toLowerCase().includes('8b5cf6')) {
        throw new Error(`colorBall="${s.colorBall}", ожидалось #8b5cf6`)
      }
    })

    // ── Background color ───────────────────────────────────────────────────────

    await test('Цвет фона #0a2540 (тёмно-синий)', async () => {
      await ctrl({ colorBg: '#0a2540' })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!(s.colorBg || '').toLowerCase().includes('0a2540')) {
        throw new Error(`colorBg="${s.colorBg}", ожидалось #0a2540`)
      }
    })

    await test('Цвет фона #052e16 (тёмно-зелёный)', async () => {
      await ctrl({ colorBg: '#052e16' })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!(s.colorBg || '').toLowerCase().includes('052e16')) {
        throw new Error(`colorBg="${s.colorBg}", ожидалось #052e16`)
      }
    })

    await test('Цвет фона #fef3c7 (светлый)', async () => {
      await ctrl({ colorBg: '#fef3c7' })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (!(s.colorBg || '').toLowerCase().includes('fef3c7')) {
        throw new Error(`colorBg="${s.colorBg}", ожидалось #fef3c7`)
      }
    })

    // ── Ball size (radius) ─────────────────────────────────────────────────────

    await test('Размер мяча x1 (radius=20)', async () => {
      await ctrl({ radius: 20 })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (Math.abs((s.radius || 0) - 20) > 3) {
        throw new Error(`radius=${s.radius}, ожидалось 20`)
      }
    })

    await test('Размер мяча x2 (radius=40)', async () => {
      await ctrl({ radius: 40 })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (Math.abs((s.radius || 0) - 40) > 3) {
        throw new Error(`radius=${s.radius}, ожидалось 40`)
      }
    })

    await test('Размер мяча x3 (radius=60)', async () => {
      await ctrl({ radius: 60 })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (Math.abs((s.radius || 0) - 60) > 3) {
        throw new Error(`radius=${s.radius}, ожидалось 60`)
      }
    })

    await test('Размер мяча x4 (radius=80)', async () => {
      await ctrl({ radius: 80 })
      await sleep(700)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      if (Math.abs((s.radius || 0) - 80) > 3) {
        throw new Error(`radius=${s.radius}, ожидалось 80`)
      }
    })

    // ── Sound ──────────────────────────────────────────────────────────────────

    await test('Звук включается (soundEnabled=true)', async () => {
      await ctrl({ soundEnabled: true })
      await sleep(600)
      const state = await sessionState()
      if (!state) throw new Error('Не удалось получить состояние сессии')
      if (state.soundEnabled !== true) {
        throw new Error(`soundEnabled=${state.soundEnabled}, ожидалось true`)
      }
    })

    await test('Звук отключается (soundEnabled=false)', async () => {
      await ctrl({ soundEnabled: false })
      await sleep(600)
      const state = await sessionState()
      if (!state) throw new Error('Не удалось получить состояние сессии')
      if (state.soundEnabled !== false) {
        throw new Error(`soundEnabled=${state.soundEnabled}, ожидалось false`)
      }
    })

    // ── Combined ───────────────────────────────────────────────────────────────

    await test('Комплексное обновление: скорость+цвет+направление+размер', async () => {
      await pause()
      await ctrl({
        paused: false,
        speed: 70,
        dirX: 0,
        dirY: 1,
        colorBall: '#f59e0b',
        colorBg: '#1a102a',
        radius: 35
      })
      await sleep(800)
      const s = await vState()
      if (!s) throw new Error('physicsEngine недоступен')
      const errors = []
      if (s.paused) errors.push('paused=true')
      if (Math.abs(s.speed - 70) > 5) errors.push(`speed=${s.speed} (ожидалось 70)`)
      if (!(s.colorBall || '').toLowerCase().includes('f59e0b')) {
        errors.push(`colorBall=${s.colorBall}`)
      }
      if (!(s.colorBg || '').toLowerCase().includes('1a102a')) {
        errors.push(`colorBg=${s.colorBg}`)
      }
      if (Math.abs((s.radius || 0) - 35) > 3) {
        errors.push(`radius=${s.radius} (ожидалось 35)`)
      }
      if (errors.length > 0) throw new Error(errors.join('; '))
    })

    // Reset to defaults
    await ctrl({
      paused: true,
      speed: 30,
      dirX: 1,
      dirY: 0,
      colorBall: '#60a5fa',
      colorBg: '#020617',
      radius: 20
    })
  } finally {
    await browser.close()
    console.log(`\n📊 Результаты: ${passed} прошло, ${failed} упало из ${passed + failed}`)
    process.exit(failed > 0 ? 1 : 0)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
