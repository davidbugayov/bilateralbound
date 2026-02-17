#!/usr/bin/env node
/**
 * E2E тест BilateralBound
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.argv[2] || 'https://dev.emdrbilateral.online'
let browser, passed = 0, failed = 0

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 8000))
    ])
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  }
}

async function main() {
  console.log(`\n🚀 E2E: ${BASE_URL}\n`)
  
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

  // Тест главной страницы
  const mainPage = await browser.newPage()
  await mainPage.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 })

  await test('Главная загружается', async () => {
    const t = await mainPage.title()
    if (!t.includes('Bilateral')) throw new Error('Bad title')
  })

  await test('Кнопка создания сессии', async () => {
    if (!await mainPage.$('#createSessionBtn')) throw new Error('Not found')
  })

  await test('Генерация ссылок', async () => {
    await mainPage.type('#customClientId', 'e2e_test')
    await mainPage.click('#generateLinksBtn')
    await mainPage.waitForSelector('#generatedLinksContainer', { visible: true, timeout: 5000 })
  })

  await mainPage.close()

  // Тест контроллера
  const ctrlPage = await browser.newPage()
  await ctrlPage.goto(`${BASE_URL}/c/e2e_session`, { waitUntil: 'domcontentloaded', timeout: 15000 })

  await test('Контроллер загружается', async () => {
    await ctrlPage.waitForSelector('#preview', { timeout: 10000 })
  })

  await test('Play кнопка', async () => {
    if (!await ctrlPage.$('#playPauseBtn')) throw new Error('Not found')
  })

  await test('Скорость контрол', async () => {
    if (!await ctrlPage.$('#speedControl')) throw new Error('Not found')
  })

  await test('PhysicsEngine', async () => {
    const ok = await ctrlPage.evaluate(() => typeof PhysicsEngine !== 'undefined')
    if (!ok) throw new Error('Not found')
  })

  // Тест viewer
  const viewPage = await browser.newPage()
  await viewPage.goto(`${BASE_URL}/s/e2e_session`, { waitUntil: 'domcontentloaded', timeout: 15000 })

  await test('Viewer загружается', async () => {
    await viewPage.waitForSelector('canvas', { timeout: 10000 })
  })

  await test('Viewer PhysicsEngine', async () => {
    const ok = await viewPage.evaluate(() => typeof PhysicsEngine !== 'undefined')
    if (!ok) throw new Error('Not found')
  })

  // Тест мобильного viewport
  const mobilePage = await browser.newPage()
  await mobilePage.setViewport({ width: 375, height: 667 })
  await mobilePage.goto(`${BASE_URL}/c/e2e_mobile`, { waitUntil: 'domcontentloaded', timeout: 15000 })

  await test('Mobile viewport', async () => {
    await mobilePage.waitForSelector('#preview', { timeout: 10000 })
  })

  await browser.close()

  // Результат
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Пройдено: ${passed}/${passed + failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  if (browser) browser.close()
  process.exit(1)
})
