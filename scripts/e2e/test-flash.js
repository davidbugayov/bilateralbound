const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();

  // Set English language
  await page.goto('https://dev.emdrbilateral.online', {
    waitUntil: 'networkidle0',
  });
  await page.evaluate(() => localStorage.setItem('emdr-language', 'en'));

  // Create session and navigate to controller
  await page.click('#createSessionBtn');
  await new Promise((r) => setTimeout(r, 2000));

  // Get controller URL
  const controllerUrl = await page.url();

  // Navigate to controller page fresh (simulating user going directly to URL)
  await page.goto(controllerUrl, { waitUntil: 'domcontentloaded' });

  // Immediately check i18n-cloak
  const hasCloakEarly = await page.evaluate(() => {
    const cloak = document.getElementById('i18n-cloak');
    return cloak !== null;
  });
  console.log('i18n-cloak present immediately:', hasCloakEarly);

  // Check visibility of i18n elements
  const visibilityEarly = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n]');
    if (!el) return 'no element';
    return window.getComputedStyle(el).visibility;
  });
  console.log('data-i18n elements visibility:', visibilityEarly);

  // Wait for i18n to load
  await new Promise((r) => setTimeout(r, 3000));

  const hasCloakLater = await page.evaluate(() => {
    const cloak = document.getElementById('i18n-cloak');
    return cloak !== null;
  });
  console.log('i18n-cloak present after 3s:', hasCloakLater);

  const visibilityLater = await page.evaluate(() => {
    const el = document.querySelector('[data-i18n]');
    if (!el) return 'no element';
    return window.getComputedStyle(el).visibility;
  });
  console.log('data-i18n elements visibility after 3s:', visibilityLater);

  // Check actual text
  const sessionHeading = await page.evaluate(() => {
    const el = document.querySelector(
      '[data-i18n="controller.sessionHeading"]',
    );
    return el ? el.textContent : 'not found';
  });
  console.log('Session heading text:', sessionHeading);

  if (hasCloakEarly && !hasCloakLater && sessionHeading.includes('Session')) {
    console.log(
      '\n✅ Flash prevention working! Text appears in English after cloak is removed.',
    );
  } else if (!hasCloakEarly) {
    console.log(
      '\n⚠️ i18n-cloak not present - might see flash of untranslated text',
    );
  }

  await browser.close();
})();
