const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Set English language
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));
  
  // Create session
  await page.click('#createSessionBtn');
  await new Promise(r => setTimeout(r, 5000));
  
  // Now we should be on controller page
  const url = await page.url();
  console.log('Current URL:', url);
  
  // Check i18n state
  const state = await page.evaluate(() => ({
    i18nReady: window.i18n ? window.i18n.isReady : false,
    lang: window.i18n ? window.i18n.currentLanguage : null,
    htmlLang: document.documentElement.lang
  }));
  console.log('i18n state:', state);
  
  // Check some text elements with data-i18n
  const texts = await page.evaluate(() => {
    const results = {};
    
    // Check elements with data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    results.i18nElementsCount = elements.length;
    
    // Sample some specific texts
    const settings = document.querySelector('[data-i18n="controller.settingsHeading"]');
    results.settings = settings ? settings.textContent : 'not found';
    
    const sessionHeading = document.querySelector('#session-heading');
    results.sessionHeading = sessionHeading ? sessionHeading.textContent : 'not found';
    
    // Check if there's Russian text visible
    const h3s = document.querySelectorAll('h3');
    results.h3Texts = [...h3s].slice(0, 5).map(h => h.textContent.trim().substring(0, 40));
    
    return results;
  });
  console.log('Texts:', JSON.stringify(texts, null, 2));
  
  await browser.close();
})();
