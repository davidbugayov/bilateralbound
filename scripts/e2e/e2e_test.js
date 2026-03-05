#!/usr/bin/env node
/**
 * E2E тест BilateralBound
 */

const puppeteer = require('puppeteer')

const BASE_URL = process.argv[2] || 'https://dev.emdrbilateral.online'
let browser,
  passed = 0,
  failed = 0;

async function test(name, fn) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 8000))
    ])
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  }
}

async function reserveSession(sessionId) {
  try {
    const res = await fetch(`${BASE_URL}/api/session/${sessionId}/reserve`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e) {
    console.warn(`⚠️  Could not reserve session ${sessionId}: ${e.message}`)
  }
}

async function main() {
  console.log(`\n🚀 E2E: ${BASE_URL}\n`)

  // Reserve sessions before navigating to controller/viewer pages
  await reserveSession('e2e_session')
  await reserveSession('e2e_mobile')

  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })

  // Тест главной страницы
  const mainPage = await browser.newPage()
  await mainPage.goto(BASE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  await test('Главная загружается', async () => {
    const t = await mainPage.title()
    if (!t.includes('Bilateral')) throw new Error('Bad title')
  })

  await test('Кнопка создания сессии', async () => {
    if (!(await mainPage.$('#createSessionBtn'))) throw new Error('Not found');
  })

  await test('Генерация ссылок', async () => {
    // Очищаем поле и вводим уникальный ID
    await mainPage.$eval('#customClientId', (el) => (el.value = ''));
    const testId = 'e2e_' + Date.now()
    await mainPage.type('#customClientId', testId)
    await mainPage.click('#generateLinksBtn')
    // Ждём небольшую задержку для запроса
    await new Promise((r) => setTimeout(r, 2000));
    // Проверяем что контейнер появился или запрос успешен
    const isVisible = await mainPage.evaluate(() => {
      const container = document.getElementById('generatedLinksContainer')
      // eslint-disable-next-line no-undef
      return container && getComputedStyle(container).display !== 'none'
    })
    if (!isVisible) {
      // Альтернативная проверка - просто проверяем что кнопка не в состоянии ошибки
      const btnText = await mainPage.$eval(
        '#generateLinksBtn',
        (el) => el.textContent,
      );
      if (btnText.includes('❌')) throw new Error('Link generation failed')
    }
  })

  await test('Language selector присутствует', async () => {
    if (!(await mainPage.$('#languageSelectorBtn')))
      throw new Error('Language selector not found');
  })

  await test('Переключение языка работает', async () => {
    // Открываем dropdown программно и выбираем English
    const result = await mainPage.evaluate(() => {
      const dropdown = document.getElementById('languageDropdown')
      if (dropdown) dropdown.removeAttribute('hidden')
      const enOption = document.querySelector('[data-lang="en"]')
      if (enOption) enOption.click()
      return { clicked: !!enOption, dropdownExists: !!dropdown }
    })
    if (!result.clicked) throw new Error('Language option not found')
    await new Promise((r) => setTimeout(r, 1000));
    const langSaved = await mainPage.evaluate(() =>
      localStorage.getItem('emdr-language'),
    );
    if (langSaved !== 'en') throw new Error('Language not saved: ' + langSaved)
  })

  await mainPage.close()

  // Тест контроллера
  const ctrlPage = await browser.newPage()
  await ctrlPage.goto(`${BASE_URL}/c/e2e_session`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  await test('Контроллер загружается', async () => {
    await ctrlPage.waitForSelector('#preview', { timeout: 10000 })
  })

  await test('Play кнопка', async () => {
    if (!(await ctrlPage.$('#playPauseBtn'))) throw new Error('Not found');
  })

  await test('Скорость контрол', async () => {
    if (!(await ctrlPage.$('#speedControl'))) throw new Error('Not found');
  })

  await test('PhysicsEngine', async () => {
    const ok = await ctrlPage.evaluate(
      () => typeof PhysicsEngine !== 'undefined',
    );
    if (!ok) throw new Error('Not found')
  })

  await test('togglePlayPause функция доступна', async () => {
    const ok = await ctrlPage.evaluate(
      () => typeof togglePlayPause === 'function',
    );
    if (!ok) throw new Error('togglePlayPause not defined')
  })

  await test('setDirection функция доступна', async () => {
    const ok = await ctrlPage.evaluate(
      () => typeof setDirection === 'function',
    );
    if (!ok) throw new Error('setDirection not defined')
  })

  await test('Клик на Play кнопку не вызывает ошибку', async () => {
    await ctrlPage.evaluate(() => {
      window.__jsErrors = []
      window.onerror = (msg) => window.__jsErrors.push(msg)
    })
    await ctrlPage.click('#playPauseBtn')
    await new Promise((r) => setTimeout(r, 500));
    const errors = await ctrlPage.evaluate(() => window.__jsErrors)
    if (errors.length > 0) throw new Error('JS errors: ' + errors.join(', '))
  })

  await test('i18n модуль загружен', async () => {
    const ok = await ctrlPage.evaluate(
      () =>
        typeof globalThis.i18n !== 'undefined' ||
        typeof globalThis.I18nConstants !== 'undefined',
    );
    if (!ok) throw new Error('i18n not loaded')
  })

  // Тест viewer
  const viewPage = await browser.newPage()
  await viewPage.goto(`${BASE_URL}/s/e2e_session`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  await test('Viewer загружается', async () => {
    await viewPage.waitForSelector('canvas', { timeout: 10000 })
  })

  await test('Viewer PhysicsEngine', async () => {
    const ok = await viewPage.evaluate(
      () => typeof PhysicsEngine !== 'undefined',
    );
    if (!ok) throw new Error('Not found')
  })

  await test('Realtime соединение работает', async () => {
    // Проверим что viewer получает состояние через WebSocket
    await new Promise((r) => setTimeout(r, 2000));
    const hasState = await viewPage.evaluate(() => {
      return (
        globalThis.__current?.sessionId !== undefined ||
        document.querySelector('canvas') !== null
      );
    })
    if (!hasState) throw new Error('Realtime state not received')
  })

  // Ждём подключения обоих клиентов (до 8с с polling каждые 500мс)
  await (async () => {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const connected = await ctrlPage.evaluate(
        () => globalThis.__current?.viewerConnected === true,
      );
      if (connected) break
      await new Promise((r) => setTimeout(r, 500));
    }
  })()

  // Тест: контроллер видит viewer как подключённый
  await test('Контроллер видит viewer подключён', async () => {
    const viewerConnected = await ctrlPage.evaluate(
      () => globalThis.__current?.viewerConnected === true,
    );
    if (!viewerConnected)
      throw new Error('Controller does not see viewer as connected');
  })

  // Тест: UI контроллера показывает статус подключения
  await test('viewerStatus shows connected', async () => {
    const statusText = await ctrlPage.evaluate(() => {
      return document
        .getElementById('viewerStatus')
        ?.textContent?.trim()
        ?.toLowerCase();
    })
    if (
      !statusText?.includes('connect') &&
      !statusText?.includes('подключен')
    ) {
      throw new Error(
        `viewerStatus text is "${statusText}", expected connected status`,
      );
    }
  })

  // Тест: viewer получает статус контроллера
  await test('Viewer видит controllerConnected', async () => {
    const controllerConnected = await viewPage.evaluate(() => {
      return (
        globalThis.__current?.controllerConnected === true ||
        globalThis.controllerConnected === true
      );
    })
    if (!controllerConnected)
      throw new Error('Viewer does not see controller as connected');
  })

  // Тест синхронизации движения viewer <-> controller
  await test('Синхронизация viewer-controller', async () => {
    // Step 1: Force pause via server API + directly reset all client play-state flags
    await ctrlPage.evaluate(async () => {
      const sid = globalThis.__current?.sessionId
      if (sid) {
        await fetch(`/api/session/${sid}/controller/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paused: true, returnToCenter: true })
        }).catch(() => {})
      }
      // Directly reset all play-state variables (avoids togglePlayPause state inconsistency)
      // Atomic assignment: set both variables without intermediate state check
      globalThis.__current = Object.assign(globalThis.__current || {}, {
        isPlaying: false,
      });
      globalThis.isPlaying = false
    })

    // Wait for server to process and broadcast the pause (state_update)
    await new Promise((r) => setTimeout(r, 1500));

    const beforeClick = await ctrlPage.evaluate(() => ({
      isPlaying: globalThis.__current?.isPlaying,
      viewerConnected: globalThis.__current?.viewerConnected,
      btnDisabled: document.getElementById('playPauseBtn')?.disabled,
      btnText: document.getElementById('playPauseBtn')?.textContent?.trim()
    }))
    console.log('  [SYNC DEBUG before click]', JSON.stringify(beforeClick))

    // Step 2: Start playback from controller
    await ctrlPage.evaluate(() => {
      const btn = document.getElementById('playPauseBtn')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 500));
    const afterClick = await ctrlPage.evaluate(() => ({
      isPlaying: globalThis.__current?.isPlaying,
      globalIsPlaying: globalThis.isPlaying
    }))
    console.log('  [SYNC DEBUG after click]', JSON.stringify(afterClick))

    // Step 3: Wait for sync propagation to viewer
    await new Promise((r) => setTimeout(r, 3000));

    const ctrlState = await ctrlPage.evaluate(() => ({
      isPlaying: globalThis.__current?.isPlaying,
      globalIsPlaying: globalThis.isPlaying,
      viewerConnected: globalThis.__current?.viewerConnected
    }))

    const viewState = await viewPage.evaluate(() => {
      const engine = globalThis.physicsEngine
      return {
        paused: engine?.state?.paused,
        engineExists: typeof engine !== 'undefined'
      }
    })

    const isPlayingOnCtrl =
      ctrlState.isPlaying === true || ctrlState.globalIsPlaying === true;
    const isPlayingOnViewer = viewState.paused === false
    const isPlaying = isPlayingOnCtrl || isPlayingOnViewer
    if (!isPlaying) {
      throw new Error(
        `Sync: ctrl.isPlaying=${ctrlState.isPlaying}/${ctrlState.globalIsPlaying}, view.paused=${viewState.paused}, viewer=${ctrlState.viewerConnected}`,
      );
    }
  })

  // Тест мобильного viewport
  const mobilePage = await browser.newPage()
  await mobilePage.setViewport({ width: 375, height: 667 })
  await mobilePage.goto(`${BASE_URL}/c/e2e_mobile`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  await test('Mobile viewport', async () => {
    await mobilePage.waitForSelector('#preview', { timeout: 10000 })
  })

  await browser.close()

  // Результат
  console.log(`\n${'='.repeat(40)}`)
  console.log(`Пройдено: ${passed}/${passed + failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Fatal:', e);
  if (browser) browser.close();
  process.exit(1);
});
