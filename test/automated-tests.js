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

  async run() {
    await this.startServer().catch(() => {});
    // Даем серверу проснуться
    await new Promise(r => setTimeout(r, 1000));
    const okHealth = await this.health();
    this.log(okHealth ? 'Сервер OK' : 'Сервер не OK', okHealth ? 'success' : 'error');
    const okCenter = await this.testCenteringOnViewerConnect();
    this.log(`ИТОГО: ${okCenter ? 'Все ок' : 'Провал'}`, okCenter ? 'success' : 'error');
    await this.stopServer();
    return okCenter ? 0 : 1;
  }
}

if (require.main === module) {
  const t = new Tester();
  t.run().then(code => process.exit(code));
}

module.exports = Tester;


