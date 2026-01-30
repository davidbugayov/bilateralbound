#!/usr/bin/env node
/**
 * Минимальный тест для проверки что всё работает
 */

console.log('🚀 Starting minimal test...')

const puppeteer = require('puppeteer')

async function main() {
  console.log('✅ Puppeteer loaded')

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  console.log('✅ Browser launched')

  const page = await browser.newPage()
  console.log('✅ Page created')

  await page.goto('https://dev.emdrbilateral.online')
  console.log('✅ Page loaded')

  const title = await page.title()
  console.log(`✅ Page title: ${title}`)

  await browser.close()
  console.log('✅ Browser closed')

  console.log('\n🎉 TEST PASSED')
}

main().catch(err => {
  console.error('❌ ERROR:', err)
  process.exit(1)
})
