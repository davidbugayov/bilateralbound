const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  // Set English language first
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'))

  // Create session
  await page.click('#createSessionBtn')
  await new Promise(r => setTimeout(r, 5000))

  const url = await page.url()
  console.log('Controller URL:', url)

  // Check English texts
  const textsEn = await page.evaluate(() => {
    return {
      sessionHeading: document.querySelector('[data-i18n="controller.sessionHeading"]')?.textContent || 'not found',
      soundTitle: document.querySelector('[data-i18n="controller.soundTitle"]')?.textContent || 'not found',
      settingsHeading: document.querySelector('[data-i18n="controller.settingsHeading"]')?.textContent || 'not found'
    }
  })
  console.log('English texts:', textsEn)

  // Switch to Russian
  await page.evaluate(async () => {
    await window.i18n.changeLanguage('ru')
  })
  await new Promise(r => setTimeout(r, 1000))

  // Check Russian texts
  const textsRu = await page.evaluate(() => {
    return {
      sessionHeading: document.querySelector('[data-i18n="controller.sessionHeading"]')?.textContent || 'not found',
      soundTitle: document.querySelector('[data-i18n="controller.soundTitle"]')?.textContent || 'not found',
      settingsHeading: document.querySelector('[data-i18n="controller.settingsHeading"]')?.textContent || 'not found'
    }
  })
  console.log('Russian texts:', textsRu)

  // Verify language changed
  if (textsEn.sessionHeading !== textsRu.sessionHeading) {
    console.log('\n✅ Language switching works on controller!')
  } else {
    console.log('\n❌ Language switching NOT working on controller')
  }

  await browser.close()
})()
