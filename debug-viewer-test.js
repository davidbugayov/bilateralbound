#!/usr/bin/env node

/**
 * Отладка проблемы с отображением информации о вьювере
 */

const http = require('http');
const { exec } = require('child_process');

class DebugViewerTest {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.sessionId = null;
  }

  async run() {
    console.log('🔍 ОТЛАДКА ПРОБЛЕМЫ С ОТОБРАЖЕНИЕМ ВЬЮВЕРА');
    console.log('═'.repeat60);

    try {
      console.log('\n1️⃣ ПРОВЕРКА СЕРВЕРА:');
      await this.checkServer();

      console.log('\n2️⃣ СОЗДАНИЕ ТЕСТОВОЙ СЕССИИ:');
      await this.createSession();

      console.log('\n3️⃣ ПРОВЕРКА API:');
      await this.testAPI();

      console.log('\n4️⃣ ТЕСТИРОВАНИЕ ПОДКЛЮЧЕНИЯ ВЬЮВЕРА:');
      await this.testViewerConnection();

      console.log('\n5️⃣ ОТКРЫТИЕ ОТЛАДОЧНОЙ СТРАНИЦЫ:');
      await this.openDebugPage();

      console.log('\n📋 РЕЗУЛЬТАТЫ ОТЛАДКИ:');
      this.printResults();

    } catch (error) {
      console.error('❌ Ошибка отладки:', error.message);
      process.exit(1);
    }
  }

  async checkServer() {
    const response = await this.makeRequest('/health');
    if (response.status !== 200) {
      throw new Error(`Сервер недоступен: ${response.status}`);
    }
    console.log('✅ Сервер работает');
  }

  async createSession() {
    const response = await this.makeRequest('/api/session', { method: 'POST' });
    if (response.status !== 200) {
      throw new Error(`Не удалось создать сессию: ${response.status}`);
    }

    this.sessionId = response.data.sessionId;
    console.log(`✅ Создана сессия: ${this.sessionId}`);
  }

  async testAPI() {
    // Проверяем основную информацию о сессии
    const sessionResponse = await this.makeRequest(`/api/session/${this.sessionId}`);
    console.log('📊 Основная информация о сессии:');
    console.log(`   - viewerConnected: ${sessionResponse.data.viewerConnected}`);
    console.log(`   - controllerConnected: ${sessionResponse.data.controllerConnected}`);

    // Проверяем состояние шара
    const stateResponse = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    console.log('🎯 Состояние шара:');
    console.log(`   - viewerScreenSize: ${stateResponse.data.viewerScreenSize ?
        `${stateResponse.data.viewerScreenSize.width}×${stateResponse.data.viewerScreenSize.height}` :
        'null'}`);
    console.log(`   - viewerConnected: ${stateResponse.data.viewerConnected !== undefined ?
        stateResponse.data.viewerConnected : 'не определено'}`);
  }

  async testViewerConnection() {
    console.log('🔗 Подключаем тестовый вьювер...');

    const viewerResponse = await this.makeRequest(`/api/session/${this.sessionId}/viewer/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { screenSize: { width: 1920, height: 1080 } }
    });

    if (viewerResponse.status !== 200) {
      throw new Error(`Не удалось подключить вьювер: ${viewerResponse.status}`);
    }

    console.log('✅ Вьювер подключен');

    // Ждем немного и проверяем обновление
    await new Promise(resolve => setTimeout(resolve, 100));

    const updatedState = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    console.log('🔄 После подключения вьювера:');
    console.log(`   - viewerScreenSize: ${updatedState.data.viewerScreenSize ?
        `${updatedState.data.viewerScreenSize.width}×${updatedState.data.viewerScreenSize.height}` :
        'null'}`);
  }

  async openDebugPage() {
    const debugUrl = `${this.baseUrl}/debug-viewer-info.html`;

    console.log(`🌐 Открываем отладочную страницу:`);
    console.log(`   ${debugUrl}`);
    console.log(`   Session ID: ${this.sessionId}`);

    // Пытаемся открыть в браузере
    try {
      if (process.platform === 'darwin') {
        exec(`open "${debugUrl}"`);
      } else if (process.platform === 'linux') {
        exec(`xdg-open "${debugUrl}"`);
      } else if (process.platform === 'win32') {
        exec(`start "${debugUrl}"`);
      }
      console.log('✅ Страница открыта в браузере');
    } catch (error) {
      console.log('⚠️  Не удалось автоматически открыть браузер');
    }

    // Также показываем URL для вьювера
    const viewerUrl = `${this.baseUrl}/viewer.html?sessionId=${this.sessionId}`;
    console.log(`👁️  URL для вьювера:`);
    console.log(`   ${viewerUrl}`);
  }

  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const reqOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              data: data ? JSON.parse(data) : null
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: data
            });
          }
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  printResults() {
    console.log('\n🎯 ПРОБЛЕМА:');
    console.log('В превью не отображается информация о подключенном вьювере');

    console.log('\n🔍 ВОЗМОЖНЫЕ ПРИЧИНЫ:');
    console.log('1. SessionPoller не получает обновления');
    console.log('2. updateViewerInfo не вызывается');
    console.log('3. HTML элемент не обновляется');
    console.log('4. Проблема с CORS или загрузкой скриптов');

    console.log('\n🛠️  РЕШЕНИЯ ДЛЯ ПРОВЕРКИ:');
    console.log('1. Откройте отладочную страницу в браузере');
    console.log('2. Создайте сессию и подключите вьювер');
    console.log('3. Проверьте логи консоли браузера (F12)');
    console.log('4. Посмотрите на API responses');
    console.log('5. Проверьте работу SessionPoller');

    console.log('\n📊 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:');
    console.log('После подключения вьювера должно отобразиться:');
    console.log('"Вьювер: 1920×1080" или подобное');

    console.log('\n🚀 ОТКРОЙТЕ ЭТИ ССЫЛКИ:');
    console.log(`🔍 Debug: ${this.baseUrl}/debug-viewer-info.html`);
    console.log(`👁️  Viewer: ${this.baseUrl}/viewer.html?sessionId=${this.sessionId}`);
    console.log(`🎮 Controller: ${this.baseUrl}/`);
  }
}

// Запуск отладки
if (require.main === module) {
  const debug = new DebugViewerTest();
  debug.run().catch(console.error);
}

module.exports = DebugViewerTest;

