/**
 * Детальный тест синхронизации вьювера
 * Проверяет почему мяч не двигается в вьювере
 */

const http = require('http');

// Конфигурация тестов
const TEST_CONFIG = {
    serverUrl: 'http://localhost:3000',
    testSessionId: null,
    timeout: 5000,
    retries: 3
};

// Класс для тестирования
class ViewerSyncTester {
    constructor(config = {}) {
        this.config = { ...TEST_CONFIG, ...config };
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            tests: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': 'ℹ️ ',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️ '
        }[type] || '📝';

        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.config.serverUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const response = {
                            status: res.statusCode,
                            data: body ? JSON.parse(body) : null,
                            headers: res.headers
                        };
                        resolve(response);
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            data: body,
                            headers: res.headers
                        });
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(this.config.timeout, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }

    async runTest(testName, testFn) {
        this.results.total++;
        this.log(`Running test: ${testName}`, 'info');

        try {
            const result = await testFn();
            this.results.passed++;
            this.results.tests.push({ name: testName, status: 'PASSED', result });
            this.log(`✅ ${testName} - PASSED`, 'success');
            return result;
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name: testName, status: 'FAILED', error: error.message });
            this.log(`❌ ${testName} - FAILED: ${error.message}`, 'error');
            throw error;
        }
    }

    // Тест полного цикла: создание сессии -> запуск мяча -> проверка состояния
    async testFullSyncCycle() {
        return this.runTest('Full Sync Cycle', async () => {
            // 1. Создание сессии
            const sessionRes = await this.makeRequest('/api/session', 'POST');
            if (sessionRes.status !== 200) {
                throw new Error(`Failed to create session: ${sessionRes.status}`);
            }
            this.config.testSessionId = sessionRes.data.sessionId;
            this.log(`Session created: ${this.config.testSessionId}`);

            // 2. Подключение контроллера
            const controllerRes = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/connect`, 'POST');
            if (controllerRes.status !== 200) {
                throw new Error(`Failed to connect controller: ${controllerRes.status}`);
            }
            this.log('Controller connected');

            // 3. Подключение вьювера
            const viewerRes = await this.makeRequest(`/api/session/${this.config.testSessionId}/viewer/connect`, 'POST', {
                screenSize: { width: 1920, height: 1080 }
            });
            if (viewerRes.status !== 200) {
                throw new Error(`Failed to connect viewer: ${viewerRes.status}`);
            }
            this.log('Viewer connected');

            // 4. Проверка начального состояния
            const initialState = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            this.log(`Initial state: vx=${initialState.data.vx}, vy=${initialState.data.vy}, paused=${initialState.data.paused}`);
            this.log(`Controller connected: ${initialState.data.controllerConnected}`);
            this.log(`Viewer connected: ${initialState.data.viewerConnected}`);

            // 5. Отправка команды запуска мяча
            this.log('Sending start command...');
            const startCommand = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                resume: true,
                dirX: 1,
                dirY: 0,
                speedScalar: 200
            });

            if (startCommand.status !== 200) {
                throw new Error(`Failed to send start command: ${startCommand.status}`);
            }
            this.log('Start command sent successfully');

            // 6. Ожидание и проверка состояния после команды
            await new Promise(resolve => setTimeout(resolve, 1000));

            const afterStartState = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            this.log(`After start state: vx=${afterStartState.data.vx}, vy=${afterStartState.data.vy}, paused=${afterStartState.data.paused}`);

            if (afterStartState.data.paused !== false) {
                throw new Error(`Ball should not be paused after start command, but paused=${afterStartState.data.paused}`);
            }

            if (afterStartState.data.vx <= 0) {
                throw new Error(`Ball should be moving right after start command, but vx=${afterStartState.data.vx}`);
            }

            // 7. Проверка что вьювер получает обновления
            const viewerState = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            if (viewerState.data.controllerConnected !== true) {
                throw new Error(`Viewer should know controller is connected, but controllerConnected=${viewerState.data.controllerConnected}`);
            }

            return {
                sessionId: this.config.testSessionId,
                initialState: initialState.data,
                afterStartState: afterStartState.data,
                viewerState: viewerState.data
            };
        });
    }

    // Тест что вьювер получает правильные данные
    async testViewerDataFlow() {
        return this.runTest('Viewer Data Flow', async () => {
            if (!this.config.testSessionId) {
                throw new Error('No test session available');
            }

            // Проверяем что маршрут состояния возвращает правильные данные для вьювера
            const stateRes = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            if (stateRes.status !== 200) {
                throw new Error(`State request failed: ${stateRes.status}`);
            }

            const state = stateRes.data;

            // Проверяем обязательные поля
            const requiredFields = ['x', 'y', 'vx', 'vy', 'speed', 'radius', 'colorBall', 'colorBg', 'paused', 'controllerConnected', 'viewerConnected'];
            for (const field of requiredFields) {
                if (!(field in state)) {
                    throw new Error(`State response missing required field: ${field}`);
                }
            }

            this.log(`State response contains all required fields: ${requiredFields.join(', ')}`);
            this.log(`Current state: vx=${state.vx}, vy=${state.vy}, paused=${state.paused}, controllerConnected=${state.controllerConnected}`);

            return state;
        });
    }

    // Тест изменения скорости
    async testSpeedChanges() {
        return this.runTest('Speed Changes', async () => {
            if (!this.config.testSessionId) {
                throw new Error('No test session available');
            }

            // Тестируем разные скорости
            const speeds = [100, 200, 300, 500];

            for (const speed of speeds) {
                this.log(`Testing speed: ${speed}%`);

                const speedCommand = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                    resume: true,
                    dirX: 1,
                    dirY: 0,
                    speedScalar: speed
                });

                if (speedCommand.status !== 200) {
                    throw new Error(`Failed to set speed ${speed}: ${speedCommand.status}`);
                }

                await new Promise(resolve => setTimeout(resolve, 500));

                const stateRes = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
                const state = stateRes.data;

                this.log(`Speed ${speed}% result: vx=${state.vx}, vy=${state.vy}, paused=${state.paused}`);

                if (state.paused !== false) {
                    throw new Error(`Ball should not be paused at speed ${speed}%, but paused=${state.paused}`);
                }

                if (state.vx <= 0) {
                    throw new Error(`Ball should be moving right at speed ${speed}%, but vx=${state.vx}`);
                }
            }

            return { testedSpeeds: speeds };
        });
    }

    // Тест паузы
    async testPauseFunctionality() {
        return this.runTest('Pause Functionality', async () => {
            if (!this.config.testSessionId) {
                throw new Error('No test session available');
            }

            // Сначала запускаем мяч
            await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                resume: true,
                dirX: 1,
                dirY: 0,
                speedScalar: 200
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // Проверяем что мяч движется
            const movingState = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            if (movingState.data.vx <= 0) {
                throw new Error(`Ball should be moving before pause, but vx=${movingState.data.vx}`);
            }

            // Отправляем команду паузы
            const pauseCommand = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                pause: true
            });

            if (pauseCommand.status !== 200) {
                throw new Error(`Pause command failed: ${pauseCommand.status}`);
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            // Проверяем что мяч остановлен
            const pausedState = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);

            if (pausedState.data.paused !== true) {
                throw new Error(`Ball should be paused, but paused=${pausedState.data.paused}`);
            }

            if (pausedState.data.vx !== 0 || pausedState.data.vy !== 0) {
                throw new Error(`Paused ball should have zero velocity, but vx=${pausedState.data.vx}, vy=${pausedState.data.vy}`);
            }

            this.log(`Pause test successful: vx=${pausedState.data.vx}, vy=${pausedState.data.vy}, paused=${pausedState.data.paused}`);

            return {
                beforePause: movingState.data,
                afterPause: pausedState.data
            };
        });
    }

    // Тест нескольких последовательных команд
    async testSequentialCommands() {
        return this.runTest('Sequential Commands', async () => {
            if (!this.config.testSessionId) {
                throw new Error('No test session available');
            }

            const results = [];

            // Команда 1: Запуск вправо
            this.log('Command 1: Start moving right');
            await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                resume: true,
                dirX: 1,
                dirY: 0,
                speedScalar: 150
            });

            await new Promise(resolve => setTimeout(resolve, 500));
            const state1 = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            results.push({ command: 'start_right', vx: state1.data.vx, vy: state1.data.vy, paused: state1.data.paused });
            this.log(`After start right: vx=${state1.data.vx}, vy=${state1.data.vy}`);

            // Команда 2: Изменение направления влево
            this.log('Command 2: Change direction to left');
            await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                resume: true,
                dirX: -1,
                dirY: 0,
                speedScalar: 150
            });

            await new Promise(resolve => setTimeout(resolve, 500));
            const state2 = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            results.push({ command: 'change_to_left', vx: state2.data.vx, vy: state2.data.vy, paused: state2.data.paused });
            this.log(`After change to left: vx=${state2.data.vx}, vy=${state2.data.vy}`);

            // Команда 3: Пауза
            this.log('Command 3: Pause');
            await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', {
                pause: true
            });

            await new Promise(resolve => setTimeout(resolve, 500));
            const state3 = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            results.push({ command: 'pause', vx: state3.data.vx, vy: state3.data.vy, paused: state3.data.paused });
            this.log(`After pause: vx=${state3.data.vx}, vy=${state3.data.vy}`);

            // Проверяем логику команд
            if (state1.data.vx <= 0) {
                throw new Error('First command should make ball move right');
            }

            if (state2.data.vx >= 0) {
                throw new Error('Second command should make ball move left');
            }

            if (state3.data.vx !== 0 || state3.data.vy !== 0 || state3.data.paused !== true) {
                throw new Error('Third command should pause the ball completely');
            }

            return results;
        });
    }

    // Запуск всех тестов
    async runAllTests() {
        this.log('🚀 Starting detailed viewer sync tests...', 'info');

        try {
            // Базовые тесты
            await this.testFullSyncCycle();
            await this.testViewerDataFlow();

            // Продвинутые тесты
            await this.testSpeedChanges();
            await this.testPauseFunctionality();
            await this.testSequentialCommands();

        } catch (error) {
            this.log(`Test suite failed: ${error.message}`, 'error');
        }

        this.printResults();
    }

    printResults() {
        this.log('\n📊 Viewer Sync Test Results Summary:', 'info');
        this.log(`Total tests: ${this.results.total}`, 'info');
        this.log(`✅ Passed: ${this.results.passed}`, 'success');
        this.log(`❌ Failed: ${this.results.failed}`, 'error');
        this.log(`Success rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`, 'info');

        if (this.results.failed > 0) {
            this.log('\n❌ Failed tests:', 'error');
            this.results.tests
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    this.log(`  - ${test.name}: ${test.error}`, 'error');
                });
        }

        if (this.results.passed === this.results.total) {
            this.log('\n🎉 All viewer sync tests passed! The issue might be in the frontend viewer implementation.', 'success');
        } else {
            this.log('\n⚠️ Some tests failed. The issue is likely in the server-side synchronization.', 'warning');
        }
    }
}

// Запуск тестов если файл запущен напрямую
if (require.main === module) {
    const tester = new ViewerSyncTester();

    // Обработка прерывания
    process.on('SIGINT', () => {
        tester.log('Test interrupted by user', 'warning');
        tester.printResults();
        process.exit(0);
    });

    tester.runAllTests().catch(error => {
        tester.log(`Critical error: ${error.message}`, 'error');
        tester.printResults();
        process.exit(1);
    });
}

module.exports = ViewerSyncTester;
