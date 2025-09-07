/**
 * Автоматизированные тесты для BilateralBound
 * Эти тесты можно запускать из командной строки для проверки функциональности
 */

const http = require('http');
const { spawn } = require('child_process');

class BilateralBoundTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.testResults = [];
    this.serverProcess = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        }
      };

      if (data) {
        const jsonData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.on('error', reject);
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  async startServer() {
    this.log('Запуск сервера...');
    
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname + '/..',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let serverReady = false;
      const timeout = setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Сервер не запустился за 10 секунд'));
        }
      }, 10000);

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Server listening')) {
          serverReady = true;
          clearTimeout(timeout);
          this.log('Сервер запущен успешно', 'success');
          resolve();
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('EADDRINUSE')) {
          this.log('Порт 3000 уже занят, используем существующий сервер', 'warning');
          serverReady = true;
          clearTimeout(timeout);
          resolve();
        } else {
          this.log(`Ошибка сервера: ${error}`, 'error');
        }
      });

      this.serverProcess.on('error', (error) => {
        this.log(`Ошибка запуска сервера: ${error.message}`, 'error');
        reject(error);
      });
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.log('Остановка сервера...');
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  async testHealthCheck() {
    this.log('Тест: Проверка здоровья сервера');
    try {
      const response = await this.makeRequest('/health');
      if (response.status === 200 && response.data.status === 'ok') {
        this.log('✅ Сервер работает корректно', 'success');
        return true;
      } else {
        this.log(`❌ Неожиданный ответ сервера: ${JSON.stringify(response)}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Ошибка подключения к серверу: ${error.message}`, 'error');
      return false;
    }
  }

  async testSessionCreation() {
    this.log('Тест: Создание сессии');
    try {
      const response = await this.makeRequest('/api/session', 'POST');
      if (response.status === 200 && response.data.sessionId) {
        this.log(`✅ Сессия создана: ${response.data.sessionId}`, 'success');
        return response.data.sessionId;
      } else {
        this.log(`❌ Ошибка создания сессии: ${JSON.stringify(response)}`, 'error');
        return null;
      }
    } catch (error) {
      this.log(`❌ Ошибка создания сессии: ${error.message}`, 'error');
      return null;
    }
  }

  async testSessionState(sessionId) {
    this.log(`Тест: Получение состояния сессии ${sessionId}`);
    try {
      const response = await this.makeRequest(`/api/session/${sessionId}/state`);
      if (response.status === 200 && response.data.x !== undefined) {
        this.log(`✅ Состояние сессии получено: x=${response.data.x}, y=${response.data.y}`, 'success');
        return response.data;
      } else {
        this.log(`❌ Ошибка получения состояния: ${JSON.stringify(response)}`, 'error');
        return null;
      }
    } catch (error) {
      this.log(`❌ Ошибка получения состояния: ${error.message}`, 'error');
      return null;
    }
  }

  async testBallMovement(sessionId) {
    this.log(`Тест: Движение мяча в сессии ${sessionId}`);
    try {
      // Запускаем мяч
      const startResponse = await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
        resume: true,
        dirX: 1,
        dirY: 0,
        speedScalar: 40
      });

      if (startResponse.status !== 200) {
        this.log(`❌ Ошибка запуска мяча: ${JSON.stringify(startResponse)}`, 'error');
        return false;
      }

      // Ждем немного
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Проверяем, что мяч движется
      const state1 = await this.makeRequest(`/api/session/${sessionId}/state`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const state2 = await this.makeRequest(`/api/session/${sessionId}/state`);

      if (state1.status === 200 && state2.status === 200) {
        const pos1 = { x: state1.data.x, y: state1.data.y };
        const pos2 = { x: state2.data.x, y: state2.data.y };
        const distance = Math.sqrt((pos2.x - pos1.x) ** 2 + (pos2.y - pos1.y) ** 2);
        
        if (distance > 0) {
          this.log(`✅ Мяч движется: расстояние ${distance.toFixed(2)} пикселей`, 'success');
          return true;
        } else {
          this.log(`❌ Мяч не движется: позиция не изменилась`, 'error');
          return false;
        }
      } else {
        this.log(`❌ Ошибка получения состояния для проверки движения`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Ошибка теста движения: ${error.message}`, 'error');
      return false;
    }
  }

  async testBallBouncing(sessionId) {
    this.log(`Тест: Отскоки мяча в сессии ${sessionId}`);
    try {
      // Запускаем мяч с высокой скоростью
      await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
        resume: true,
        dirX: 1,
        dirY: 0,
        speedScalar: 80
      });

      // Ждем и проверяем отскоки
      let bounceCount = 0;
      let lastX = null;
      let directionChanges = 0;

      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const state = await this.makeRequest(`/api/session/${sessionId}/state`);
        
        if (state.status === 200) {
          const currentX = state.data.x;
          if (lastX !== null) {
            // Проверяем изменение направления (отскок)
            if ((lastX < 50 && currentX > lastX) || (lastX > 750 && currentX < lastX)) {
              directionChanges++;
              bounceCount++;
            }
          }
          lastX = currentX;
        }
      }

      if (bounceCount > 0) {
        this.log(`✅ Отскоки работают: ${bounceCount} отскоков обнаружено`, 'success');
        return true;
      } else {
        this.log(`❌ Отскоки не работают: ${bounceCount} отскоков`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Ошибка теста отскоков: ${error.message}`, 'error');
      return false;
    }
  }

  async testViewerConnection(sessionId) {
    this.log(`Тест: Подключение вьювера к сессии ${sessionId}`);
    try {
      const response = await this.makeRequest(`/api/session/${sessionId}/viewer/connect`, 'POST', {
        screenSize: { width: 1920, height: 1080 }
      });

      if (response.status === 200) {
        this.log('✅ Вьювер подключен успешно', 'success');
        
        // Проверяем, что размер экрана установлен
        const state = await this.makeRequest(`/api/session/${sessionId}/state`);
        if (state.status === 200 && state.data.viewerScreenSize) {
          this.log(`✅ Размер экрана вьювера установлен: ${state.data.viewerScreenSize.width}x${state.data.viewerScreenSize.height}`, 'success');
          return true;
        } else {
          this.log('❌ Размер экрана вьювера не установлен', 'error');
          return false;
        }
      } else {
        this.log(`❌ Ошибка подключения вьювера: ${JSON.stringify(response)}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Ошибка подключения вьювера: ${error.message}`, 'error');
      return false;
    }
  }

  async testControllerConnection(sessionId) {
    this.log(`Тест: Подключение контроллера к сессии ${sessionId}`);
    try {
      const response = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {});

      if (response.status === 200) {
        this.log('✅ Контроллер подключен успешно', 'success');
        return true;
      } else {
        this.log(`❌ Ошибка подключения контроллера: ${JSON.stringify(response)}`, 'error');
        return false;
      }
    } catch (error) {
      this.log(`❌ Ошибка подключения контроллера: ${error.message}`, 'error');
      return false;
    }
  }

  async testBallControl(sessionId) {
    this.log(`Тест: Управление мячом в сессии ${sessionId}`);
    try {
      // Тест паузы
      await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', { pause: true });
      let state = await this.makeRequest(`/api/session/${sessionId}/state`);
      if (state.data.paused !== true) {
        this.log('❌ Пауза не работает', 'error');
        return false;
      }
      this.log('✅ Пауза работает', 'success');

      // Тест сброса
      await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', { reset: true });
      state = await this.makeRequest(`/api/session/${sessionId}/state`);
      if (state.data.vx !== 0 || state.data.vy !== 0) {
        this.log('❌ Сброс не работает', 'error');
        return false;
      }
      this.log('✅ Сброс работает', 'success');

      // Тест изменения направления
      await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
        resume: true,
        dirX: 0,
        dirY: 1,
        speedScalar: 40
      });
      state = await this.makeRequest(`/api/session/${sessionId}/state`);
      if (state.data.vy === 0) {
        this.log('❌ Изменение направления не работает', 'error');
        return false;
      }
      this.log('✅ Изменение направления работает', 'success');

      return true;
    } catch (error) {
      this.log(`❌ Ошибка теста управления: ${error.message}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    this.log('🚀 Запуск всех автоматизированных тестов BilateralBound');
    this.log('=' * 60);

    const results = {
      healthCheck: false,
      sessionCreation: false,
      sessionState: false,
      ballMovement: false,
      ballBouncing: false,
      viewerConnection: false,
      controllerConnection: false,
      ballControl: false
    };

    try {
      // Запускаем сервер
      await this.startServer();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем запуска

      // Тест 1: Проверка здоровья сервера
      results.healthCheck = await this.testHealthCheck();

      if (!results.healthCheck) {
        this.log('❌ Сервер не работает, пропускаем остальные тесты', 'error');
        return results;
      }

      // Тест 2: Создание сессии
      const sessionId = await this.testSessionCreation();
      results.sessionCreation = sessionId !== null;

      if (!sessionId) {
        this.log('❌ Не удалось создать сессию, пропускаем остальные тесты', 'error');
        return results;
      }

      // Тест 3: Получение состояния сессии
      const initialState = await this.testSessionState(sessionId);
      results.sessionState = initialState !== null;

      // Тест 4: Подключение вьювера
      results.viewerConnection = await this.testViewerConnection(sessionId);

      // Тест 5: Подключение контроллера
      results.controllerConnection = await this.testControllerConnection(sessionId);

      // Тест 6: Управление мячом
      results.ballControl = await this.testBallControl(sessionId);

      // Тест 7: Движение мяча
      results.ballMovement = await this.testBallMovement(sessionId);

      // Тест 8: Отскоки мяча
      results.ballBouncing = await this.testBallBouncing(sessionId);

    } catch (error) {
      this.log(`❌ Критическая ошибка тестирования: ${error.message}`, 'error');
    } finally {
      await this.stopServer();
    }

    // Выводим результаты
    this.log('=' * 60);
    this.log('📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
    this.log('=' * 60);

    const testNames = {
      healthCheck: 'Проверка здоровья сервера',
      sessionCreation: 'Создание сессии',
      sessionState: 'Получение состояния сессии',
      ballMovement: 'Движение мяча',
      ballBouncing: 'Отскоки мяча',
      viewerConnection: 'Подключение вьювера',
      controllerConnection: 'Подключение контроллера',
      ballControl: 'Управление мячом'
    };

    let passedTests = 0;
    let totalTests = 0;

    for (const [testKey, testName] of Object.entries(testNames)) {
      const result = results[testKey];
      const status = result ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН';
      this.log(`${status} - ${testName}`);
      if (result) passedTests++;
      totalTests++;
    }

    this.log('=' * 60);
    this.log(`📈 ИТОГО: ${passedTests}/${totalTests} тестов пройдено`);
    
    if (passedTests === totalTests) {
      this.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!', 'success');
    } else {
      this.log(`⚠️ ${totalTests - passedTests} тестов провалено`, 'warning');
    }

    return results;
  }
}

// Запуск тестов если файл вызван напрямую
if (require.main === module) {
  const tester = new BilateralBoundTester();
  tester.runAllTests().then(results => {
    process.exit(Object.values(results).every(r => r) ? 0 : 1);
  }).catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
}

module.exports = BilateralBoundTester;
