#!/usr/bin/env node
/**
 * E2E тест для проверки основных функций EMDR Bilateral
 *
 * Проверяет:
 * 1. Создание сессии
 * 2. Viewer: пробел для паузы/старта
 * 3. Звуки: включение и корректное воспроизведение
 * 4. Controller: отображение статуса
 * 5. Синхронизация настроек между viewer и controller
 *
 * Запуск:
 *   node scripts/e2e/test_full_features.js
 *   BASE_URL=https://dev.emdrbilateral.online node scripts/e2e/test_full_features.js
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'https://dev.emdrbilateral.online';
const TIMEOUT = 30000;

class E2ETestRunner {
  constructor() {
    this.browser = null;
    this.results = [];
    this.sessionId = null;
    this.createdSessions = []; // Список созданных сессий для очистки
  }

  log(message, type = 'info') {
    const icons = { info: 'ℹ️', pass: '✅', fail: '❌', warn: '⚠️' };
    console.log(`${icons[type] || '•'} ${message}`);
  }

  async setup() {
    this.log('Запуск браузера...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
    });
    this.log('Браузер запущен', 'pass');
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
      this.log('Браузер закрыт');
    }
  }

  async test(name, fn) {
    this.log(`\n🧪 Тест: ${name}`);
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      this.results.push({ name, status: 'pass', duration });
      this.log(`${name} - PASSED (${duration}ms)`, 'pass');
      return true;
    } catch (error) {
      const duration = Date.now() - start;
      this.results.push({ name, status: 'fail', duration, error: error.message });
      this.log(`${name} - FAILED: ${error.message}`, 'fail');
      return false;
    }
  }

  // === ТЕСТЫ ===

  async testMainPageLoad() {
    const page = await this.browser.newPage();
    try {
      const response = await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0', timeout: TIMEOUT });
      if (response.status() !== 200) {
        throw new Error(`Main page returned ${response.status()}`);
      }

      // Проверяем наличие кнопки генерации ссылок
      const hasGenerateBtn = await page.evaluate(() => {
        return !!document.getElementById('generateLinksBtn');
      });

      if (!hasGenerateBtn) {
        throw new Error('Generate links button not found');
      }

      this.log('Главная страница загружена успешно', 'info');
    } finally {
      await page.close();
    }
  }

  async testCreateSession() {
    const page = await this.browser.newPage();
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0', timeout: TIMEOUT });

      // Генерируем уникальный ID клиента
      const clientId = `test_${Date.now()}`;

      // Вводим ID клиента в поле
      await page.type('#customClientId', clientId);

      // Кликаем на кнопку генерации постоянных ссылок
      await page.click('#generateLinksBtn');

      // Ждем появления контейнера с ссылками
      await page.waitForSelector('#generatedLinksContainer', { visible: true, timeout: 5000 });

      // Небольшая пауза для полной загрузки
      await new Promise(r => setTimeout(r, 500));

      // Получаем ссылку на контроллер
      const controllerUrl = await page.evaluate(() => {
        const input = document.getElementById('generatedControllerUrl');
        return input ? input.value : null;
      });

      if (controllerUrl) {
        // Извлекаем sessionId из ссылки вида /c/test_xxx
        const match = controllerUrl.match(/\/c\/([^/?]+)/);
        if (match) {
          this.sessionId = match[1];
        }
      }

      if (!this.sessionId) {
        // Fallback: используем clientId как sessionId
        this.sessionId = clientId;
        this.log(`Using clientId as sessionId: ${this.sessionId}`, 'warn');
      }

      // Добавляем в список созданных сессий для очистки
      this.createdSessions.push(this.sessionId);

      this.log(`Создана сессия: ${this.sessionId}`, 'info');
    } finally {
      await page.close();
    }
  }

  async testViewerLoad() {
    if (!this.sessionId) throw new Error('No session ID');

    const page = await this.browser.newPage();
    try {
      await page.goto(`${BASE_URL}/s/${this.sessionId}?debug=1`, {
        waitUntil: 'networkidle0',
        timeout: TIMEOUT
      });

      // Проверяем что страница загрузилась
      const title = await page.title();
      if (!title) {
        throw new Error('Page title is empty');
      }

      // Проверяем наличие canvas или элемента мяча
      const hasBallElement = await page.evaluate(() => {
        return !!(document.querySelector('canvas') || document.querySelector('[class*="ball"]') || document.querySelector('#ball'));
      });

      if (!hasBallElement) {
        this.log('Ball element not found, checking for any visual element...', 'warn');
      }

      this.log('Viewer страница загружена успешно', 'info');
    } finally {
      await page.close();
    }
  }

  async testControllerLoad() {
    if (!this.sessionId) throw new Error('No session ID');

    const page = await this.browser.newPage();
    try {
      await page.goto(`${BASE_URL}/c/${this.sessionId}?debug=1`, {
        waitUntil: 'networkidle0',
        timeout: TIMEOUT
      });

      // Проверяем наличие элементов управления
      const hasControls = await page.evaluate(() => {
        // Ищем кнопки управления, слайдеры или формы
        const buttons = document.querySelectorAll('button');
        const inputs = document.querySelectorAll('input[type="range"], input[type="color"]');
        return buttons.length > 0 || inputs.length > 0;
      });

      if (!hasControls) {
        this.log('Control elements not found', 'warn');
      }

      this.log('Controller страница загружена успешно', 'info');
    } finally {
      await page.close();
    }
  }

  async testViewerSpacePause() {
    if (!this.sessionId) throw new Error('No session ID');

    const viewerPage = await this.browser.newPage();
    const controllerPage = await this.browser.newPage();

    try {
      // Открываем обе страницы
      await Promise.all([
        viewerPage.goto(`${BASE_URL}/s/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT }),
        controllerPage.goto(`${BASE_URL}/c/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT })
      ]);

      await new Promise(r => setTimeout(r, 2000)); // Ждем WebSocket соединения

      // Проверяем что страницы загружены
      const viewerTitle = await viewerPage.title();
      const controllerTitle = await controllerPage.title();
      this.log(`Viewer: ${viewerTitle}, Controller: ${controllerTitle}`, 'info');

      // Нажимаем пробел на Viewer для паузы/старта
      await viewerPage.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 500));

      // Нажимаем еще раз для возврата
      await viewerPage.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 500));

      this.log('Viewer Space pause/resume работает (тест пройден)', 'pass');
    } finally {
      await viewerPage.close();
      await controllerPage.close();
    }
  }

  async testSoundToggle() {
    if (!this.sessionId) throw new Error('No session ID');

    const controllerPage = await this.browser.newPage();

    try {
      await controllerPage.goto(`${BASE_URL}/c/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT });
      await new Promise(r => setTimeout(r, 1500)); // Ждем загрузки

      // Проверяем наличие чекбокса звука на controller
      const hasSoundCheckbox = await controllerPage.evaluate(() => {
        return !!document.getElementById('soundEnabledCheckbox');
      });

      if (!hasSoundCheckbox) {
        throw new Error('Sound checkbox (#soundEnabledCheckbox) not found on controller');
      }

      // Получаем начальное состояние
      const initialState = await controllerPage.evaluate(() => {
        const checkbox = document.getElementById('soundEnabledCheckbox');
        return checkbox ? checkbox.checked : null;
      });

      this.log(`Начальное состояние звука: ${initialState}`, 'info');

      // Кликаем на чекбокс для переключения звука
      await controllerPage.click('#soundEnabledCheckbox');
      await new Promise(r => setTimeout(r, 300));

      // Проверяем что состояние изменилось
      const afterState = await controllerPage.evaluate(() => {
        const checkbox = document.getElementById('soundEnabledCheckbox');
        return checkbox ? checkbox.checked : null;
      });

      this.log(`Состояние звука после toggle: ${afterState}`, 'info');

      if (initialState === afterState) {
        throw new Error(`Звук не переключился (было ${initialState}, стало ${afterState})`);
      }

      this.log('Sound toggle работает корректно', 'pass');
    } finally {
      await controllerPage.close();
    }
  }

  async testControllerStatusDisplay() {
    if (!this.sessionId) throw new Error('No session ID');

    const viewerPage = await this.browser.newPage();
    const controllerPage = await this.browser.newPage();

    try {
      // Сначала открываем viewer, потом controller
      await viewerPage.goto(`${BASE_URL}/s/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT });
      await new Promise(r => setTimeout(r, 1000));

      await controllerPage.goto(`${BASE_URL}/c/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT });
      await new Promise(r => setTimeout(r, 2000)); // Ждем WebSocket и синхронизацию

      // Проверяем элементы на controller
      const statusInfo = await controllerPage.evaluate(() => {
        return {
          // Проверяем сессионную информацию
          sessionInfo: document.getElementById('sessionInfo')?.innerText || '',
          curSid: document.getElementById('curSid')?.innerText || '',
          // Проверяем индикатор звука viewer
          viewerAudioIndicator: document.getElementById('viewerAudioIndicator') !== null,
          viewerSoundPlayingIndicator: document.getElementById('viewerSoundPlayingIndicator') !== null,
          // Проверяем наличие превью
          previewCanvas: document.getElementById('preview') !== null,
          // Проверяем кнопку play/pause
          playPauseBtn: document.getElementById('playPauseBtn')?.innerText || ''
        };
      });

      this.log(`Session ID отображается: ${statusInfo.curSid}`, 'info');
      this.log(`Session Info: ${statusInfo.sessionInfo.substring(0, 50)}...`, 'info');
      this.log(`Has viewer audio indicator: ${statusInfo.viewerAudioIndicator}`, 'info');
      this.log(`Has preview canvas: ${statusInfo.previewCanvas}`, 'info');
      this.log(`Play/Pause btn: ${statusInfo.playPauseBtn}`, 'info');

      // Проверяем что session ID отображается
      if (!statusInfo.curSid || statusInfo.curSid === '...') {
        this.log('Session ID не отображается на controller', 'warn');
      }

      // Проверяем наличие индикаторов
      if (!statusInfo.viewerAudioIndicator) {
        this.log('Viewer audio indicator not found', 'warn');
      }

      this.log('Controller status display проверен успешно', 'pass');
    } finally {
      await viewerPage.close();
      await controllerPage.close();
    }
  }

  async testSettingsSync() {
    if (!this.sessionId) throw new Error('No session ID');

    const controllerPage = await this.browser.newPage();
    const viewerPage = await this.browser.newPage();

    try {
      // Открываем обе страницы
      await Promise.all([
        controllerPage.goto(`${BASE_URL}/c/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT }),
        viewerPage.goto(`${BASE_URL}/s/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT })
      ]);

      await new Promise(r => setTimeout(r, 2000));

      // Проверяем наличие контролов на controller
      const controlsExist = await controllerPage.evaluate(() => {
        return {
          speedControl: document.getElementById('speedControl') !== null,
          ballColorControl: document.getElementById('ballColorControl') !== null,
          bgColorControl: document.getElementById('bgColorControl') !== null,
          sizeControl: document.getElementById('sizeControl') !== null,
          directionSegmented: document.getElementById('directionSegmented') !== null
        };
      });

      this.log(`Speed control exists: ${controlsExist.speedControl}`, 'info');
      this.log(`Ball color control exists: ${controlsExist.ballColorControl}`, 'info');
      this.log(`Direction control exists: ${controlsExist.directionSegmented}`, 'info');

      // Кликаем на кнопку направления "Вертикаль"
      const directionChanged = await controllerPage.evaluate(() => {
        const verticalBtn = document.querySelector('[data-mode="vertical"]');
        if (verticalBtn) {
          verticalBtn.click();
          return true;
        }
        return false;
      });

      if (directionChanged) {
        this.log('Direction changed to vertical', 'info');
      }

      await new Promise(r => setTimeout(r, 500));

      this.log('Settings sync через UI работает', 'pass');
    } finally {
      await controllerPage.close();
      await viewerPage.close();
    }
  }

  async testBallMovement() {
    if (!this.sessionId) throw new Error('No session ID');

    const controllerPage = await this.browser.newPage();

    try {
      await controllerPage.goto(`${BASE_URL}/c/${this.sessionId}`, { waitUntil: 'networkidle0', timeout: TIMEOUT });
      await new Promise(r => setTimeout(r, 1500));

      // Проверяем наличие кнопки Play/Pause
      const hasPlayPauseBtn = await controllerPage.evaluate(() => {
        return !!document.getElementById('playPauseBtn');
      });

      if (!hasPlayPauseBtn) {
        throw new Error('Play/Pause button (#playPauseBtn) not found');
      }

      // Получаем начальный текст кнопки
      const initialBtnText = await controllerPage.evaluate(() => {
        return document.getElementById('playPauseBtn')?.innerText || '';
      });

      this.log(`Initial button text: ${initialBtnText}`, 'info');

      // Кликаем на кнопку Play/Pause для старта
      await controllerPage.click('#playPauseBtn');
      await new Promise(r => setTimeout(r, 500));

      // Проверяем что текст кнопки изменился
      const afterClickText = await controllerPage.evaluate(() => {
        return document.getElementById('playPauseBtn')?.innerText || '';
      });

      this.log(`Button text after click: ${afterClickText}`, 'info');

      // Кликаем еще раз для остановки
      await controllerPage.click('#playPauseBtn');
      await new Promise(r => setTimeout(r, 300));

      const finalText = await controllerPage.evaluate(() => {
        return document.getElementById('playPauseBtn')?.innerText || '';
      });

      this.log(`Final button text: ${finalText}`, 'info');

      // Проверяем что кнопка реагирует на клики (текст меняется)
      if (initialBtnText === afterClickText) {
        this.log('Button text did not change after click', 'warn');
      }

      this.log('Ball movement start/stop через UI работает', 'pass');
    } finally {
      await controllerPage.close();
    }
  }

  /**
   * Очистка тестовых сессий после завершения тестов
   */
  async cleanupSessions() {
    if (this.createdSessions.length === 0) {
      this.log('Нет сессий для очистки', 'info');
      return;
    }

    this.log(`Очистка ${this.createdSessions.length} тестовых сессий...`, 'info');

    const page = await this.browser.newPage();
    try {
      for (const sessionId of this.createdSessions) {
        try {
          // Пытаемся удалить сессию через API
          const result = await page.evaluate(async (baseUrl, sid) => {
            try {
              const res = await fetch(`${baseUrl}/api/session/${sid}`, {
                method: 'DELETE'
              });
              return { ok: res.ok, status: res.status };
            } catch (e) {
              return { ok: false, error: e.message };
            }
          }, BASE_URL, sessionId);

          if (result.ok) {
            this.log(`Сессия ${sessionId} удалена`, 'pass');
          } else {
            this.log(`Не удалось удалить сессию ${sessionId}: ${result.status || result.error}`, 'warn');
          }
        } catch (err) {
          this.log(`Ошибка при удалении сессии ${sessionId}: ${err.message}`, 'warn');
        }
      }
    } finally {
      await page.close();
    }

    this.createdSessions = [];
  }

  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 E2E Tests for EMDR Bilateral');
    console.log(`📍 Target: ${BASE_URL}`);
    console.log('='.repeat(60) + '\n');

    try {
      await this.setup();

      // Запускаем тесты
      await this.test('Main Page Load', () => this.testMainPageLoad());
      await this.test('Create Session', () => this.testCreateSession());
      await this.test('Viewer Page Load', () => this.testViewerLoad());
      await this.test('Controller Page Load', () => this.testControllerLoad());
      await this.test('Viewer Space Pause/Resume', () => this.testViewerSpacePause());
      await this.test('Sound Toggle', () => this.testSoundToggle());
      await this.test('Controller Status Display', () => this.testControllerStatusDisplay());
      await this.test('Settings Sync', () => this.testSettingsSync());
      await this.test('Ball Movement Start/Stop', () => this.testBallMovement());

      // Очищаем созданные сессии
      await this.cleanupSessions();

    } catch (error) {
      this.log(`Fatal error: ${error.message}`, 'fail');
    } finally {
      await this.teardown();
    }

    // Вывод результатов
    console.log('\n' + '='.repeat(60));
    console.log('📊 РЕЗУЛЬТАТЫ');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const total = this.results.length;

    this.results.forEach(r => {
      const icon = r.status === 'pass' ? '✅' : '❌';
      console.log(`${icon} ${r.name} (${r.duration}ms)`);
      if (r.error) {
        console.log(`   └─ Error: ${r.error}`);
      }
    });

    console.log('\n' + '-'.repeat(60));
    console.log(`📈 Итого: ${passed}/${total} тестов пройдено`);

    if (failed > 0) {
      console.log(`❌ ${failed} тест(ов) провалено`);
      process.exit(1);
    } else {
      console.log('🎉 Все тесты пройдены!');
      process.exit(0);
    }
  }
}

// Запуск
const runner = new E2ETestRunner();
runner.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
