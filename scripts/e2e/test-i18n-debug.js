const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));
  
  const state = await page.evaluate(() => ({
    hasI18nLower: typeof window.i18n !== 'undefined',
    hasI18nUpper: typeof window.I18n !== 'undefined',
    isReady: window.i18n ? window.i18n.isReady : null,
    currentLang: window.i18n ? window.i18n.currentLanguage : null,
    translations: window.i18n ? Object.keys(window.i18n.translations || {}) : null,
    storage: localStorage.getItem('emdr-language')
  }));
  console.log('State:', JSON.stringify(state, null, 2));
  
  // Проверим переключение языка
  if (state.hasI18nLower && state.isReady) {
    console.log('Testing language switch...');
    
    // Найдем элемент с переводом
    const titleBefore = await page.evaluate(() => {
      const el = document.querySelector('[data-i18n="home.title"]');
      return el ? el.textContent : 'not found';
    });
    console.log('Title before:', titleBefore);
    
    // Переключаем на русский
    await page.evaluate(async () => {
      await window.i18n.changeLanguage('ru');
    });
    await new Promise(r => setTimeout(r, 1000));
    
    const titleAfterRu = await page.evaluate(() => {
      const el = document.querySelector('[data-i18n="home.title"]');
      return el ? el.textContent : 'not found';
    });
    console.log('Title after RU:', titleAfterRu);
    
    // Переключаем на английский
    await page.evaluate(async () => {
      await window.i18n.changeLanguage('en');
    });
    await new Promise(r => setTimeout(r, 1000));
    
    const titleAfterEn = await page.evaluate(() => {
      const el = document.querySelector('[data-i18n="home.title"]');
      return el ? el.textContent : 'not found';
    });
    console.log('Title after EN:', titleAfterEn);
  }
  
  await browser.close();
})();
