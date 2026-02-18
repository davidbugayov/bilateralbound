const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Set English language
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));
  
  // Reload and check cloak
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'domcontentloaded' });
  
  const hasCloakEarly = await page.evaluate(() => {
    const cloak = document.getElementById('i18n-cloak');
    return cloak !== null;
  });
  console.log('i18n-cloak present after domcontentloaded:', hasCloakEarly);
  
  // Check i18n elements visibility
  const titleVisibility = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n="home.title"]');
    if (!el) return 'not found';
    const style = window.getComputedStyle(el);
    return style.visibility;
  });
  console.log('Title visibility after domcontentloaded:', titleVisibility);
  
  // Wait for full load
  await new Promise(r => setTimeout(r, 3000));
  
  const hasCloakLater = await page.evaluate(() => {
    const cloak = document.getElementById('i18n-cloak');
    return cloak !== null;
  });
  console.log('i18n-cloak present after 3s:', hasCloakLater);
  
  const titleVisibilityLater = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n="home.title"]');
    if (!el) return 'not found';
    const style = window.getComputedStyle(el);
    return style.visibility;
  });
  console.log('Title visibility after 3s:', titleVisibilityLater);
  
  const state = await page.evaluate(() => ({
    i18nReady: window.i18n ? window.i18n.isReady : false,
    lang: window.i18n ? window.i18n.currentLanguage : null,
    htmlLang: document.documentElement.lang
  }));
  console.log('State:', state);
  
  // Check title text
  const titleText = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n="home.title"]');
    return el ? el.textContent : 'not found';
  });
  console.log('Title text:', titleText);
  
  await browser.close();
})();
