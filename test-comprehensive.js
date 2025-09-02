/**
 * Комплексные тесты для BilateralBound
 * Проверяет синхронизацию мячика, изменения характеристик и оптимизацию
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
class BilateralBoundTester {
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

    // Тесты создания сессии
    async testSessionCreation() {
        return this.runTest('Session Creation', async () => {
            const response = await this.makeRequest('/api/session', 'POST');

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            if (!response.data.sessionId) {
                throw new Error('Response should contain sessionId');
            }

            this.config.testSessionId = response.data.sessionId;
            this.log(`Created session: ${this.config.testSessionId}`, 'success');

            return response.data;
        });
    }

    // Тест подключения контроллера
    async testControllerConnection() {
        return this.runTest('Controller Connection', async () => {
            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/connect`, 'POST');

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            if (!response.data.success) {
                throw new Error('Controller connection should be successful');
            }

            // Проверяем статус сессии
            const statusResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}`);

            if (!statusResponse.data.controllerConnected) {
                throw new Error('Controller should be marked as connected');
            }

            return response.data;
        });
    }

    // Тест подключения viewer
    async testViewerConnection() {
        return this.runTest('Viewer Connection', async () => {
            const screenSize = { width: 1920, height: 1080 };
            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/viewer/connect`, 'POST', { screenSize });

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            // Проверяем статус сессии
            const statusResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}`);

            if (!statusResponse.data.viewerConnected) {
                throw new Error('Viewer should be marked as connected');
            }

            return response.data;
        });
    }

    // Тест получения состояния мяча
    async testBallStateRetrieval() {
        return this.runTest('Ball State Retrieval', async () => {
            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            const ballState = response.data;
            const requiredFields = ['x', 'y', 'vx', 'vy', 'speed', 'radius', 'colorBall', 'colorBg', 'paused'];

            for (const field of requiredFields) {
                if (!(field in ballState)) {
                    throw new Error(`Ball state should contain field: ${field}`);
                }
            }

            return ballState;
        });
    }

    // Тест отправки команд управления
    async testControlCommands() {
        return this.runTest('Control Commands', async () => {
            // Тест команды запуска мяча вправо
            const startCommand = {
                resume: true,
                dirX: 1,
                dirY: 0,
                speedScalar: 200
            };

            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', startCommand);

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            // Ждем немного и проверяем состояние
            await new Promise(resolve => setTimeout(resolve, 500));

            const stateResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            const ballState = stateResponse.data;

            // Мяч должен начать движение
            if (ballState.vx <= 0) {
                throw new Error('Ball should be moving right (vx > 0)');
            }

            return ballState;
        });
    }

    // Тест изменения скорости
    async testSpeedChange() {
        return this.runTest('Speed Change', async () => {
            const newSpeed = 300;
            const speedCommand = {
                speedScalar: newSpeed,
                resume: true,
                dirX: 1,
                dirY: 0
            };

            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', speedCommand);

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            // Проверяем состояние
            const stateResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            const ballState = stateResponse.data;

            // Скорость должна измениться (проверяем что vx изменилось)
            const speedVx = Math.abs(ballState.vx);
            if (speedVx === 0) {
                throw new Error('Ball should be moving after speed command');
            }

            // Проверяем что скорость изменилась от начальной (обычно 120)
            if (speedVx <= 120 && speedVx >= 119) { // Если скорость не изменилась
                throw new Error(`Speed should change from default 120, but got ${speedVx}`);
            }

            this.log(`Speed changed successfully: vx=${speedVx}`, 'success');

            return ballState;
        });
    }

    // Тест изменения цвета
    async testColorChange() {
        return this.runTest('Color Change', async () => {
            const newColor = '#ef4444'; // Красный
            const colorCommand = {
                colorBall: newColor
            };

            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', colorCommand);

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            // Проверяем состояние
            const stateResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            const ballState = stateResponse.data;

            if (ballState.colorBall !== newColor) {
                throw new Error(`Ball color should be ${newColor}, got ${ballState.colorBall}`);
            }

            return ballState;
        });
    }

    // Тест изменения размера
    async testSizeChange() {
        return this.runTest('Size Change', async () => {
            const newRadius = 60;
            const sizeCommand = {
                radius: newRadius
            };

            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', sizeCommand);

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            // Проверяем состояние
            const stateResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            const ballState = stateResponse.data;

            if (ballState.radius !== newRadius) {
                throw new Error(`Ball radius should be ${newRadius}, got ${ballState.radius}`);
            }

            return ballState;
        });
    }

    // Тест остановки мяча
    async testBallPause() {
        return this.runTest('Ball Pause', async () => {
            const pauseCommand = {
                pause: true
            };

            const response = await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', pauseCommand);

            if (response.status !== 200) {
                throw new Error(`Expected status 200, got ${response.status}`);
            }

            // Проверяем состояние
            const stateResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            const ballState = stateResponse.data;

            if (!ballState.paused) {
                throw new Error('Ball should be paused');
            }

            if (ballState.vx !== 0 || ballState.vy !== 0) {
                throw new Error('Paused ball should have zero velocity');
            }

            return ballState;
        });
    }

    // Тест производительности
    async testPerformance() {
        return this.runTest('Performance Test', async () => {
            const startTime = Date.now();
            const requests = 10;

            // Выполняем несколько запросов состояния
            const promises = [];
            for (let i = 0; i < requests; i++) {
                promises.push(this.makeRequest(`/api/session/${this.config.testSessionId}/state`));
            }

            const results = await Promise.all(promises);
            const endTime = Date.now();

            const avgResponseTime = (endTime - startTime) / requests;
            const successCount = results.filter(r => r.status === 200).length;

            if (successCount !== requests) {
                throw new Error(`Expected ${requests} successful requests, got ${successCount}`);
            }

            if (avgResponseTime > 1000) { // Максимум 1 секунда на запрос
                throw new Error(`Average response time too slow: ${avgResponseTime}ms`);
            }

            this.log(`Performance: ${avgResponseTime.toFixed(2)}ms average response time`, 'success');

            return {
                avgResponseTime,
                successCount,
                totalRequests: requests
            };
        });
    }

    // Тест отскоков от стен
    async testWallCollision() {
        return this.runTest('Wall Collision', async () => {
            // Запускаем мяч в угол экрана
            const cornerCommand = {
                resume: true,
                dirX: 1,
                dirY: 1,
                speedScalar: 200
            };

            await this.makeRequest(`/api/session/${this.config.testSessionId}/controller/update`, 'POST', cornerCommand);

            // Ждем немного для симуляции движения
            await new Promise(resolve => setTimeout(resolve, 1000));

            const stateResponse = await this.makeRequest(`/api/session/${this.config.testSessionId}/state`);
            const ballState = stateResponse.data;

            // Мяч должен отскочить от стен (изменить направление)
            if (ballState.x < 0 || ballState.x > 1920 || ballState.y < 0 || ballState.y > 1080) {
                throw new Error('Ball should bounce off walls, not go outside screen bounds');
            }

            return ballState;
        });
    }

    // Запуск всех тестов
    async runAllTests() {
        this.log('🚀 Starting comprehensive BilateralBound tests...', 'info');

        try {
            // Базовые тесты
            await this.testSessionCreation();
            await this.testControllerConnection();
            await this.testViewerConnection();
            await this.testBallStateRetrieval();

            // Тесты синхронизации
            await this.testControlCommands();
            await this.testSpeedChange();
            await this.testColorChange();
            await this.testSizeChange();
            await this.testBallPause();

            // Продвинутые тесты
            await this.testWallCollision();
            await this.testPerformance();

        } catch (error) {
            this.log(`Test suite failed: ${error.message}`, 'error');
        }

        this.printResults();
    }

    printResults() {
        this.log('\n📊 Test Results Summary:', 'info');
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
            this.log('\n🎉 All tests passed! BilateralBound is working correctly.', 'success');
        }
    }
}

// Запуск тестов если файл запущен напрямую
if (require.main === module) {
    const tester = new BilateralBoundTester();

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

module.exports = BilateralBoundTester;
