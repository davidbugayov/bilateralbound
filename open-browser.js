#!/usr/bin/env node

/**
 * Скрипт для открытия браузера и тестирования BilateralBound локально
 */

const { exec } = require('child_process');
const http = require('http');

class BrowserOpener {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.sessionId = null;
  }

  async run() {
    console.log('🌐 ОТКРЫТИЕ BILATERALBOUND В БРАУЗЕРЕ');
    console.log('═'.repeat60);

    try {
      // Проверяем, что сервер работает
      await this.checkServer();

      // Создаем тестовую сессию
      this.sessionId = await this.createTestSession();

      // Открываем браузер
      await this.openBrowser();

      console.log('\n🎮 ГОТОВО К ТЕСТИРОВАНИЮ!');
      console.log('\n📋 ЧТО ПРОВЕРИТЬ:');
      console.log('1. ✅ Контроллер загружается');
      console.log('2. ✅ Создание сессии работает');
      console.log('3. ✅ Превью отображается');
      console.log('4. ✅ Вьювер подключается');
      console.log('5. ✅ Размер экрана отображается в превью');
      console.log('6. ✅ Управление мячом работает');

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      process.exit(1);
    }
  }

  async checkServer() {
    return new Promise((resolve, reject) => {
      const req = http.get(`${this.baseUrl}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Сервер работает');
          resolve();
        } else {
          reject(new Error(`Сервер вернул статус ${res.statusCode}`));
        }
      });

      req.on('error', () => {
        reject(new Error('Сервер недоступен. Запустите: npm start'));
      });

      req.setTimeout(3000, () => {
        req.destroy();
        reject(new Error('Таймаут подключения к серверу'));
      });
    });
  }

  async createTestSession() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/session',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            console.log(`✅ Тестовая сессия создана: ${response.sessionId.slice(0, 8)}...`);
            resolve(response.sessionId);
          } catch (error) {
            reject(new Error('Не удалось разобрать ответ сервера'));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  async openBrowser() {
    const urls = [
      {
        name: '🎮 Контроллер',
        url: this.baseUrl,
        description: 'Создайте сессию и управляйте мячом'
      },
      {
        name: '👁️  Вьювер',
        url: `${this.baseUrl}/viewer.html?sessionId=${this.sessionId}`,
        description: 'Просмотр движения мяча'
      }
    ];

    console.log('\n📱 ОТКРЫВАЕМЫЕ СТРАНИЦЫ:');

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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  printInstructions() {
    console.log('\n📋 ИНСТРУКЦИИ ТЕСТИРОВАНИЯ:');
    console.log('═'.repeat60);

    console.log('\n🎮 В КОНТРОЛЛЕРЕ (первое окно):');
    console.log('1. Нажмите "Создать сессию"');
    console.log('2. Дождитесь загрузки превью');
    console.log('3. Проверьте текст: "Вьювер: ожидание подключения"');
    console.log('4. Используйте кнопки управления мячом');
    console.log('5. Изменяйте скорость ползунком');

    console.log('\n👁️  В ВЬЮВЕРЕ (второе окно):');
    console.log('1. Должен появиться canvas с мячом');
    console.log('2. Проверьте подключение: статус должен стать "онлайн"');
    console.log('3. Проверьте движение мяча при управлении из контроллера');

    console.log('\n🔄 ПРОВЕРКА СИНХРОНИЗАЦИИ:');
    console.log('1. В контроллере посмотрите на превью');
    console.log('2. После подключения вьювера должно отобразиться: "Вьювер: 1920×1080"');
    console.log('3. Изменения скорости должны синхронизироваться');

    console.log('\n🚨 ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ:');
    console.log('• Проверьте консоль браузера (F12)');
    console.log('• Проверьте логи сервера');
    console.log('• Перезагрузите страницы');
  }
}

// Запуск
if (require.main === module) {
  const opener = new BrowserOpener();
  opener.run().then(() => {
    opener.printInstructions();
  }).catch(console.error);
}

module.exports = BrowserOpener;

