const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Собираем все console.log
  const logs = [];
  page.on('console', msg => {
    logs.push(msg.text());
    console.log('BROWSER:', msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 5000));
  
  const state = await page.evaluate(() => ({
    hasI18nLower: typeof window.i18n !== 'undefined',
    hasI18nUpper: typeof window.I18n !== 'undefined',
    isReady: window.i18n ? window.i18n.isReady : null,
    currentLang: window.i18n ? window.i18n.currentLanguage : null,
    storage: localStorage.getItem('emdr-language'),
    htmlLang: document.documentElement.lang
  }));
  console.log('\nState:', JSON.stringify(state, null, 2));
  
  // Check if i18n script tag exists
  const scripts = await page.evaluate(() => {
    const scriptTags = [...document.querySelectorAll('script[src]')];
    return scriptTags.map(s => s.src).filter(s => s.includes('i18n'));
  });
  console.log('\ni18n scripts:', scripts);
  
  await browser.close();
})();
