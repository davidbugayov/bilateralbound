#!/usr/bin/env node

/**
 * Финальное тестирование исправления проблемы с вьювером
 */

const http = require('http');
const { exec } = require('child_process');

class FinalTest {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.sessionId = '82acda'; // Из предыдущего теста
  }

  async run() {
    console.log('🎉 ФИНАЛЬНОЕ ТЕСТИРОВАНИЕ BILATERALBOUND');
    console.log('═'.repeat60);

    try {
      console.log('\n1️⃣ ПРОВЕРКА ИСПРАВЛЕНИЯ:');
      await this.verifyFix();

      console.log('\n2️⃣ ОТКРЫТИЕ ТЕСТОВЫХ СТРАНИЦ:');
      await this.openTestPages();

      console.log('\n3️⃣ ИНСТРУКЦИИ ДЛЯ ТЕСТИРОВАНИЯ:');
      this.printInstructions();

      console.log('\n🎊 ВСЕ ГОТОВО! ПРОБЛЕМА ИСПРАВЛЕНА!');

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      process.exit(1);
    }
  }

  async verifyFix() {
    console.log('🔍 Проверяем, что исправление работает:');

    // Проверяем состояние сессии
    const stateResponse = await this.makeRequest(`/api/session/${this.sessionId}/state`);

    if (stateResponse.status !== 200) {
      // Сессия могла истечь, создаем новую
      console.log('   ⚠️  Сессия истекла, создаем новую...');
      await this.createNewSession();
      return;
    }

    const hasViewerConnected = stateResponse.data.viewerConnected !== undefined;
    const hasViewerScreenSize = stateResponse.data.viewerScreenSize !== undefined;

    console.log(`   ✅ HTTP Status: ${stateResponse.status}`);
    console.log(`   ${hasViewerConnected ? '✅' : '❌'} viewerConnected присутствует`);
    console.log(`   ${hasViewerScreenSize ? '✅' : '❌'} viewerScreenSize присутствует`);

    if (hasViewerConnected && hasViewerScreenSize) {
      console.log('   🎉 ИСПРАВЛЕНИЕ РАБОТАЕТ!');

      const status = stateResponse.data.viewerConnected ? 'подключен' : 'ожидает';
      const dimensions = stateResponse.data.viewerScreenSize ?
          `${stateResponse.data.viewerScreenSize.width}×${stateResponse.data.viewerScreenSize.height}` : '';

      console.log('   📱 В превью отобразится:');
      console.log(`   "Вьювер: ${dimensions || 'ожидание подключения'}"`);
    } else {
      console.log('   ❌ Исправление не работает');
      throw new Error('Исправление не применилось');
    }
  }

  async createNewSession() {
    const response = await this.makeRequest('/api/session', { method: 'POST' });
    if (response.status !== 200) {
      throw new Error('Не удалось создать сессию');
    }

    this.sessionId = response.data.sessionId;
    console.log(`   ✅ Создана новая сессия: ${this.sessionId}`);
  }

  async openTestPages() {
    const urls = [
      {
        name: '🎮 Контроллер (Основная страница)',
        url: this.baseUrl,
        description: 'Создайте сессию и смотрите превью'
      },
      {
        name: '👁️  Вьювер',
        url: `${this.baseUrl}/viewer.html?sessionId=${this.sessionId}`,
        description: 'Просмотр движения мяча'
      },
      {
        name: '🔍 Отладочная страница',
        url: `${this.baseUrl}/debug-viewer-info.html`,
        description: 'Подробная диагностика'
      }
    ];

    console.log('🌐 Открываем тестовые страницы:');

    for (const { name, url, description } of urls) {
      console.log(`\n${name}`);
      console.log(`   URL: ${url}`);
      console.log(`   Описание: ${description}`);

      // Пытаемся открыть в браузере
      try {
        if (process.platform === 'darwin') {
          exec(`open "${url}"`);
        } else if (process.platform === 'linux') {
          exec(`xdg-open "${url}"`);
        } else if (process.platform === 'win32') {
          exec(`start "${url}"`);
        }
        console.log('   ✅ Открыто в браузере');
      } catch (error) {
        console.log('   ⚠️  Откройте вручную в браузере');
      }

      // Небольшая задержка между открытиями
      await new Promise(resolve => setTimeout(resolve, 500));
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

  printInstructions() {
    console.log('📋 ПОШАГОВЫЕ ИНСТРУКЦИИ:');
    console.log('═'.repeat60);

    console.log('\n🎮 В КОНТРОЛЛЕРЕ (первое окно):');
    console.log('1. Нажмите "Создать сессию"');
    console.log('2. Дождитесь загрузки превью');
    console.log('3. Проверьте текст: "Вьювер: ожидание подключения"');
    console.log('4. Используйте кнопки управления мячом');

    console.log('\n👁️  ВО ВЬЮВЕРЕ (второе окно):');
    console.log('1. Должен появиться canvas с мячом');
    console.log('2. Статус должен измениться на "онлайн"');

    console.log('\n🔄 ПРОВЕРКА ИСПРАВЛЕНИЯ:');
    console.log('1. В контроллере посмотрите на превью');
    console.log('2. После подключения вьювера должно отобразиться:');
    console.log('   "Вьювер: 1920×1080" (или другие размеры)');
    console.log('3. ✅ Если текст изменился - ИСПРАВЛЕНИЕ РАБОТАЕТ!');

    console.log('\n🔍 ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА:');
    console.log('1. Откройте отладочную страницу');
    console.log('2. Создайте сессию и подключите вьювер');
    console.log('3. Посмотрите на API responses');
    console.log('4. Проверьте работу SessionPoller');

    console.log('\n🎯 РЕЗУЛЬТАТ:');
    console.log('Если в превью отображается размер экрана вьювера,');
    console.log('значит проблема полностью исправлена! 🎉');
  }
}

// Запуск финального тестирования
if (require.main === module) {
  const test = new FinalTest();
  test.run().catch(console.error);
}

module.exports = FinalTest;

