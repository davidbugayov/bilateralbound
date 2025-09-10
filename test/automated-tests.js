/**
 * Автоматизированные тесты для BilateralBound (восстановлено)
 */

const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

class Tester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.wsUrl = 'ws://localhost:3000';
    this.serverProcess = null;
  }

  log(msg, type = 'info') {
    const ts = new Date().toISOString();
    const p = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${p} [${ts}] ${msg}`);
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname + '/..',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let ready = false;
      const timeout = setTimeout(() => {
        if (!ready) reject(new Error('Server did not start in time'));
      }, 10000);

      this.serverProcess.stdout.on('data', (d) => {
        const s = d.toString();
        if (s.includes('Server listening')) {
          ready = true; clearTimeout(timeout); resolve();
        }
      });
      this.serverProcess.stderr.on('data', (d) => {
        const s = d.toString();
        if (s.includes('EADDRINUSE')) { ready = true; clearTimeout(timeout); resolve(); }
      });
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  async req(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: body ? JSON.parse(body) : {} }); }
          catch { resolve({ status: res.statusCode, data: {} }); }
        });
      });
      req.on('error', reject);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  async health() {
    const r = await this.req('/health');
    return r.status === 200 && r.data.status === 'ok';
  }

  async createSession() {
    const r = await this.req('/api/session', 'POST');
    if (r.status === 200 && r.data.sessionId) return r.data.sessionId;
    return null;
  }

  async testCenteringOnViewerConnect() {
    this.log('Тест: Центрирование на подключение вьювера (viewer+preview)');
    const sessionId = await this.createSession();
    if (!sessionId) { this.log('Не удалось создать сессию', 'error'); return false; }

    // 1) Подключаем контроллер по WS, слушаем initial_state после того как подключится вьювер
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);

    const resultPromise = new Promise(async (resolve) => {
      let gotInitial = false;
      const timeout = setTimeout(() => { if (!gotInitial) resolve(false); }, 6000);

      controllerSocket.on('message', (m) => {
        const msg = JSON.parse(m);
        if (msg.type === 'initial_state') {
          gotInitial = true;
          const st = msg.payload;
          const expX = 1920/2, expY = 1080/2;
          const ok = Math.abs(st.x - expX) < 1 && Math.abs(st.y - expY) < 1;
          this.log(ok ? '✅ initial_state центрирован' : `❌ initial_state не по центру: (${st.x}, ${st.y})`, ok ? 'success' : 'error');
          clearTimeout(timeout);
          resolve(ok);
          controllerSocket.close();
        }
      });

      // 2) Через небольшой интервал подключаем вьювера через HTTP и задаём размер
      setTimeout(async () => {
        await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
      }, 200);
    });

    const ok = await resultPromise;
    if (!ok) return false;

    // 3) Проверяем, что состояние через REST тоже центрировано (для вьювера)
    const stateR = await this.req(`/api/session/${sessionId}/state`);
    if (stateR.status !== 200) return false;
    const s = stateR.data;
    const expX = 1920/2, expY = 1080/2;
    const centered = Math.abs(s.x - expX) < 1 && Math.abs(s.y - expY) < 1;
    this.log(centered ? '✅ REST-состояние центрировано' : `❌ REST-состояние не по центру: (${s.x}, ${s.y})`, centered ? 'success' : 'error');
    return centered;
  }

  async testNoInitialStateBeforeViewerSize() {
    this.log('Тест: Нет initial_state до установки размера вьювера');
    const sessionId = await this.createSession();
    if (!sessionId) { this.log('Не удалось создать сессию', 'error'); return false; }

    // Подключаем контроллер и убеждаемся, что initial_state не приходит до viewer/connect
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);

    let gotInitial = false;
    const gotUnexpected = await new Promise((resolve) => {
      controllerSocket.on('message', (m) => {
        const msg = JSON.parse(m);
        if (msg.type === 'initial_state') gotInitial = true;
      });
      setTimeout(() => resolve(gotInitial), 500); // 0.5s до подключения вьювера
    });

    if (gotUnexpected) {
      this.log('❌ initial_state пришёл до viewer.connect', 'error');
      controllerSocket.close();
      return false;
    } else {
      this.log('✅ initial_state не пришёл до viewer.connect', 'success');
    }

    // Теперь подключаем вьювер с размером, ожидаем initial_state по центру
    const waitInitial = new Promise((resolve) => {
      const timeout = setTimeout(() => { resolve(false); controllerSocket.close(); }, 3000);
      controllerSocket.on('message', (m) => {
        const msg = JSON.parse(m);
        if (msg.type === 'initial_state') {
          const st = msg.payload;
          const expX = 1920/2, expY = 1080/2;
          const ok = Math.abs(st.x - expX) < 1 && Math.abs(st.y - expY) < 1;
          clearTimeout(timeout);
          controllerSocket.close();
          resolve(ok);
        }
      });
    });

    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });

    const ok = await waitInitial;
    this.log(ok ? '✅ initial_state пришёл после viewer.connect и по центру' : '❌ initial_state не центрирован/не пришёл', ok ? 'success' : 'error');
    return ok;
  }

  async testStartMovement() {
    this.log('Тест: Команда старта движения');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    // 2. Подключаем вьювер через HTTP
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
    await new Promise(r => setTimeout(r, 100));

    // 3. Проверяем начальное состояние через REST API (надежнее)
    const initialStateResponse = await this.req(`/api/session/${sessionId}/state`);
    if (initialStateResponse.status !== 200) {
      this.log('❌ Не удалось получить начальное состояние', 'error');
      controllerSocket.close();
      viewerSocket.close();
      return false;
    }

    const initialState = initialStateResponse.data;
    const initiallyPaused = initialState.paused === true;
    this.log(initiallyPaused ? '✅ Игра изначально на паузе' : '❌ Игра не на паузе изначально', initiallyPaused ? 'success' : 'error');

    // 4. Отправляем команду старта движения
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 0, speed: 40 } }));

    // 5. Ждем обновления состояния через REST API
    await new Promise(r => setTimeout(r, 200)); // Даем время на обработку команды
    const updatedStateResponse = await this.req(`/api/session/${sessionId}/state`);

    if (updatedStateResponse.status !== 200) {
      this.log('❌ Не удалось получить обновленное состояние', 'error');
      controllerSocket.close();
      viewerSocket.close();
      return false;
    }

    const updatedState = updatedStateResponse.data;
    const movementStarted = updatedState.paused === false;
    this.log(movementStarted ? '✅ Движение запущено' : '❌ Движение не запустилось', movementStarted ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return initiallyPaused && movementStarted;
  }

  async testStopMovement() {
    this.log('Тест: Команда стоп движения');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    // 2. Подключаем вьювер через HTTP
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
    await new Promise(r => setTimeout(r, 100));

    // 3. Запускаем движение через REST API
    await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false, dirX: 1, dirY: 0, speed: 40 });
    await new Promise(r => setTimeout(r, 200));

    // Проверяем что движение запущено
    const startedStateResponse = await this.req(`/api/session/${sessionId}/state`);
    if (startedStateResponse.status !== 200) {
      this.log('❌ Не удалось получить состояние после запуска', 'error');
      controllerSocket.close();
      viewerSocket.close();
      return false;
    }

    const startedState = startedStateResponse.data;
    const movementWasStarted = startedState.paused === false;
    this.log(movementWasStarted ? '✅ Движение было запущено' : '❌ Движение не было запущено', movementWasStarted ? 'success' : 'error');

    // 4. Отправляем команду стоп
    await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { paused: true, dirX: 0, dirY: 0, speed: 0 });
    await new Promise(r => setTimeout(r, 200));

    // 5. Проверяем состояние через REST API
    const stoppedStateResponse = await this.req(`/api/session/${sessionId}/state`);
    if (stoppedStateResponse.status !== 200) {
      this.log('❌ Не удалось получить состояние после остановки', 'error');
      controllerSocket.close();
      viewerSocket.close();
      return false;
    }

    const stoppedState = stoppedStateResponse.data;
    const movementStopped = stoppedState.paused === true;
    this.log(movementStopped ? '✅ Движение остановлено' : '❌ Движение не остановилось', movementStopped ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return movementWasStarted && movementStopped;
  }

  async testSpeedChange() {
    this.log('Тест: Изменение скорости');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    // 2. Подключаем вьювер через HTTP
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
    await new Promise(r => setTimeout(r, 100));

    // 3. Запускаем движение с начальной скоростью
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 0, speed: 20 } }));

    // Ждем немного
    await new Promise(r => setTimeout(r, 200));

    // 4. Изменяем скорость
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 0, speed: 80 } }));

    // 5. Ждем обновления состояния
    const stateUpdatePromise = new Promise((resolve) => {
      viewerSocket.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'state_update') {
          resolve(data.payload);
        }
      });
    });

    const updatedState = await stateUpdatePromise;
    const speedChanged = updatedState.speed === 80;
    this.log(speedChanged ? '✅ Скорость изменена' : `❌ Скорость не изменилась: ${updatedState.speed}`, speedChanged ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return speedChanged;
  }

  async testResetCommand() {
    this.log('Тест: Команда Reset (центр)');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    // 2. Подключаем вьювер через HTTP
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
    await new Promise(r => setTimeout(r, 100));

    // 3. Запускаем движение, чтобы мяч ушел из центра
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 1, speed: 40 } }));
    await new Promise(r => setTimeout(r, 500));

    // 4. Получаем текущее положение мяча
    const getCurrentPosition = () => {
      return new Promise((resolve) => {
        viewerSocket.on('message', (message) => {
          const data = JSON.parse(message);
          if (data.type === 'state_update') {
            resolve(data.payload);
          }
        });
      });
    };

    const currentPosition = await getCurrentPosition();
    const wasNotCentered = Math.abs(currentPosition.x - 960) > 10 || Math.abs(currentPosition.y - 540) > 10;
    this.log(wasNotCentered ? '✅ Мяч ушел из центра' : '❌ Мяч остался в центре', wasNotCentered ? 'success' : 'error');

    // 5. Отправляем команду reset
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { reset: true } }));

    // 6. Ждем обновления состояния
    const resetPosition = await getCurrentPosition();
    const isCentered = Math.abs(resetPosition.x - 960) < 5 && Math.abs(resetPosition.y - 540) < 5;
    this.log(isCentered ? '✅ Мяч вернулся в центр' : `❌ Мяч не в центре: (${resetPosition.x}, ${resetPosition.y})`, isCentered ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return wasNotCentered && isCentered;
  }

  async testDirectionChange() {
    this.log('Тест: Изменение направления');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    // 2. Подключаем вьювер через HTTP
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
    await new Promise(r => setTimeout(r, 100));

    // 3. Запускаем движение вправо
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 0, speed: 40 } }));
    await new Promise(r => setTimeout(r, 300));

    // 4. Получаем позицию после движения вправо
    const getPosition = () => {
      return new Promise((resolve) => {
        viewerSocket.on('message', (message) => {
          const data = JSON.parse(message);
          if (data.type === 'state_update') {
            resolve(data.payload);
          }
        });
      });
    };

    const positionAfterRight = await getPosition();
    const movedRight = positionAfterRight.x > 960;

    // 5. Меняем направление на лево
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: -1, dirY: 0, speed: 40 } }));
    await new Promise(r => setTimeout(r, 300));

    // 6. Получаем позицию после движения влево
    const positionAfterLeft = await getPosition();
    const movedLeft = positionAfterLeft.x < positionAfterRight.x;

    this.log(movedRight ? '✅ Мяч двигался вправо' : '❌ Мяч не двигался вправо', movedRight ? 'success' : 'error');
    this.log(movedLeft ? '✅ Направление изменилось на лево' : '❌ Направление не изменилось', movedLeft ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return movedRight && movedLeft;
  }

  async testNegativeInput() {
    this.log('Тест: Негативные входные данные');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Тест с отрицательными значениями
    const negativeResult = await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', {
      screenSize: { width: -100, height: -200 }
    });
    const handlesNegative = negativeResult.status === 400 || negativeResult.status === 200; // 400 - отклонено, 200 - обработано корректно

    // 2. Тест с нулевыми значениями
    const zeroResult = await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', {
      screenSize: { width: 0, height: 0 }
    });
    const handlesZero = zeroResult.status === 400 || zeroResult.status === 200;

    // 3. Тест с очень большими значениями
    const largeResult = await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', {
      screenSize: { width: 999999, height: 999999 }
    });
    const handlesLarge = largeResult.status === 200; // Должно обработать

    // 4. Тест с некорректным JSON
    const invalidResult = await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', {
      invalidField: 'test'
    });
    const handlesInvalid = invalidResult.status === 400 || invalidResult.status === 200;

    this.log(handlesNegative ? '✅ Отрицательные значения обработаны' : '❌ Отрицательные значения не обработаны', handlesNegative ? 'success' : 'error');
    this.log(handlesZero ? '✅ Нулевые значения обработаны' : '❌ Нулевые значения не обработаны', handlesZero ? 'success' : 'error');
    this.log(handlesLarge ? '✅ Большие значения обработаны' : '❌ Большие значения не обработаны', handlesLarge ? 'success' : 'error');
    this.log(handlesInvalid ? '✅ Некорректный JSON обработан' : '❌ Некорректный JSON не обработан', handlesInvalid ? 'success' : 'error');

    return handlesNegative && handlesZero && handlesLarge && handlesInvalid;
  }

  async testWebSocketReconnect() {
    this.log('Тест: Переподключение WebSocket после обрыва');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем первоначальные соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    let viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
      new Promise(resolve => controllerSocket.on('open', resolve)),
      new Promise(resolve => viewerSocket.on('open', resolve))
    ]);
    this.log('✅ Первичные сокеты подключены');

    // 2. Рвем соединение вьювера
    viewerSocket.close(1000, 'Simulated disconnect');
    this.log('ℹ️ Соединение вьювера разорвано для теста');
    await new Promise(r => setTimeout(r, 500)); // Даем серверу время обработать отключение

    // 3. Переподключаем вьювер
    viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);
    await new Promise(resolve => viewerSocket.on('open', resolve));
    this.log('✅ Вьювер переподключен');

    // 4. Начинаем слушать обновления на новом сокете
    const updatePromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null); // Если сообщение не пришло за 2 секунды, считаем тест проваленным
      }, 2000);

      viewerSocket.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.type === 'state_update' && data.payload.speed === 50) {
          clearTimeout(timeout);
          resolve(data.payload);
        }
      });
    });

    // 5. Отправляем команду с контроллера, чтобы вызвать обновление
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 800, height: 600 } });
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 0, speed: 50 } }));

    // 6. Ждем обновления
    const updatedState = await updatePromise;
    const updateReceived = updatedState && updatedState.speed === 50;
    this.log(updateReceived ? '✅ Обновление получено после переподключения' : '❌ Обновление не пришло', updateReceived ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return updateReceived;
  }

  async testThrottlingPerformance() {
    this.log('Тест: Производительность и троттлинг команд');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1024, height: 768 } });

    let updatesReceived = 0;
    viewerSocket.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'state_update') {
        updatesReceived++;
      }
    });

    const commandsToSend = 50;
    const duration = 1000; // 1 second
    this.log(`ℹ️ Отправка ${commandsToSend} команд за ${duration} мс...`);

    const sendInterval = setInterval(() => {
      controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: Math.random(), dirY: Math.random(), speed: 40 } }));
    }, duration / commandsToSend);

    await new Promise(r => setTimeout(r, duration + 500)); // Ждем завершения отправки + буфер
    clearInterval(sendInterval);

    // Главное - что сервер не упал и отвечает на запросы
    const healthCheckPassed = await this.health();
    this.log(healthCheckPassed ? '✅ Сервер остался в рабочем состоянии после нагрузки' : '❌ Сервер не отвечает после нагрузки', healthCheckPassed ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return healthCheckPassed;
  }

  async testScreenSizeChangeStability() {
    this.log('Тест: Стабильность при изменении размера экрана');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    // 1. Устанавливаем начальный размер экрана
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1280, height: 720 } });
    await new Promise(r => setTimeout(r, 200));

    // 2. Запускаем движение с определенными параметрами
    await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { 
      paused: false, 
      dirX: 1, 
      dirY: 0, 
      speed: 50 
    });
    await new Promise(r => setTimeout(r, 300));

    // 3. Получаем состояние до изменения размера
    const stateBefore = await this.req(`/api/session/${sessionId}/state`);
    if (stateBefore.status !== 200) {
      this.log('❌ Не удалось получить состояние до изменения размера', 'error');
      controllerSocket.close();
      viewerSocket.close();
      return false;
    }

    const beforeState = stateBefore.data;
    this.log(`ℹ️ Состояние до изменения: speed=${beforeState.speed}, dirX=${beforeState.vx}, dirY=${beforeState.vy}`);

    // 4. Изменяем размер экрана
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });
    await new Promise(r => setTimeout(r, 300));

    // 5. Получаем состояние после изменения размера
    const stateAfter = await this.req(`/api/session/${sessionId}/state`);
    if (stateAfter.status !== 200) {
      this.log('❌ Не удалось получить состояние после изменения размера', 'error');
      controllerSocket.close();
      viewerSocket.close();
      return false;
    }

    const afterState = stateAfter.data;

    // 6. Проверяем, что скорость не изменилась
    const speedUnchanged = afterState.speed === beforeState.speed;
    this.log(speedUnchanged ? '✅ Скорость не изменилась' : `❌ Скорость изменилась: ${beforeState.speed} -> ${afterState.speed}`, speedUnchanged ? 'success' : 'error');

    // 7. Проверяем, что направление не изменилось (с учетом нормализации)
    const beforeDirX = beforeState.vx > 0 ? 1 : beforeState.vx < 0 ? -1 : 0;
    const beforeDirY = beforeState.vy > 0 ? 1 : beforeState.vy < 0 ? -1 : 0;
    const afterDirX = afterState.vx > 0 ? 1 : afterState.vx < 0 ? -1 : 0;
    const afterDirY = afterState.vy > 0 ? 1 : afterState.vy < 0 ? -1 : 0;
    
    const directionUnchanged = (beforeDirX === afterDirX) && (beforeDirY === afterDirY);
    this.log(directionUnchanged ? '✅ Направление не изменилось' : `❌ Направление изменилось: (${beforeDirX},${beforeDirY}) -> (${afterDirX},${afterDirY})`, directionUnchanged ? 'success' : 'error');

    // 8. Проверяем, что игра продолжает работать (не на паузе)
    const gameStillRunning = afterState.paused === false;
    this.log(gameStillRunning ? '✅ Игра продолжает работать' : '❌ Игра остановилась', gameStillRunning ? 'success' : 'error');

    // 9. Тестируем старт/стоп после изменения размера
    await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { paused: true });
    await new Promise(r => setTimeout(r, 200));
    
    const stoppedState = await this.req(`/api/session/${sessionId}/state`);
    const gameStopped = stoppedState.data.paused === true;
    this.log(gameStopped ? '✅ Игра остановилась после команды стоп' : '❌ Игра не остановилась', gameStopped ? 'success' : 'error');

    await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false });
    await new Promise(r => setTimeout(r, 200));
    
    const startedState = await this.req(`/api/session/${sessionId}/state`);
    const gameStarted = startedState.data.paused === false;
    this.log(gameStarted ? '✅ Игра запустилась после команды старт' : '❌ Игра не запустилась', gameStarted ? 'success' : 'error');

    // 10. Тестируем команду "Центр"
    await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { reset: true });
    await new Promise(r => setTimeout(r, 300));
    
    const centeredState = await this.req(`/api/session/${sessionId}/state`);
    const isCentered = Math.abs(centeredState.data.x - 960) < 10 && Math.abs(centeredState.data.y - 540) < 10;
    this.log(isCentered ? '✅ Мяч вернулся в центр' : `❌ Мяч не в центре: (${centeredState.data.x}, ${centeredState.data.y})`, isCentered ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return speedUnchanged && directionUnchanged && gameStillRunning && gameStopped && gameStarted && isCentered;
  }

  async testMovementStateUpdates() {
    this.log('Тест: Состояние движения содержит корректные обновления');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    // 1. Устанавливаем соединения
    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    // Ждем, пока ОБА сокета откроются, чтобы избежать гонки состояний
    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);
    this.log('Sockets connected');

    // 2. ЗАРАНЕЕ начинаем слушать обновления от вьювера
    const updatesPromise = new Promise((resolve) => {
        const receivedUpdates = [];
        viewerSocket.on('message', (message) => {
            const data = JSON.parse(message);
            if (data.type === 'state_update') {
                receivedUpdates.push(data.payload);
                // Как только набрали достаточно обновлений, завершаем promise
                if (receivedUpdates.length >= 3) {
                    resolve(receivedUpdates);
                }
            }
        });
    });

    // 3. Подключаем вьювер через HTTP, чтобы задать размер мира
    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1920, height: 1080 } });

    // Небольшая пауза, чтобы сервер гарантированно обработал HTTP запрос перед WebSocket командой
    await new Promise(r => setTimeout(r, 100));

    // 4. Отправляем команду на запуск движения
    controllerSocket.send(JSON.stringify({ type: 'controller_update', payload: { paused: false, dirX: 1, dirY: 0, speed: 40 } }));

    // 5. Ждем, пока промис с обновлениями зарезолвится (или пока не сработает глобальный таймаут)
    const updates = await updatesPromise;

    // 6. Проверяем результат
    const hasMovement = updates.length > 1 && updates[updates.length - 1].x !== updates[0].x;
    const sizePresent = updates.every(u => u.viewerScreenSize && u.viewerScreenSize.width > 0);

    this.log(hasMovement ? '✅ Имеются изменения координат (движение есть)' : '❌ Координаты не меняются', hasMovement ? 'success' : 'error');
    this.log(sizePresent ? '✅ viewerScreenSize присутствует в апдейтах' : '❌ viewerScreenSize отсутствует', sizePresent ? 'success' : 'error');

    controllerSocket.close();
    viewerSocket.close();

    return hasMovement && sizePresent;
  }

  async testAllControllers() {
    this.log('Тест: Проверка всех контроллеров в системе');
    const sessionId = await this.createSession();
    if (!sessionId) {
      this.log('Не удалось создать сессию', 'error');
      return false;
    }

    const controllerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=controller`);
    const viewerSocket = new WebSocket(`${this.wsUrl}/?sessionId=${sessionId}&role=viewer`);

    await Promise.all([
        new Promise(resolve => controllerSocket.on('open', resolve)),
        new Promise(resolve => viewerSocket.on('open', resolve))
    ]);

    await this.req(`/api/session/${sessionId}/viewer/connect`, 'POST', { screenSize: { width: 1024, height: 768 } });

    let allTestsPassed = true;

    // 1. Тест API контроллера подключения
    this.log('🔌 Тестируем API контроллер подключения...');
    const connectResponse = await this.req(`/api/session/${sessionId}/controller/connect`, 'POST', {});
    const connectOk = connectResponse.status === 200;
    this.log(connectOk ? '✅ API контроллер подключения работает' : '❌ API контроллер подключения не работает', connectOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && connectOk;

    // 2. Тест WebSocket контроллера команд
    this.log('🎮 Тестируем WebSocket контроллер команд...');
    let wsCommandReceived = false;
    controllerSocket.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'state_update') {
        wsCommandReceived = true;
      }
    });

    // Отправляем команду через WebSocket
    controllerSocket.send(JSON.stringify({ 
      type: 'controller_update', 
      payload: { paused: false, dirX: 1, dirY: 0, speed: 50 } 
    }));
    await new Promise(r => setTimeout(r, 500));

    this.log(wsCommandReceived ? '✅ WebSocket контроллер команд работает' : '❌ WebSocket контроллер команд не работает', wsCommandReceived ? 'success' : 'error');
    allTestsPassed = allTestsPassed && wsCommandReceived;

    // 3. Тест API контроллера обновлений
    this.log('📡 Тестируем API контроллер обновлений...');
    const updateResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { 
      paused: true, 
      dirX: -1, 
      dirY: 0, 
      speed: 60 
    });
    const updateOk = updateResponse.status === 200;
    this.log(updateOk ? '✅ API контроллер обновлений работает' : '❌ API контроллер обновлений не работает', updateOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && updateOk;

    // 4. Тест команды Reset через API
    this.log('🎯 Тестируем команду Reset через API...');
    const resetResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { reset: true });
    const resetOk = resetResponse.status === 200;
    this.log(resetOk ? '✅ Команда Reset через API работает' : '❌ Команда Reset через API не работает', resetOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && resetOk;

    // 5. Тест команды Reset через WebSocket
    this.log('🎯 Тестируем команду Reset через WebSocket...');
    controllerSocket.send(JSON.stringify({ 
      type: 'controller_update', 
      payload: { reset: true } 
    }));
    await new Promise(r => setTimeout(r, 300));

    const stateAfterReset = await this.req(`/api/session/${sessionId}/state`);
    const isCentered = Math.abs(stateAfterReset.data.x - 512) < 10 && Math.abs(stateAfterReset.data.y - 384) < 10;
    this.log(isCentered ? '✅ Команда Reset через WebSocket работает' : '❌ Команда Reset через WebSocket не работает', isCentered ? 'success' : 'error');
    allTestsPassed = allTestsPassed && isCentered;

    // 6. Тест изменения направления через API
    this.log('🧭 Тестируем изменение направления через API...');
    const directionResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { 
      paused: false, 
      dirX: 0, 
      dirY: 1, 
      speed: 40 
    });
    const directionOk = directionResponse.status === 200;
    this.log(directionOk ? '✅ Изменение направления через API работает' : '❌ Изменение направления через API не работает', directionOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && directionOk;

    // 7. Тест изменения скорости через API
    this.log('⚡ Тестируем изменение скорости через API...');
    const speedResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { 
      paused: false, 
      dirX: 1, 
      dirY: 0, 
      speed: 80 
    });
    const speedOk = speedResponse.status === 200;
    this.log(speedOk ? '✅ Изменение скорости через API работает' : '❌ Изменение скорости через API не работает', speedOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && speedOk;

    // 8. Тест паузы/возобновления через API
    this.log('⏸️ Тестируем паузу/возобновление через API...');
    const pauseResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { paused: true });
    const pauseOk = pauseResponse.status === 200;
    this.log(pauseOk ? '✅ Пауза через API работает' : '❌ Пауза через API не работает', pauseOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && pauseOk;

    const resumeResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { paused: false });
    const resumeOk = resumeResponse.status === 200;
    this.log(resumeOk ? '✅ Возобновление через API работает' : '❌ Возобновление через API не работает', resumeOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && resumeOk;

    // 9. Тест обработки некорректных команд
    this.log('🛡️ Тестируем обработку некорректных команд...');
    const invalidResponse = await this.req(`/api/session/${sessionId}/controller/update`, 'POST', { 
      invalidField: 'test',
      speed: 'not_a_number'
    });
    const invalidOk = invalidResponse.status === 200; // Сервер должен обработать и вернуть 200
    this.log(invalidOk ? '✅ Обработка некорректных команд работает' : '❌ Обработка некорректных команд не работает', invalidOk ? 'success' : 'error');
    allTestsPassed = allTestsPassed && invalidOk;

    controllerSocket.close();
    viewerSocket.close();

    this.log(allTestsPassed ? '✅ Все контроллеры работают корректно' : '❌ Некоторые контроллеры не работают', allTestsPassed ? 'success' : 'error');
    return allTestsPassed;
  }

  async runAllTests() {
    await this.startServer().catch((e) => {
        this.log(`Не удалось запустить сервер: ${e.message}`, 'error');
        // Если сервер не стартует, нет смысла продолжать
        return false;
    });
    // Даем серверу проснуться
    await new Promise(r => setTimeout(r, 1000));
    const okHealth = await this.health();
    this.log(okHealth ? 'Сервер OK' : 'Сервер не OK', okHealth ? 'success' : 'error');
    if (!okHealth) {
        return false;
    }
    
    const tests = [
      { name: 'testNoInitialStateBeforeViewerSize', fn: this.testNoInitialStateBeforeViewerSize.bind(this) },
      { name: 'testCenteringOnViewerConnect', fn: this.testCenteringOnViewerConnect.bind(this) },
      { name: 'testStartMovement', fn: this.testStartMovement.bind(this) },
      { name: 'testStopMovement', fn: this.testStopMovement.bind(this) },
      { name: 'testSpeedChange', fn: this.testSpeedChange.bind(this) },
      { name: 'testResetCommand', fn: this.testResetCommand.bind(this) },
      { name: 'testDirectionChange', fn: this.testDirectionChange.bind(this) },
      { name: 'testNegativeInput', fn: this.testNegativeInput.bind(this) },
      { name: 'testWebSocketReconnect', fn: this.testWebSocketReconnect.bind(this) },
      { name: 'testThrottlingPerformance', fn: this.testThrottlingPerformance.bind(this) },
      { name: 'testScreenSizeChangeStability', fn: this.testScreenSizeChangeStability.bind(this) },
      { name: 'testMovementStateUpdates', fn: this.testMovementStateUpdates.bind(this) },
      { name: 'testAllControllers', fn: this.testAllControllers.bind(this) }
    ];

    let allOk = true;
    const TEST_TIMEOUT = Number.parseInt(process.env.TEST_TIMEOUT_MS || '10000', 10); // 10 секунд по умолчанию

    for (const test of tests) {
      this.log(`🚀 Запуск теста: ${test.name}`);
      try {
        const testPromise = test.fn();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timed out')), TEST_TIMEOUT)
        );

        const result = await Promise.race([testPromise, timeoutPromise]);
        
        if (result) {
          this.log(`✅ Тест ${test.name} пройден`, 'success');
        } else {
          allOk = false;
          this.log(`❌ Тест ${test.name} провален`, 'error');
        }
      } catch (error) {
        allOk = false;
        this.log(`❌ Тест ${test.name} завершился с ошибкой: ${error.message}`, 'error');
      }
    }

    this.log(`ИТОГО: ${allOk ? 'Все тесты пройдены' : 'Есть проваленные тесты'}`, allOk ? 'success' : 'error');
    return allOk;
}

  async run() {
    const allOk = await this.runAllTests();
    await this.stopServer();
    return allOk ? 0 : 1;
  }
}

if (require.main === module) {
  const t = new Tester();
  t.run().then(code => process.exit(code));
}

module.exports = Tester;


