#!/usr/bin/env node

/**
 * Локальный тест основных функций BilateralBound
 * Проверяет работу index.html и viewer.html локально
 */

const http = require('http');
const { exec } = require('child_process');

class LocalTest {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.sessionId = null;
  }

  async run() {
    console.log('🏠 ЛОКАЛЬНОЕ ТЕСТИРОВАНИЕ BILATERALBOUND');
    console.log('═'.repeat(60));

    try {
      console.log('\n1️⃣  ПРОВЕРКА ДОСТУПНОСТИ СЕРВЕРА:');
      await this.checkServerHealth();

      console.log('\n2️⃣  ПРОВЕРКА INDEX.HTML:');
      await this.testIndexPage();

      console.log('\n3️⃣  ПРОВЕРКА VIEWER.HTML:');
      await this.testViewerPage();

      console.log('\n4️⃣  ТЕСТИРОВАНИЕ API:');
      await this.testAPI();

      console.log('\n5️⃣  ИНТЕГРАЦИОННЫЙ ТЕСТ:');
      await this.testIntegration();

      console.log('\n🎉 ЛОКАЛЬНОЕ ТЕСТИРОВАНИЕ ПРОЙДЕНО!');
      console.log('✅ Все компоненты работают корректно');

    } catch (error) {
      console.error('❌ Ошибка тестирования:', error.message);
      process.exit(1);
    }
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
              data: data ? JSON.parse(data) : null,
              html: data
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: data,
              html: data
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

  async checkServerHealth() {
    const response = await this.makeRequest('/health');
    if (response.status !== 200) {
      throw new Error(`Сервер недоступен: ${response.status}`);
    }

    const health = response.data;
    console.log(`✅ Health check: ${health.status}`);
    console.log(`   Время работы: ${Math.round(health.uptime)}s`);
    console.log(`   Активных сессий: ${health.sessions}`);
  }

  async testIndexPage() {
    const response = await this.makeRequest('/');
    if (response.status !== 200) {
      throw new Error(`Index.html недоступен: ${response.status}`);
    }

    const html = response.html;
    const checks = [
      { name: 'HTML структура', check: html.includes('<!doctype html>') },
      { name: 'Title', check: html.includes('Создать сессию') },
      { name: 'JavaScript файлы', check: html.includes('session-poller.js') },
      { name: 'CSS стили', check: html.includes('floating-preview') },
      { name: 'Форма создания сессии', check: html.includes('createSession') },
      { name: 'Превью контейнер', check: html.includes('previewWrap') },
      { name: 'Информация о вьювере', check: html.includes('viewerInfo') }
    ];

    checks.forEach(({ name, check }) => {
      const status = check ? '✅' : '❌';
      console.log(`${status} ${name}`);
      if (!check) {
        throw new Error(`Проверка не пройдена: ${name}`);
      }
    });
  }

  async testViewerPage() {
    const response = await this.makeRequest('/viewer.html');
    if (response.status !== 200) {
      throw new Error(`Viewer.html недоступен: ${response.status}`);
    }

    const html = response.html;
    const checks = [
      { name: 'HTML структура', check: html.includes('<!DOCTYPE html>') },
      { name: 'Title', check: html.includes('BilateralBound - Просмотр') },
      { name: 'Canvas элемент', check: html.includes('<canvas') },
      { name: 'JavaScript файлы', check: html.includes('physics.js') },
      { name: 'Session Poller', check: html.includes('session-poller.js') },
      { name: 'Статус подключения', check: html.includes('statusOverlay') },
      { name: 'Инструкции', check: html.includes('instructions') }
    ];

    checks.forEach(({ name, check }) => {
      const status = check ? '✅' : '❌';
      console.log(`${status} ${name}`);
      if (!check) {
        throw new Error(`Проверка не пройдена: ${name}`);
      }
    });
  }

  async testAPI() {
    // Тест создания сессии
    const sessionResponse = await this.makeRequest('/api/session', { method: 'POST' });
    if (sessionResponse.status !== 200) {
      throw new Error(`Не удалось создать сессию: ${sessionResponse.status}`);
    }

    this.sessionId = sessionResponse.data.sessionId;
    console.log(`✅ Сессия создана: ${this.sessionId.slice(0, 8)}...`);

    // Тест получения состояния сессии
    const stateResponse = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    if (stateResponse.status !== 200) {
      throw new Error(`Не удалось получить состояние: ${stateResponse.status}`);
    }

    const state = stateResponse.data;
    console.log(`✅ Состояние получено:`);
    console.log(`   - Позиция: (${state.x}, ${state.y})`);
    console.log(`   - Скорость: (${state.vx}, ${state.vy})`);
    console.log(`   - Скорость: ${state.speed}%`);
    console.log(`   - Размер экрана: ${state.viewerScreenSize?.width || 'не задан'}×${state.viewerScreenSize?.height || 'не задан'}`);
  }

  async testIntegration() {
    // Создаем новую сессию для интеграционного теста
    const sessionResponse = await this.makeRequest('/api/session', { method: 'POST' });
    const testSessionId = sessionResponse.data.sessionId;

    // Подключаем вьювер
    const viewerResponse = await this.makeRequest(`/api/session/${testSessionId}/viewer/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { screenSize: { width: 1920, height: 1080 } }
    });

    if (viewerResponse.status !== 200) {
      throw new Error(`Не удалось подключить вьювер: ${viewerResponse.status}`);
    }

    console.log(`✅ Вьювер подключен к сессии: ${testSessionId.slice(0, 8)}...`);

    // Проверяем, что размер экрана сохранился
    const stateResponse = await this.makeRequest(`/api/session/${testSessionId}/state`);
    const state = stateResponse.data;

    if (!state.viewerScreenSize) {
      throw new Error('Размер экрана вьювера не сохранен');
    }

    if (state.viewerScreenSize.width !== 1920 || state.viewerScreenSize.height !== 1080) {
      throw new Error(`Неверный размер экрана: ${state.viewerScreenSize.width}×${state.viewerScreenSize.height}`);
    }

    console.log(`✅ Размер экрана вьювера сохранен: ${state.viewerScreenSize.width}×${state.viewerScreenSize.height}`);
    console.log(`✅ Интеграционный тест пройден!`);
  }

  async openBrowser() {
    console.log('\n🌐 ОТКРЫТИЕ В БРАУЗЕРЕ:');

    const urls = [
      { name: 'Контроллер (index.html)', url: 'http://localhost:3000/' },
      { name: 'Вьювер (viewer.html)', url: `http://localhost:3000/viewer.html?sessionId=${this.sessionId}` }
    ];

    urls.forEach(({ name, url }) => {
      console.log(`📱 ${name}: ${url}`);
    });

    console.log('\n💡 Инструкции:');
    console.log('1. Откройте контроллер в одном окне браузера');
    console.log('2. Создайте сессию и скопируйте Session ID');
    console.log('3. Откройте вьювер в другом окне с Session ID');
    console.log('4. Проверьте отображение размера экрана в превью');
  }
}

// Запуск тестирования
if (require.main === module) {
  const test = new LocalTest();
  test.run().then(() => {
    test.openBrowser();
  }).catch(console.error);
}

module.exports = LocalTest;
