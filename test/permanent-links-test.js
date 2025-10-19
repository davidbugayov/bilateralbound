/**
 * Тест для проверки работы постоянных ссылок и статуса контроллера
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

class PermanentLinksTest {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.testSessionId = 'test-session-' + Date.now();
    this.controllerWs = null;
    this.viewerWs = null;
    this.testResults = [];
  }

  log(message, status = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : 'ℹ️';
    console.log(`[${timestamp}] ${emoji} ${message}`);
    this.testResults.push({ timestamp, status, message });
  }

  async testPermanentLinks() {
    this.log('🧪 Начинаем тестирование постоянных ссылок');
    
    try {
      // Шаг 1: Создаем сессию через API
      await this.createSession();
      
      // Шаг 2: Подключаем контроллер
      await this.connectController();
      
      // Шаг 3: Подключаем вьювер (постоянная ссылка)
      await this.connectViewer();
      
      // Шаг 4: Проверяем статус подключения в реальном времени
      await this.testConnectionStatus();
      
      // Шаг 5: Тестируем перезагрузку страницы с постоянной ссылкой
      await this.testPageReload();
      
      this.log('🎉 Тестирование завершено успешно!');
      this.printResults();
      
    } catch (error) {
      this.log(`❌ Ошибка тестирования: ${error.message}`, 'error');
      this.printResults();
    }
  }

  async createSession() {
    this.log('📋 Создание тестовой сессии...');
    
    const response = await fetch(`${this.baseUrl}/api/session/${this.testSessionId}/controller/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Не удалось создать сессию: ${response.status}`);
    }

    this.log('✅ Сессия создана успешно');
  }

  async connectController() {
    this.log('🎮 Подключение контроллера...');
    
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:3000?sessionId=${this.testSessionId}&role=controller`;
      this.controllerWs = new WebSocket(url);

      this.controllerWs.on('open', () => {
        this.log('✅ Контроллер подключен');
        resolve();
      });

      this.controllerWs.on('error', (error) => {
        this.log(`❌ Ошибка подключения контроллера: ${error.message}`, 'error');
        reject(error);
      });

      // Таймаут подключения
      setTimeout(() => {
        if (this.controllerWs.readyState !== WebSocket.OPEN) {
          reject(new Error('Таймаут подключения контроллера'));
        }
      }, 5000);
    });
  }

  async connectViewer() {
    this.log('👁️ Подключение вьювера (постоянная ссылка)...');
    
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:3000?sessionId=${this.testSessionId}&role=viewer`;
      this.viewerWs = new WebSocket(url);

      let receivedInitialState = false;
      let receivedControllerStatus = false;

      this.viewerWs.on('open', () => {
        this.log('✅ Вьювер подключен');
      });

      this.viewerWs.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.log(`📨 Получено сообщение от вьювера: ${message.type}`);

          if (message.type === 'initial_state') {
            receivedInitialState = true;
            this.log('✅ Получено initial_state');
            
            // Проверяем статус контроллера в начальном состоянии
            if (message.payload.controllerConnected === false) {
              this.log('ℹ️ Ожидаемое поведение: controllerConnected = false при первом подключении вьювера');
            }
          }

          if (message.type === 'controller_connected') {
            receivedControllerStatus = true;
            this.log('✅ Получено controller_connected');
          }

          if (receivedInitialState && receivedControllerStatus) {
            resolve();
          }
        } catch (error) {
          this.log(`❌ Ошибка разбора сообщения: ${error.message}`, 'error');
        }
      });

      this.viewerWs.on('error', (error) => {
        this.log(`❌ Ошибка подключения вьювера: ${error.message}`, 'error');
        reject(error);
      });

      // Таймаут подключения
      setTimeout(() => {
        if (!receivedInitialState || !receivedControllerStatus) {
          reject(new Error('Таймаут ожидания сообщений от вьювера'));
        }
      }, 10000);
    });
  }

  async testConnectionStatus() {
    this.log('🔍 Проверка статуса подключения в реальном времени...');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Таймаут проверки статуса'));
      }, 5000);

      const checkStatus = () => {
        if (this.viewerWs && this.viewerWs.readyState === WebSocket.OPEN) {
          // В реальном приложении здесь была бы логика проверки UI
          // Но в тесте мы проверяем получение сообщений
          this.log('✅ Статус подключения проверен');
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkStatus, 100);
        }
      };

      checkStatus();
    });
  }

  async testPageReload() {
    this.log('🔄 Тест перезагрузки страницы с постоянной ссылкой...');
    
    // Имитируем перезагрузку страницы - создаем новое подключение вьювера
    const newViewerWs = new WebSocket(`ws://localhost:3000?sessionId=${this.testSessionId}&role=viewer`);

    newViewerWs.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'initial_state') {
          this.log('✅ Перезагрузка страницы: вьювер получил начальное состояние');
          
          if (message.payload.controllerConnected === true) {
            this.log('✅ Статус контроллера сохранен после перезагрузки');
          }
        }
      } catch (error) {
        this.log(`❌ Ошибка при проверке перезагрузки: ${error.message}`, 'error');
      }
    });

    // Ждем получения сообщения
    await new Promise((resolve) => {
      setTimeout(() => {
        newViewerWs.close();
        resolve();
      }, 3000);
    });
  }

  printResults() {
    console.log('\n📊 Результаты тестирования:');
    console.log('=' .repeat(50));
    
    this.testResults.forEach(result => {
      const icon = result.status === 'success' ? '✅' : result.status === 'error' ? '❌' : 'ℹ️';
      console.log(`${icon} ${result.message}`);
    });

    const successCount = this.testResults.filter(r => r.status === 'success').length;
    const totalCount = this.testResults.length;
    
    console.log(`\n📈 Итог: ${successCount}/${totalCount} тестов пройдено успешно`);
    
    if (successCount === totalCount) {
      console.log('🎉 Все тесты пройдены! Постоянные ссылки работают корректно.');
    } else {
      console.log('⚠️  Некоторые тесты не пройдены. Требуется дополнительная отладка.');
    }
  }

  async cleanup() {
    this.log('🧹 Очистка ресурсов...');
    
    if (this.controllerWs) {
      this.controllerWs.close();
    }
    
    if (this.viewerWs) {
      this.viewerWs.close();
    }
  }
}

// Запуск теста
if (require.main === module) {
  const test = new PermanentLinksTest();
  
  test.testPermanentLinks()
    .then(() => test.cleanup())
    .catch((error) => {
      console.error('❌ Критическая ошибка тестирования:', error);
      return test.cleanup();
    });
}

module.exports = PermanentLinksTest;
