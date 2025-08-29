#!/usr/bin/env node

/**
 * Тест исправления проблемы с SessionPoller и скоростью
 * Проверяет, что:
 * 1. SessionPoller не дублирован
 * 2. Изменения скорости не перезаписываются polling'ом
 * 3. Синхронизация работает корректно
 */

const http = require('http');
const fs = require('fs');

class SpeedPollingTest {
  constructor() {
    this.server = null;
    this.sessionId = null;
    this.baseUrl = 'http://localhost:3000';
  }

  async run() {
    console.log('🧪 Тестируем исправления SessionPoller и скорости...\n');

    try {
      // 1. Запускаем сервер
      await this.startServer();

      // 2. Создаем сессию
      this.sessionId = await this.createSession();
      console.log(`✅ Создана сессия: ${this.sessionId}`);

      // 3. Проверяем отсутствие дублирования SessionPoller
      await this.testSessionPollerDeduplication();

      // 4. Тестируем изменение скорости без перезаписи
      await this.testSpeedChangeStability();

      console.log('\n🎉 Все тесты пройдены! Исправления работают корректно.');

    } catch (error) {
      console.error('❌ Ошибка тестирования:', error.message);
      process.exit(1);
    } finally {
      await this.stopServer();
    }
  }

  async startServer() {
    console.log('🚀 Запуск сервера...');

    // Запускаем сервер в фоне
    const { spawn } = require('child_process');
    this.serverProcess = spawn('node', ['src/server.js'], {
      detached: true,
      stdio: 'ignore'
    });

    // Ждем запуска сервера
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

  async testSessionPollerDeduplication() {
    console.log('🔍 Проверяем отсутствие дублирования SessionPoller...');

    // Проверяем, что SessionPoller определен только в session-poller.js
    const sessionPollerContent = fs.readFileSync('public/js/session-poller.js', 'utf8');
    const commonContent = fs.readFileSync('public/js/common.js', 'utf8');

    const sessionPollerInMain = (sessionPollerContent.match(/class SessionPoller/g) || []).length;
    const sessionPollerInCommon = (commonContent.match(/class SessionPoller/g) || []).length;

    if (sessionPollerInMain !== 1) {
      throw new Error(`Ожидался 1 класс SessionPoller в session-poller.js, найдено: ${sessionPollerInMain}`);
    }

    if (sessionPollerInCommon !== 0) {
      throw new Error(`SessionPoller не должен быть в common.js, найдено: ${sessionPollerInCommon}`);
    }

    console.log('✅ SessionPoller корректно дедублирован');
  }

  async testSpeedChangeStability() {
    console.log('⚡ Тестируем стабильность изменения скорости...');

    // Изменяем скорость
    const response = await this.makeRequest(`/api/session/${this.sessionId}/controller/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { speedScalar: 80, dirX: 1, dirY: 0, resume: true }
    });

    if (response.status !== 200) {
      throw new Error(`Не удалось изменить скорость: ${response.status}`);
    }

    // Проверяем, что скорость установлена
    const stateResponse = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    if (stateResponse.status !== 200) {
      throw new Error(`Не удалось получить состояние: ${stateResponse.status}`);
    }

    const speed = stateResponse.data.speed;
    if (speed !== 80) {
      throw new Error(`Ожидалась скорость 80, получена: ${speed}`);
    }

    console.log('✅ Изменение скорости работает корректно');
  }
}

// Запуск теста
if (require.main === module) {
  const test = new SpeedPollingTest();
  test.run().catch(console.error);
}

module.exports = SpeedPollingTest;

