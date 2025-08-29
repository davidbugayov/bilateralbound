#!/usr/bin/env node

/**
 * Тест отображения размера экрана вьювера в превью контроллера
 */

const http = require('http');
const { spawn } = require('child_process');

class ViewerScreenDisplayTest {
  constructor() {
    this.serverProcess = null;
    this.sessionId = null;
    this.baseUrl = 'http://localhost:3000';
  }

  async run() {
    console.log('🖥️ Тестируем отображение размера экрана вьювера...\n');

    try {
      // 1. Запускаем сервер
      await this.startServer();

      // 2. Создаем сессию
      this.sessionId = await this.createSession();
      console.log(`✅ Создана сессия: ${this.sessionId}`);

      // 3. Тестируем отображение без вьювера
      await this.testNoViewerDisplay();

      // 4. Подключаем вьювер с размером экрана
      await this.testViewerConnection();

      // 5. Проверяем отображение размера экрана
      await this.testScreenSizeDisplay();

      console.log('\n🎉 Все тесты пройдены! Отображение размера экрана работает корректно.');

    } catch (error) {
      console.error('❌ Ошибка тестирования:', error.message);
      process.exit(1);
    } finally {
      await this.stopServer();
    }
  }

  async startServer() {
    console.log('🚀 Запуск сервера...');

    this.serverProcess = spawn('node', ['src/server.js'], {
      detached: true,
      stdio: 'ignore'
    });

    await this.waitForServer(3000);
    console.log('✅ Сервер запущен');
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('🛑 Сервер остановлен');
    }
  }

  async waitForServer(port, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await this.makeRequest('/health');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    throw new Error('Сервер не запустился');
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
            resolve({ status: res.statusCode, data });
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

  async createSession() {
    const response = await this.makeRequest('/api/session', { method: 'POST' });
    if (response.status !== 200) {
      throw new Error(`Не удалось создать сессию: ${response.status}`);
    }
    return response.data.sessionId;
  }

  async testNoViewerDisplay() {
    console.log('📭 Тестируем отображение без подключенного вьювера...');

    const response = await this.makeRequest(`/api/session/${this.sessionId}`);
    if (response.status !== 200) {
      throw new Error(`Не удалось получить данные сессии: ${response.status}`);
    }

    const sessionData = response.data;
    const expectedText = 'ожидает';
    const actualText = sessionData.viewerConnected ? 'подключен' : 'ожидает';

    if (actualText !== expectedText) {
      throw new Error(`Ожидался статус "${expectedText}", получен "${actualText}"`);
    }

    console.log('✅ Статус без вьювера отображается корректно');
  }

  async testViewerConnection() {
    console.log('🔗 Подключаем вьювер с размером экрана 1920x1080...');

    const testScreenSize = { width: 1920, height: 1080 };

    const response = await this.makeRequest(`/api/session/${this.sessionId}/viewer/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { screenSize: testScreenSize }
    });

    if (response.status !== 200) {
      throw new Error(`Не удалось подключить вьювер: ${response.status}`);
    }

    // Ждем немного, чтобы сервер обработал подключение
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('✅ Вьювер подключен');
  }

  async testScreenSizeDisplay() {
    console.log('📱 Проверяем отображение размера экрана вьювера...');

    // Проверяем состояние шара (ball state), который содержит viewerScreenSize
    const response = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    if (response.status !== 200) {
      throw new Error(`Не удалось получить состояние шара: ${response.status}`);
    }

    const ballState = response.data;

    // Проверяем размер экрана
    if (!ballState.viewerScreenSize) {
      throw new Error('Размер экрана вьювера не найден в состоянии шара');
    }

    const { width, height } = ballState.viewerScreenSize;
    const expectedWidth = 1920;
    const expectedHeight = 1080;

    if (width !== expectedWidth || height !== expectedHeight) {
      throw new Error(`Ожидался размер экрана ${expectedWidth}×${expectedHeight}, получен ${width}×${height}`);
    }

    console.log(`✅ Размер экрана вьювера отображается корректно: ${width}×${height}`);

    // Также проверяем, что в данных сессии есть viewerConnected: true
    const sessionResponse = await this.makeRequest(`/api/session/${this.sessionId}`);
    if (sessionResponse.status !== 200) {
      throw new Error(`Не удалось получить данные сессии: ${sessionResponse.status}`);
    }

    if (!sessionResponse.data.viewerConnected) {
      throw new Error('Вьювер должен быть подключен в данных сессии');
    }

    console.log('✅ Статус подключения вьювера корректен');
  }
}

// Запуск теста
if (require.main === module) {
  const test = new ViewerScreenDisplayTest();
  test.run().catch(console.error);
}

module.exports = ViewerScreenDisplayTest;
