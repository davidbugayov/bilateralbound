const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage()

  await page.goto('https://dev.emdrbilateral.online', {
    waitUntil: 'networkidle0',
  });
  await new Promise((r) => setTimeout(r, 3000));

  // Check i18n state
  const state = await page.evaluate(() => ({
    hasI18n: typeof window.i18n !== 'undefined',
    isReady: window.i18n ? window.i18n.isReady : null,
    currentLang: window.i18n ? window.i18n.currentLanguage : null,
    translations: window.i18n ? Object.keys(window.i18n.translations) : null
  }))
  console.log('State:', JSON.stringify(state, null, 2))

  // Find title element
  const titleBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n="home.title"]')
    return el ? el.textContent : 'not found'
  })
  console.log('Title before:', titleBefore)

  // Switch to Russian
  await page.evaluate(async () => {
    await window.i18n.changeLanguage('ru')
  })
  await new Promise((r) => setTimeout(r, 1000));

  const afterRu = await page.evaluate(() => ({
    lang: window.i18n.currentLanguage,
    translations: Object.keys(window.i18n.translations)
  }))
  console.log('After RU:', JSON.stringify(afterRu))

  const titleAfterRu = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n="home.title"]')
    return el ? el.textContent : 'not found'
  })
  console.log('Title after RU:', titleAfterRu)

  // Switch to English
  await page.evaluate(async () => {
    await window.i18n.changeLanguage('en')
  })
  await new Promise((r) => setTimeout(r, 1000));

  const titleAfterEn = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n="home.title"]')
    return el ? el.textContent : 'not found'
  })
  console.log('Title after EN:', titleAfterEn)

  // Verify language actually changed
  if (titleBefore !== titleAfterRu && titleAfterRu !== titleAfterEn) {
    console.log('\n✅ Language switching works!')
  } else {
    console.log('\n❌ Language switching NOT working')
    console.log('titleBefore:', titleBefore)
    console.log('titleAfterRu:', titleAfterRu)
    console.log('titleAfterEn:', titleAfterEn)
  }

  await browser.close()
})()
