const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  // Set English language
  await page.goto('https://dev.emdrbilateral.online', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));
  
  // Create session
  console.log('Clicking create session...');
  await page.click('#createSessionBtn');
  await new Promise(r => setTimeout(r, 5000));
  
  // Check what's on page
  const pageState = await page.evaluate(() => ({
    url: location.href,
    hasControllerLink: !!document.getElementById('controllerLink'),
    controllerLinkValue: document.getElementById('controllerLink')?.value,
    hasViewerLink: !!document.getElementById('viewerLink'),
    viewerLinkValue: document.getElementById('viewerLink')?.value,
    sessionCreatedVisible: !!document.querySelector('.session-created:not(.hidden)')
  }));
  console.log('Page state:', JSON.stringify(pageState, null, 2));
  
  await browser.close();
})();
