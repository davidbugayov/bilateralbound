const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  console.log('=== Testing i18n on all pages ===\n');
  
  // Test main page
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));
  await page.reload({ waitUntil: 'networkidle0' });
  
  let title = await page.evaluate(() => document.querySelector('[data-i18n="home.title"]')?.textContent);
  console.log('Main page (EN):', title);
  
  await page.evaluate(async () => await window.i18n.changeLanguage('ru'));
  await new Promise(r => setTimeout(r, 500));
  title = await page.evaluate(() => document.querySelector('[data-i18n="home.title"]')?.textContent);
  console.log('Main page (RU):', title);
  
  // Create session and test controller
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#createSessionBtn');
  await new Promise(r => setTimeout(r, 5000));
  
  let settings = await page.evaluate(() => document.querySelector('[data-i18n="controller.settingsHeading"]')?.textContent);
  console.log('\nController (EN):', settings);
  
  await page.evaluate(async () => await window.i18n.changeLanguage('ru'));
  await new Promise(r => setTimeout(r, 500));
  settings = await page.evaluate(() => document.querySelector('[data-i18n="controller.settingsHeading"]')?.textContent);
  console.log('Controller (RU):', settings);
  
  // Get viewer URL and test
  const viewerUrl = await page.evaluate(() => document.getElementById('viewerLink')?.value);
  if (viewerUrl) {
    await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));
    await page.goto(viewerUrl, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));
    
    let loading = await page.evaluate(() => document.querySelector('[data-i18n="viewer.loading"]')?.textContent);
    console.log('\nViewer (EN):', loading || 'loaded');
    
    await page.evaluate(async () => { if (window.i18n) await window.i18n.changeLanguage('ru'); });
    await new Promise(r => setTimeout(r, 500));
    loading = await page.evaluate(() => document.querySelector('[data-i18n="viewer.loading"]')?.textContent);
    console.log('Viewer (RU):', loading || 'loaded');
  }
  
  console.log('\n✅ Full i18n test completed!');
  await browser.close();
})();
