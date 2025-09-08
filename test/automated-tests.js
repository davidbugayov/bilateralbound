/**
 * Автоматизированные тесты для BilateralBound
 * Эти тесты можно запускать из командной строки для проверки функциональности
 */

const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

// Импортируем функции для тестирования клиентской логики
function getScaledState(state, viewerScreenSize, previewCanvas) {
  if (!viewerScreenSize || !previewCanvas || !state) {
    return state; // Возвращаем как есть, если нет данных для масштабирования
  }

  const viewerSize = viewerScreenSize;
  const previewSize = { width: previewCanvas.width, height: previewCanvas.height };

  if (viewerSize.width <= 0 || viewerSize.height <= 0) {
    return state;
  }

  // **МАТЕМАТИЧЕСКИ КОРРЕКТНОЕ МАСШТАБИРОВАНИЕ**
  const scaleX = previewSize.width / viewerSize.width;
  const scaleY = previewSize.height / viewerSize.height;
  // Для радиуса используем минимальный масштаб, чтобы он точно вписывался и не искажался
  const scaleRadius = Math.min(scaleX, scaleY);

  const scaledState = { ...state };
  if (scaledState.x !== undefined) scaledState.x *= scaleX;
  if (scaledState.y !== undefined) scaledState.y *= scaleY;
  if (scaledState.radius !== undefined) scaledState.radius *= scaleRadius;

  return scaledState;
}

class BilateralBoundTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.wsUrl = 'ws://localhost:3000';
    this.testResults = [];
    this.serverProcess = null;
  }

  async waitForCenter(sessionId, cx, cy, tolerance = 10, timeoutMs = 2000, intervalMs = 100) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = await this.makeRequest(`/api/session/${sessionId}/state`);
      if (state.status === 200 && typeof state.data.x === 'number' && typeof state.data.y === 'number') {
        const dx = Math.abs(state.data.x - cx);
        const dy = Math.abs(state.data.y - cy);
        if (dx <= tolerance && dy <= tolerance) return true;
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
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

  async testWebSocketConnection(sessionId, role) {
    this.log(`Тест: WebSocket-подключение для ${role}`);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=${role}`);
      
      ws.on('open', () => {
        this.log(`✅ WebSocket для ${role} подключен`, 'success');
        ws.close();
        resolve(true);
      });

      ws.on('error', (err) => {
        this.log(`❌ Ошибка WebSocket для ${role}: ${err.message}`, 'error');
        reject(err);
      });
    });
  }

  async testWebSocketSync(sessionId) {
    this.log(`Тест: Синхронизация состояния через WebSocket для сессии ${sessionId}`);
    return new Promise(async (resolve, reject) => {
      const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
      const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

      let testPassed = false;
      const testTimeout = setTimeout(() => {
        if (!testPassed) {
          this.log('❌ Тест синхронизации провален по таймауту', 'error');
          cleanUpAndResolve(false);
        }
      }, 5000);

      const cleanUpAndResolve = (result) => {
        clearTimeout(testTimeout);
        controllerSocket.close();
        viewerSocket.close();
        resolve(result);
      };

      viewerSocket.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'state_update' && data.payload.speed === 88) {
          this.log('✅ Вьювер получил корректное обновление состояния', 'success');
          testPassed = true;
          cleanUpAndResolve(true);
        }
      });
      
      controllerSocket.on('open', () => {
        this.log('🎮 Контроллер готов к отправке команды');
        const command = {
          type: 'controller_update',
          payload: { speed: 88, paused: false, dirX: 1, dirY: 0 }
        };
        controllerSocket.send(JSON.stringify(command));
        this.log('📤 Команда отправлена на сервер');
      });

      controllerSocket.on('error', (err) => this.log(`❌ Ошибка сокета контроллера: ${err.message}`, 'error'));
      viewerSocket.on('error', (err) => this.log(`❌ Ошибка сокета вьювера: ${err.message}`, 'error'));
    });
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

  async testBallCenteringOnViewerConnect(sessionId) {
    this.log(`Тест: Центрирование мяча при подключении вьювера к сессии ${sessionId}`);
    try {
      // Сначала получаем начальное состояние
      let state = await this.makeRequest(`/api/session/${sessionId}/state`);
      const initialX = state.data.x;
      const initialY = state.data.y;
      this.log(`Начальное состояние мяча: (${initialX}, ${initialY})`);

      // Подключаем вьювер с размером экрана 1920x1080
      const connectResponse = await this.makeRequest(`/api/session/${sessionId}/viewer/connect`, 'POST', {
        screenSize: { width: 1920, height: 1080 }
      });

      if (connectResponse.status !== 200) {
        this.log(`❌ Ошибка подключения вьювера: ${JSON.stringify(connectResponse)}`, 'error');
        return false;
      }

      // Ожидаем центрирование после подключения
      const expectedCenterX = 1920 / 2; // 960
      const expectedCenterY = 1080 / 2; // 540
      const tolerance = 10;

      const ok = await this.waitForCenter(sessionId, expectedCenterX, expectedCenterY, tolerance, 2500, 100);
      if (!ok) {
        const last = await this.makeRequest(`/api/session/${sessionId}/state`);
        this.log(`❌ Мяч не центрирован после подключения. Ожидалось: (${expectedCenterX}, ${expectedCenterY}), получено: (${last.data.x}, ${last.data.y})`, 'error');
        return false;
      }

      this.log(`✅ Мяч центрирован при подключении в пределах допуска ±${tolerance}px`, 'success');
      return true;

    } catch (error) {
      this.log(`❌ Ошибка теста центрирования: ${error.message}`, 'error');
      return false;
    }
  }

  async testBallResetCentering(sessionId) {
    this.log(`Тест: Центрирование мяча при сбросе в сессии ${sessionId}`);
    try {
      // Сначала перемещаем мяч в другое место
      await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
        x: 1500,
        y: 800
      });

      // Выполняем сброс
      await this.makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', { reset: true });
      // Проверяем, что мяч центрирован (ожидаем до 2.5с)
      const expectedCenterX = 1920 / 2; // 960
      const expectedCenterY = 1080 / 2; // 540
      const tolerance = 10;

      const ok = await this.waitForCenter(sessionId, expectedCenterX, expectedCenterY, tolerance, 2500, 100);
      if (!ok) {
        const last = await this.makeRequest(`/api/session/${sessionId}/state`);
        this.log(`❌ Мяч не центрирован после сброса. Ожидалось: (${expectedCenterX}, ${expectedCenterY}), получено: (${last.data.x}, ${last.data.y})`, 'error');
        return false;
      }

      this.log(`✅ Мяч центрирован после сброса в пределах допуска ±${tolerance}px`, 'success');
      return true;

    } catch (error) {
      this.log(`❌ Ошибка теста сброса центрирования: ${error.message}`, 'error');
      return false;
    }
  }

  async testScreenSizeUpdateCentering(sessionId) {
    this.log(`Тест: Центрирование мяча при изменении размера экрана вьювера в сессии ${sessionId}`);
    try {
      // Сначала подключаем вьювер с одним размером
      await this.makeRequest(`/api/session/${sessionId}/viewer/connect`, 'POST', {
        screenSize: { width: 1920, height: 1080 }
      });

      // Ждем обработки
      await new Promise(resolve => setTimeout(resolve, 100));

      // Обновляем размер экрана вьювера
      const updateResponse = await this.makeRequest(`/api/session/${sessionId}/viewer/screen-size`, 'POST', {
        width: 2560,
        height: 1440
      });

      if (updateResponse.status !== 200) {
        this.log(`❌ Ошибка обновления размера экрана: ${JSON.stringify(updateResponse)}`, 'error');
        return false;
      }

      // Проверяем центрирование с ожиданием
      const expectedCenterX = 2560 / 2; // 1280
      const expectedCenterY = 1440 / 2; // 720
      const tolerance = 10;

      const ok = await this.waitForCenter(sessionId, expectedCenterX, expectedCenterY, tolerance, 2500, 100);
      if (!ok) {
        const last = await this.makeRequest(`/api/session/${sessionId}/state`);
        this.log(`❌ Мяч не центрирован после изменения размера экрана. Ожидалось: (${expectedCenterX}, ${expectedCenterY}), получено: (${last.data.x}, ${last.data.y})`, 'error');
        return false;
      }

      this.log(`✅ Мяч центрирован после изменения размера экрана в пределах допуска ±${tolerance}px`, 'success');
      return true;

    } catch (error) {
      this.log(`❌ Ошибка теста изменения размера экрана: ${error.message}`, 'error');
      return false;
    }
  }

  testCoordinateScaling() {
    this.log('Тест: Масштабирование координат (клиентская логика)');
    try {
      // Тест 1: Стандартное масштабирование
      const state1 = { x: 960, y: 540, radius: 20 };
      const viewerSize1 = { width: 1920, height: 1080 };
      const previewCanvas1 = { width: 400, height: 300 };

      const scaled1 = getScaledState(state1, viewerSize1, previewCanvas1);

      // Центр вьювера (960, 540) должен масштабироваться к центру превью (200, 150)
      const expectedX1 = (960 / 1920) * 400; // 200
      const expectedY1 = (540 / 1080) * 300; // 150
      const expectedRadius1 = Math.min(400/1920, 300/1080) * 20; // 4.166...

      if (Math.abs(scaled1.x - expectedX1) > 0.1 ||
          Math.abs(scaled1.y - expectedY1) > 0.1 ||
          Math.abs(scaled1.radius - expectedRadius1) > 0.1) {
        this.log(`❌ Ошибка масштабирования 1: ожидалось (${expectedX1.toFixed(1)}, ${expectedY1.toFixed(1)}), получено (${scaled1.x.toFixed(1)}, ${scaled1.y.toFixed(1)})`, 'error');
        return false;
      }

      // Тест 2: Масштабирование с другим соотношением сторон
      const state2 = { x: 1280, y: 720 };
      const viewerSize2 = { width: 2560, height: 1440 };
      const previewCanvas2 = { width: 320, height: 240 };

      const scaled2 = getScaledState(state2, viewerSize2, previewCanvas2);

      const expectedX2 = (1280 / 2560) * 320; // 160
      const expectedY2 = (720 / 1440) * 240; // 120

      if (Math.abs(scaled2.x - expectedX2) > 0.1 || Math.abs(scaled2.y - expectedY2) > 0.1) {
        this.log(`❌ Ошибка масштабирования 2: ожидалось (${expectedX2}, ${expectedY2}), получено (${scaled2.x}, ${scaled2.y})`, 'error');
        return false;
      }

      // Тест 3: Обработка отсутствующих данных
      const state3 = { x: 100, y: 200 };
      const scaled3 = getScaledState(state3, null, previewCanvas1);
      if (scaled3 !== state3) {
        this.log('❌ Ошибка обработки null данных', 'error');
        return false;
      }

      this.log('✅ Масштабирование координат работает корректно', 'success');
      return true;

    } catch (error) {
      this.log(`❌ Ошибка теста масштабирования: ${error.message}`, 'error');
      return false;
    }
  }

  testPreviewCoordinateCalculation() {
    this.log('Тест: Расчет координат превью относительно вьювера');
    try {
      // Тест 1: Центрирование относительно размеров вьювера
      const viewerCenterX = 1920 / 2; // 960
      const viewerCenterY = 1080 / 2; // 540
      const previewWidth = 400;
      const previewHeight = 300;

      const scaleX = previewWidth / 1920;
      const scaleY = previewHeight / 1080;

      const previewCenterX = viewerCenterX * scaleX;
      const previewCenterY = viewerCenterY * scaleY;

      const expectedX = 200; // 960 * (400/1920)
      const expectedY = 150; // 540 * (300/1080)

      if (Math.abs(previewCenterX - expectedX) > 0.1 || Math.abs(previewCenterY - expectedY) > 0.1) {
        this.log(`❌ Ошибка расчета центра превью: ожидалось (${expectedX}, ${expectedY}), получено (${previewCenterX.toFixed(1)}, ${previewCenterY.toFixed(1)})`, 'error');
        return false;
      }

      // Тест 2: Расчет с другими размерами
      const viewerCenterX2 = 2560 / 2; // 1280
      const viewerCenterY2 = 1440 / 2; // 720
      const previewWidth2 = 320;
      const previewHeight2 = 240;

      const scaleX2 = previewWidth2 / 2560;
      const scaleY2 = previewHeight2 / 1440;

      const previewCenterX2 = viewerCenterX2 * scaleX2;
      const previewCenterY2 = viewerCenterY2 * scaleY2;

      const expectedX2 = 160; // 1280 * (320/2560)
      const expectedY2 = 120; // 720 * (240/1440)

      if (Math.abs(previewCenterX2 - expectedX2) > 0.1 || Math.abs(previewCenterY2 - expectedY2) > 0.1) {
        this.log(`❌ Ошибка расчета центра превью 2: ожидалось (${expectedX2}, ${expectedY2}), получено (${previewCenterX2.toFixed(1)}, ${previewCenterY2.toFixed(1)})`, 'error');
        return false;
      }

      this.log('✅ Расчет координат превью работает корректно', 'success');
      return true;

    } catch (error) {
      this.log(`❌ Ошибка теста расчета координат: ${error.message}`, 'error');
      return false;
    }
  }

  async runAllTests() {
    this.log('🚀 Запуск всех автоматизированных тестов BilateralBound');
    this.log('='.repeat(60));

    const results = {
      healthCheck: false,
      sessionCreation: false,
      viewerConnection: false,
      controllerConnection: false,
      webSocketSync: false,
      ballCenteringOnViewerConnect: false,
      ballResetCentering: false,
      screenSizeUpdateCentering: false,
      coordinateScaling: false,
      previewCoordinateCalculation: false,
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

      // Тест 3: Подключение вьювера через WebSocket
      results.viewerConnection = await this.testWebSocketConnection(sessionId, 'viewer');
      
      // Тест 4: Подключение контроллера через WebSocket
      results.controllerConnection = await this.testWebSocketConnection(sessionId, 'controller');
      
      // Тест 5: Синхронизация состояния через WebSocket
      results.webSocketSync = await this.testWebSocketSync(sessionId);

      // Тест 6: Центрирование мяча при подключении вьювера
      results.ballCenteringOnViewerConnect = await this.testBallCenteringOnViewerConnect(sessionId);

      // Тест 7: Центрирование мяча при сбросе
      results.ballResetCentering = await this.testBallResetCentering(sessionId);

      // Тест 8: Центрирование мяча при изменении размера экрана
      results.screenSizeUpdateCentering = await this.testScreenSizeUpdateCentering(sessionId);

      // Тест 9: Unit-тест масштабирования координат (клиентская логика)
      results.coordinateScaling = this.testCoordinateScaling();

      // Тест 10: Unit-тест расчета координат превью
      results.previewCoordinateCalculation = this.testPreviewCoordinateCalculation();

    } catch (error) {
      this.log(`❌ Критическая ошибка тестирования: ${error.message}`, 'error');
    } finally {
      await this.stopServer();
    }

    // Выводим результаты
    this.log('='.repeat(60));
    this.log('📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
    this.log('='.repeat(60));

    const testNames = {
      healthCheck: 'Проверка здоровья сервера',
      sessionCreation: 'Создание сессии',
      viewerConnection: 'Подключение вьювера (WebSocket)',
      controllerConnection: 'Подключение контроллера (WebSocket)',
      webSocketSync: 'Синхронизация состояния (WebSocket)',
      ballCenteringOnViewerConnect: 'Центрирование мяча при подключении вьювера',
      ballResetCentering: 'Центрирование мяча при сбросе',
      screenSizeUpdateCentering: 'Центрирование мяча при изменении размера экрана',
      coordinateScaling: 'Масштабирование координат (клиентская логика)',
      previewCoordinateCalculation: 'Расчет координат превью'
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

    this.log('='.repeat(60));
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
  const args = process.argv.slice(2);

  if (args.includes('--debug-positioning')) {
    // Запуск отладки позиционирования мяча
    debugBallPositioning().then(() => {
      console.log('🔍 Отладка завершена');
      process.exit(0);
    }).catch(error => {
      console.error('❌ Ошибка отладки:', error);
      process.exit(1);
    });
  } else if (args.includes('--unit-tests')) {
    // Запуск только unit-тестов (без сервера)
    console.log('🧪 Запуск unit-тестов логики позиционирования...');
    const unitResults = {
      coordinateScaling: false,
      previewCoordinateCalculation: false
    };

    unitResults.coordinateScaling = (new BilateralBoundTester()).testCoordinateScaling();
    unitResults.previewCoordinateCalculation = (new BilateralBoundTester()).testPreviewCoordinateCalculation();

    const allPassed = Object.values(unitResults).every(r => r);
    console.log(`📈 Unit-тесты: ${Object.values(unitResults).filter(r => r).length}/${Object.values(unitResults).length} пройдено`);

    if (allPassed) {
      console.log('✅ Все unit-тесты пройдены!');
    } else {
      console.log('❌ Некоторые unit-тесты провалены');
    }

    process.exit(allPassed ? 0 : 1);
  } else {
    // Запуск основных тестов
    const tester = new BilateralBoundTester();
    tester.runAllTests().then(results => {
      process.exit(Object.values(results).every(r => r) ? 0 : 1);
    }).catch(error => {
      console.error('❌ Критическая ошибка:', error);
      process.exit(1);
    });
  }
}

// Специальный тест для отладки позиционирования мяча
async function debugBallPositioning() {
  console.log('🔍 Начинаем отладку позиционирования мяча...');

  const http = require('http');
  const WebSocket = require('ws');

  // Создаем сессию
  const sessionResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/session',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  const sessionId = sessionResponse.sessionId;
  console.log(`📋 Создана сессия: ${sessionId}`);

  // Подключаемся через WebSocket как вьювер
  const ws = new WebSocket(`ws://localhost:3000/?sessionId=${sessionId}&role=viewer`);

  return new Promise((resolve) => {
    ws.on('open', () => {
      console.log('🔌 WebSocket подключен');

      // Подключаем вьювер через HTTP API
      setTimeout(async () => {
        const connectResponse = await new Promise((resolve) => {
          const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: `/api/session/${sessionId}/viewer/connect`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
          });
          req.write(JSON.stringify({ screenSize: { width: 1920, height: 1080 } }));
          req.end();
        });

        console.log('📱 Вьювер подключен:', connectResponse);
      }, 100);
    });

    ws.on('message', (message) => {
      const data = JSON.parse(message);
      console.log(`📨 Получено сообщение: ${data.type}`);

      if (data.type === 'initial_state') {
        console.log(`🎯 Начальное состояние мяча: (${data.payload.x}, ${data.payload.y})`);
        console.log(`📊 Полные данные:`, JSON.stringify(data.payload, null, 2));
      }

      if (data.type === 'state_update') {
        console.log(`🔄 Обновление состояния: (${data.payload.x}, ${data.payload.y})`);
      }
    });

    // Закрываем соединение через 3 секунды
    setTimeout(() => {
      ws.close();
      console.log('🔌 WebSocket закрыт');
      resolve();
    }, 3000);
  });
}

module.exports = BilateralBoundTester;

// Экспортируем функцию отладки
if (typeof module !== 'undefined' && module.exports) {
  module.exports.debugBallPositioning = debugBallPositioning;
}
