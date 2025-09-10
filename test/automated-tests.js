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
      { name: 'testMovementStateUpdates', fn: this.testMovementStateUpdates.bind(this) }
    ];

    let allOk = true;
    const TEST_TIMEOUT = 10000; // 10 секунд на тест

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


