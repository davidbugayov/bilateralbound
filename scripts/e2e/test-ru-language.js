const puppeteer = require('puppeteer')

async function testRuLanguage() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })

  let passed = 0
  let failed = 0

  function assert(condition, msg) {
    if (condition) {
      console.log(`  ✅ ${msg}`)
      passed++
    } else {
      console.log(`  ❌ ${msg}`)
      failed++
    }
  }

  try {
    const page = await browser.newPage()

    // === TEST 1: .ru opens in Russian by default (no saved lang) ===
    console.log('\n=== Test 1: .ru defaults to Russian ===')
    await page.goto('https://emdrbilateral.ru/', {
      waitUntil: 'domcontentloaded'
    })
    // Clear all language keys to simulate fresh visit
    await page.evaluate(() => {
      localStorage.removeItem('emdr-language')
      localStorage.removeItem('emdr-language-ru')
      localStorage.removeItem('emdr-language-online')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await new Promise((r) => setTimeout(r, 3000))

    let htmlLang = await page.evaluate(() => document.documentElement.lang)
    assert(htmlLang === 'ru', `Default lang should be 'ru', got '${htmlLang}'`)

    let storedKey = await page.evaluate(() =>
      localStorage.getItem('emdr-language-ru')
    )
    assert(
      storedKey === 'ru',
      `emdr-language-ru should be 'ru', got '${storedKey}'`
    )

    // === TEST 2: Switch to EN on .ru persists ===
    console.log('\n=== Test 2: Switch to EN on .ru persists after reload ===')

    // Click the language selector button
    const btnExists = await page.evaluate(() => {
      const btn = document.getElementById('languageSelectorBtn')
      if (!btn) return false
      btn.click()
      return true
    })
    assert(btnExists, 'Language selector button exists')

    await new Promise((r) => setTimeout(r, 500))

    // Click the EN option
    const clickedEn = await page.evaluate(() => {
      const options = document.querySelectorAll('.language-option')
      for (const opt of options) {
        if (opt.dataset.lang === 'en') {
          opt.click()
          return true
        }
      }
      return false
    })
    assert(clickedEn, 'EN language option clicked')

    await new Promise((r) => setTimeout(r, 2000))

    htmlLang = await page.evaluate(() => document.documentElement.lang)
    assert(
      htmlLang === 'en',
      `After switch lang should be 'en', got '${htmlLang}'`
    )

    storedKey = await page.evaluate(() =>
      localStorage.getItem('emdr-language-ru')
    )
    assert(
      storedKey === 'en',
      `emdr-language-ru should be 'en' after switch, got '${storedKey}'`
    )

    // Check that old shared key is NOT used
    const oldKey = await page.evaluate(() =>
      localStorage.getItem('emdr-language')
    )
    assert(
      oldKey === null,
      `Old shared 'emdr-language' key should not be set, got '${oldKey}'`
    )

    // Reload and verify EN persists
    await page.reload({ waitUntil: 'domcontentloaded' })
    await new Promise((r) => setTimeout(r, 3000))

    htmlLang = await page.evaluate(() => document.documentElement.lang)
    assert(
      htmlLang === 'en',
      `After reload lang should stay 'en', got '${htmlLang}'`
    )

    storedKey = await page.evaluate(() =>
      localStorage.getItem('emdr-language-ru')
    )
    assert(
      storedKey === 'en',
      `emdr-language-ru should still be 'en' after reload, got '${storedKey}'`
    )

    // === TEST 3: Switch back to RU ===
    console.log('\n=== Test 3: Switch back to RU on .ru ===')
    await page.evaluate(() => {
      const btn = document.getElementById('languageSelectorBtn')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 500))

    const clickedRu = await page.evaluate(() => {
      const options = document.querySelectorAll('.language-option')
      for (const opt of options) {
        if (opt.dataset.lang === 'ru') {
          opt.click()
          return true
        }
      }
      return false
    })
    assert(clickedRu, 'RU language option clicked')

    await new Promise((r) => setTimeout(r, 2000))

    htmlLang = await page.evaluate(() => document.documentElement.lang)
    assert(
      htmlLang === 'ru',
      `After switch back lang should be 'ru', got '${htmlLang}'`
    )

    // === TEST 4: .online defaults to English ===
    console.log('\n=== Test 4: .online defaults to English ===')
    await page.goto('https://emdrbilateral.online/', {
      waitUntil: 'domcontentloaded'
    })
    await page.evaluate(() => {
      localStorage.removeItem('emdr-language')
      localStorage.removeItem('emdr-language-ru')
      localStorage.removeItem('emdr-language-online')
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await new Promise((r) => setTimeout(r, 3000))

    htmlLang = await page.evaluate(() => document.documentElement.lang)
    assert(
      htmlLang === 'en',
      `Default lang on .online should be 'en', got '${htmlLang}'`
    )

    storedKey = await page.evaluate(() =>
      localStorage.getItem('emdr-language-online')
    )
    assert(
      storedKey === 'en',
      `emdr-language-online should be 'en', got '${storedKey}'`
    )

    console.log(`\n${passed} passed, ${failed} failed`)
  } catch (err) {
    console.error('Test error:', err)
    failed++
  } finally {
    await browser.close()
  }

  process.exit(failed > 0 ? 1 : 0)
}

testRuLanguage()
