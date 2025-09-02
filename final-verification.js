/**
 * Финальная верификация исправлений синхронизации вьювера
 * Проверяет все ключевые функции после исправлений
 */

const http = require('http');

class FinalVerifier {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.sessionId = null;
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'info': 'ℹ️',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || '📝';

        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: method,
                headers: { 'Content-Type': 'application/json' }
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const response = {
                            status: res.statusCode,
                            data: body ? JSON.parse(body) : null
                        };
                        resolve(response);
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            data: body
                        });
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }
            req.end();
        });
    }

    async runTest(name, testFn) {
        this.results.total++;
        this.log(`Running: ${name}`, 'info');

        try {
            const result = await testFn();
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED', result });
            this.log(`${name} - PASSED`, 'success');
            return result;
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
            this.log(`${name} - FAILED: ${error.message}`, 'error');
            throw error;
        }
    }

    async testServerHealth() {
        return this.runTest('Server Health', async () => {
            const response = await this.makeRequest('/health');
            if (response.status !== 200) {
                throw new Error(`Health check failed: ${response.status}`);
            }
            return response.data;
        });
    }

    async testSessionCreation() {
        return this.runTest('Session Creation', async () => {
            const response = await this.makeRequest('/api/session', 'POST');
            if (response.status !== 200) {
                throw new Error(`Session creation failed: ${response.status}`);
            }
            this.sessionId = response.data.sessionId;
            return response.data;
        });
    }

    async testConnections() {
        return this.runTest('Controller & Viewer Connections', async () => {
            // Подключение контроллера
            const controllerRes = await this.makeRequest(`/api/session/${this.sessionId}/controller/connect`, 'POST');
            if (controllerRes.status !== 200) {
                throw new Error('Controller connection failed');
            }

            // Подключение вьювера
            const viewerRes = await this.makeRequest(`/api/session/${this.sessionId}/viewer/connect`, 'POST', {
                screenSize: { width: 1920, height: 1080 }
            });
            if (viewerRes.status !== 200) {
                throw new Error('Viewer connection failed');
            }

            // Проверка состояния
            const stateRes = await this.makeRequest(`/api/session/${this.sessionId}/state`);
            if (!stateRes.data.controllerConnected || !stateRes.data.viewerConnected) {
                throw new Error('Connections not reflected in state');
            }

            return stateRes.data;
        });
    }

    async testBallCommands() {
        return this.runTest('Ball Control Commands', async () => {
            const commands = [
                { name: 'Start Right', cmd: { resume: true, dirX: 1, dirY: 0, speedScalar: 200 } },
                { name: 'Pause', cmd: { pause: true } },
                { name: 'Start Left', cmd: { resume: true, dirX: -1, dirY: 0, speedScalar: 300 } },
                { name: 'Change Color', cmd: { colorBall: '#ff4444' } },
                { name: 'Change Size', cmd: { radius: 60 } }
            ];

            for (const { name, cmd } of commands) {
                const response = await this.makeRequest(`/api/session/${this.sessionId}/controller/update`, 'POST', cmd);
                if (response.status !== 200) {
                    throw new Error(`${name} command failed: ${response.status}`);
                }

                // Небольшая задержка для обработки
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            return commands.length;
        });
    }

    async testStateSynchronization() {
        return this.runTest('State Synchronization', async () => {
            // Запускаем мяч
            await this.makeRequest(`/api/session/${this.sessionId}/controller/update`, 'POST', {
                resume: true, dirX: 1, dirY: 0, speedScalar: 250
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            const state1 = await this.makeRequest(`/api/session/${this.sessionId}/state`);

            // Проверяем что мяч движется
            if (state1.data.vx <= 0 || state1.data.paused !== false) {
                throw new Error('Ball not moving after start command');
            }

            // Останавливаем мяч
            await this.makeRequest(`/api/session/${this.sessionId}/controller/update`, 'POST', { pause: true });

            await new Promise(resolve => setTimeout(resolve, 500));

            const state2 = await this.makeRequest(`/api/session/${this.sessionId}/state`);

            // Проверяем что мяч остановлен
            if (state2.data.vx !== 0 || state2.data.vy !== 0 || state2.data.paused !== true) {
                throw new Error('Ball not stopped after pause command');
            }

            return {
                moving: state1.data,
                stopped: state2.data
            };
        });
    }

    async testPerformance() {
        return this.runTest('Performance Test', async () => {
            const startTime = Date.now();
            const requests = 20;

            // Выполняем несколько запросов состояния
            const promises = [];
            for (let i = 0; i < requests; i++) {
                promises.push(this.makeRequest(`/api/session/${this.sessionId}/state`));
            }

            const results = await Promise.all(promises);
            const endTime = Date.now();

            const successCount = results.filter(r => r.status === 200).length;
            const avgResponseTime = (endTime - startTime) / requests;

            if (successCount !== requests) {
                throw new Error(`Only ${successCount}/${requests} requests successful`);
            }

            if (avgResponseTime > 50) { // Максимум 50ms на запрос
                throw new Error(`Average response time too slow: ${avgResponseTime}ms`);
            }

            return {
                avgResponseTime: Math.round(avgResponseTime * 100) / 100,
                successRate: (successCount / requests * 100)
            };
        });
    }

    async runAllTests() {
        this.log('🚀 Starting final verification of viewer sync fixes...', 'info');

        try {
            await this.testServerHealth();
            await this.testSessionCreation();
            await this.testConnections();
            await this.testBallCommands();
            await this.testStateSynchronization();
            await this.testPerformance();

        } catch (error) {
            this.log(`Verification failed: ${error.message}`, 'error');
        }

        this.printResults();
    }

    printResults() {
        this.log('\n📊 Final Verification Results:', 'info');
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
            this.log('\n🎉 ALL TESTS PASSED! Viewer sync fixes are working perfectly!', 'success');
            this.log('\n📋 Next steps:', 'info');
            this.log('1. Open http://localhost:3000/test/test-viewer-browser.html in browser', 'info');
            this.log('2. Click "Начать тест" to verify browser-side synchronization', 'info');
            this.log('3. Test the main app at http://localhost:3000/', 'info');
        } else {
            this.log('\n⚠️ Some issues remain. Check server logs for details.', 'warning');
        }
    }
}

// Запуск верификации
if (require.main === module) {
    const verifier = new FinalVerifier();

    process.on('SIGINT', () => {
        verifier.log('Verification interrupted by user', 'warning');
        verifier.printResults();
        process.exit(0);
    });

    verifier.runAllTests().catch(error => {
        verifier.log(`Critical error: ${error.message}`, 'error');
        verifier.printResults();
        process.exit(1);
    });
}

module.exports = FinalVerifier;
