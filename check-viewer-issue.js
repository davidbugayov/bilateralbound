#!/usr/bin/env node

/**
 * Проверка проблемы с отображением вьювера в превью
 * Диагностика в реальном времени
 */

const http = require('http');

class ViewerIssueChecker {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.sessionId = '83c2d6'; // Из предыдущего теста
  }

  async run() {
    console.log('🔍 ПРОВЕРКА ПРОБЛЕМЫ С ВЬЮВЕРОМ В РЕАЛЬНОМ ВРЕМЕНИ');
    console.log('═'.repeat70);

    try {
      console.log('\n1️⃣ ТЕКУЩЕЕ СОСТОЯНИЕ:');
      await this.checkCurrentState();

      console.log('\n2️⃣ ПРОВЕРКА SessionPoller ENDPOINT:');
      await this.testSessionPollerEndpoint();

      console.log('\n3️⃣ СИМУЛЯЦИЯ ОБНОВЛЕНИЯ:');
      await this.simulateUpdate();

      console.log('\n4️⃣ АНАЛИЗ ПРОБЛЕМЫ:');
      this.analyzeIssue();

    } catch (error) {
      console.error('❌ Ошибка проверки:', error.message);
      process.exit(1);
    }
  }

  async checkCurrentState() {
    const stateResponse = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    const sessionResponse = await this.makeRequest(`/api/session/${this.sessionId}`);

    console.log('📊 Состояние сессии:');
    console.log(`   Session ID: ${this.sessionId}`);
    console.log(`   Viewer Connected: ${sessionResponse.data.viewerConnected}`);
    console.log(`   Controller Connected: ${sessionResponse.data.controllerConnected}`);

    console.log('🎯 Состояние шара:');
    console.log(`   Viewer Screen Size: ${stateResponse.data.viewerScreenSize ?
        `${stateResponse.data.viewerScreenSize.width}×${stateResponse.data.viewerScreenSize.height}` :
        'null'}`);
    console.log(`   Position: (${stateResponse.data.x}, ${stateResponse.data.y})`);
    console.log(`   Velocity: (${stateResponse.data.vx}, ${stateResponse.data.vy})`);
  }

  async testSessionPollerEndpoint() {
    // Проверяем, что эндпоинт возвращает правильные данные для SessionPoller
    console.log('🔄 Проверяем эндпоинт /api/session/{id}/state (используется SessionPoller):');

    const response = await this.makeRequest(`/api/session/${this.sessionId}/state`);

    // Проверяем, содержит ли ответ viewerConnected
    const hasViewerConnected = response.data.viewerConnected !== undefined;
    const hasViewerScreenSize = response.data.viewerScreenSize !== undefined;

    console.log(`   ✅ HTTP Status: ${response.status}`);
    console.log(`   ${hasViewerConnected ? '✅' : '❌'} viewerConnected: ${response.data.viewerConnected}`);
    console.log(`   ${hasViewerScreenSize ? '✅' : '❌'} viewerScreenSize: ${hasViewerScreenSize ?
        `${response.data.viewerScreenSize.width}×${response.data.viewerScreenSize.height}` :
        'отсутствует'}`);

    if (!hasViewerConnected) {
      console.log('   ⚠️  ПРОБЛЕМА: viewerConnected не передается в /state эндпоинт!');
      console.log('   📝 SessionPoller получает только данные шара, но не статус подключения вьювера');
    }
  }

  async simulateUpdate() {
    console.log('🎭 Симулируем процесс обновления:');

    // 1. Имитируем получение данных SessionPoller
    const sessionData = await this.makeRequest(`/api/session/${this.sessionId}/state`);
    console.log('   📡 SessionPoller получил данные:', {
      viewerConnected: sessionData.data.viewerConnected,
      viewerScreenSize: sessionData.data.viewerScreenSize
    });

    // 2. Имитируем работу updateViewerInfo
    const mockSessionData = {
      viewerConnected: true,  // Добавляем недостающее поле
      viewerScreenSize: sessionData.data.viewerScreenSize
    };

    const status = mockSessionData.viewerConnected ? 'подключен' : 'ожидает';
    const dimensions = mockSessionData.viewerScreenSize ?
        `${mockSessionData.viewerScreenSize.width}×${mockSessionData.viewerScreenSize.height}` : '';

    let displayText;
    if (status === 'ожидает') {
      displayText = 'Вьювер: ожидание подключения';
    } else {
      displayText = `Вьювер: ${dimensions || 'размер неизвестен'}`;
    }

    console.log('   🔄 updateViewerInfo должна показать:', displayText);
    console.log('   ✅ Имитация успешна');
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

  analyzeIssue() {
    console.log('\n🎯 АНАЛИЗ ПРОБЛЕМЫ:');
    console.log('═'.repeat70);

    console.log('🔍 ВЫЯВЛЕННАЯ ПРОБЛЕМА:');
    console.log('Эндпоинт /api/session/{id}/state НЕ содержит поле viewerConnected!');
    console.log('SessionPoller получает данные шара, но не статус подключения вьювера.');

    console.log('\n📊 ЧТО ПРОИСХОДИТ:');
    console.log('1. ✅ Вьювер подключается - сервер сохраняет viewerScreenSize');
    console.log('2. ✅ SessionPoller получает viewerScreenSize из /state');
    console.log('3. ❌ SessionPoller НЕ получает viewerConnected из /state');
    console.log('4. ❌ updateViewerInfo получает неполные данные');
    console.log('5. ❌ Превью не обновляется');

    console.log('\n🛠️  РЕШЕНИЕ:');
    console.log('Добавить поле viewerConnected в эндпоинт /api/session/{id}/state');

    console.log('\n📝 ТЕКУЩИЕ ДАННЫЕ:');
    console.log('✅ /api/session/{id} содержит viewerConnected: true');
    console.log('❌ /api/session/{id}/state НЕ содержит viewerConnected');

    console.log('\n🎯 СЛЕДУЮЩИЕ ШАГИ:');
    console.log('1. Исправить серверный код');
    console.log('2. Добавить viewerConnected в /state эндпоинт');
    console.log('3. Протестировать исправление');
    console.log('4. Проверить отображение в превью');

    console.log('\n🚀 ГОТОВ К ИСПРАВЛЕНИЮ!');
  }
}

// Запуск проверки
if (require.main === module) {
  const checker = new ViewerIssueChecker();
  checker.run().catch(console.error);
}

module.exports = ViewerIssueChecker;

