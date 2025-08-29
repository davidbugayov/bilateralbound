#!/usr/bin/env node

/**
 * Комплексный тест задержек и синхронизации скорости
 * Проверяет производительность и точность синхронизации
 */

const http = require('http');

class LatencySyncTest {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.results = {
            latency: [],
            syncAccuracy: [],
            performance: []
        };
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.baseURL);
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
                const responseTime = Date.now() - startTime;

                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(body);
                        resolve({
                            status: res.statusCode,
                            data: response,
                            latency: responseTime
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            data: body,
                            latency: responseTime
                        });
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

    async testNetworkLatency() {
        console.log('🌐 Тестируем сетевую задержку...');

        // Сначала проверяем доступность сервера
        try {
            const healthCheck = await this.makeRequest('/health');
            if (healthCheck.status !== 200) {
                console.log('❌ Сервер недоступен');
                return false;
            }
        } catch (error) {
            console.log(`❌ Ошибка подключения к серверу: ${error.message}`);
            return false;
        }

        const latencies = [];
        const testCount = 20;

        for (let i = 0; i < testCount; i++) {
            try {
                const response = await this.makeRequest('/health');
                if (response.status === 200) {
                    latencies.push(response.latency);
                }
            } catch (error) {
                console.log(`❌ Ошибка при тесте ${i + 1}: ${error.message}`);
            }

            // Небольшая пауза между запросами
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const minLatency = Math.min(...latencies);
        const maxLatency = Math.max(...latencies);
        const medianLatency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)];

        console.log(`📊 Статистика задержки (${latencies.length}/${testCount}):`);
        console.log(`   Средняя: ${avgLatency.toFixed(1)}ms`);
        console.log(`   Минимальная: ${minLatency}ms`);
        console.log(`   Максимальная: ${maxLatency}ms`);
        console.log(`   Медиана: ${medianLatency}ms`);

        this.results.latency = {
            avg: avgLatency,
            min: minLatency,
            max: maxLatency,
            median: medianLatency,
            samples: latencies.length
        };

        return avgLatency < 100; // Приемлемая задержка < 100ms
    }

    async testSyncAccuracy() {
        console.log('\n🎯 Тестируем точность синхронизации...');

        // Создаем сессию
        const sessionResponse = await this.makeRequest('/api/session', 'POST');
        if (sessionResponse.status !== 200) {
            console.log('❌ Не удалось создать сессию');
            return false;
        }

        const sessionId = sessionResponse.data.sessionId;
        const accuracies = [];

        // Тестируем разные скорости
        const speeds = [20, 40, 60, 80, 100];
        const directions = [
            { name: 'вправо', x: 1, y: 0 },
            { name: 'диагональ', x: 1, y: 1 }
        ];

        for (const speed of speeds) {
            for (const direction of directions) {
                console.log(`   Тестируем скорость ${speed}% в направлении ${direction.name}...`);

                // Отправляем команду
                const commandStart = Date.now();
                const commandResponse = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
                    speedScalar: speed,
                    dirX: direction.x,
                    dirY: direction.y,
                    resume: true  // Добавляем resume=true как в клиенте
                });

                if (commandResponse.status !== 200) {
                    console.log(`❌ Ошибка команды: ${commandResponse.status}`);
                    continue;
                }

                const commandLatency = Date.now() - commandStart;

                // Ждем обработки
                await new Promise(resolve => setTimeout(resolve, 150));

                // Получаем состояние
                const stateStart = Date.now();
                const stateResponse = await this.makeRequest(`/api/session/${sessionId}/state`);
                const stateLatency = Date.now() - stateStart;

                if (stateResponse.status === 200) {
                    const serverState = stateResponse.data;
                    const serverSpeed = Math.sqrt(
                        Math.pow(serverState.vx || 0, 2) +
                        Math.pow(serverState.vy || 0, 2)
                    );

                    const expectedSpeed = (speed / 100) * 1280; // Максимальная скорость 1280 px/s
                    const accuracy = Math.abs(serverSpeed - expectedSpeed) / expectedSpeed;

                    accuracies.push({
                        speed: speed,
                        direction: direction.name,
                        expected: expectedSpeed,
                        actual: serverSpeed,
                        accuracy: accuracy,
                        commandLatency: commandLatency,
                        stateLatency: stateLatency,
                        serverState: serverState
                    });

                    console.log(`      Команда: speed=${speed}%, dir=(${direction.x}, ${direction.y})`);
                    console.log(`      Состояние сервера: vx=${serverState.vx}, vy=${serverState.vy}, speed=${serverState.speed}`);
                    console.log(`      Ожидалось: ${expectedSpeed.toFixed(0)} px/s`);
                    console.log(`      Получено: ${serverSpeed.toFixed(0)} px/s`);
                    console.log(`      Точность: ${(accuracy * 100).toFixed(1)}%`);
                    console.log(`      Задержки: команда=${commandLatency}ms, состояние=${stateLatency}ms`);
                }
            }
        }

        // Анализируем результаты
        const avgAccuracy = accuracies.reduce((sum, a) => sum + a.accuracy, 0) / accuracies.length;
        const goodAccuracy = accuracies.filter(a => a.accuracy < 0.1).length; // < 10% погрешность

        console.log(`\n📊 Итоговая точность синхронизации:`);
        console.log(`   Средняя погрешность: ${(avgAccuracy * 100).toFixed(1)}%`);
        console.log(`   Хорошая точность (<10%): ${goodAccuracy}/${accuracies.length}`);

        this.results.syncAccuracy = accuracies;

        return avgAccuracy < 0.1; // Приемлемая погрешность < 10%
    }

    async testScreenSizeProportionality() {
        console.log('\n📱 Тестируем постоянство скорости на разных размерах экрана...');

        const screenSizes = [
            { width: 800, height: 600, name: 'стандартный' },
            { width: 1024, height: 768, name: 'ноутбук' },
            { width: 1920, height: 1080, name: 'Full HD' },
            { width: 3840, height: 2160, name: '4K' },
            { width: 600, height: 400, name: 'мобильный' }
        ];

        const proportionalityResults = [];

        for (const screenSize of screenSizes) {
            console.log(`   Тестируем размер ${screenSize.name}: ${screenSize.width}x${screenSize.height}`);

            // Создаем сессию с указанным размером экрана
            const sessionResponse = await this.makeRequest('/api/session', 'POST', {
                viewerScreenSize: screenSize
            });

            if (sessionResponse.status !== 200) {
                console.log(`❌ Не удалось создать сессию для ${screenSize.name}`);
                continue;
            }

            const sessionId = sessionResponse.data.sessionId;

            // Отправляем команду движения
            await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
                speedScalar: 80,
                dirX: 1,
                dirY: 0
            });

            // Ждем обработки
            await new Promise(resolve => setTimeout(resolve, 200));

            // Получаем состояние
            const stateResponse = await this.makeRequest(`/api/session/${sessionId}/state`);

            if (stateResponse.status === 200) {
                const speed = Math.sqrt(
                    Math.pow(stateResponse.data.vx || 0, 2) +
                    Math.pow(stateResponse.data.vy || 0, 2)
                );

                // Скорость должна быть постоянной независимо от размера экрана
                const expectedSpeed = 1024; // 80% от 1280 px/s
                const actualSpeed = speed;

                const deviation = Math.abs(actualSpeed - expectedSpeed) / expectedSpeed;

                proportionalityResults.push({
                    screenSize: screenSize,
                    expectedSpeed: expectedSpeed,
                    actualSpeed: actualSpeed,
                    deviation: deviation
                });

                console.log(`      Ожидалось: ${expectedSpeed} px/s (постоянная скорость)`);
                console.log(`      Получено: ${actualSpeed.toFixed(0)} px/s`);
                console.log(`      Отклонение: ${(deviation * 100).toFixed(1)}%`);

                if (deviation < 0.05) { // < 5% отклонение приемлемо
                    console.log(`      ✅ СКОРОСТЬ ПОСТОЯННАЯ`);
                } else {
                    console.log(`      ❌ СКОРОСТЬ ИЗМЕНЯЕТСЯ`);
                }
            }
        }

        // Анализируем постоянство скорости
        const avgDeviation = proportionalityResults.reduce((sum, r) => sum + r.deviation, 0) / proportionalityResults.length;
        const maxDeviation = Math.max(...proportionalityResults.map(r => r.deviation));
        const consistentCount = proportionalityResults.filter(r => r.deviation < 0.05).length;

        console.log(`\n📊 Постоянство скорости:`);
        console.log(`   Среднее отклонение: ${(avgDeviation * 100).toFixed(1)}%`);
        console.log(`   Максимальное отклонение: ${(maxDeviation * 100).toFixed(1)}%`);
        console.log(`   Консистентных экранов: ${consistentCount}/${proportionalityResults.length}`);

        this.results.screenProportionality = proportionalityResults;

        return maxDeviation < 0.05; // Все экраны должны иметь постоянную скорость
    }

    async testConcurrentConnections() {
        console.log('\n👥 Тестируем одновременные подключения...');

        const connections = 5;
        const sessions = [];

        // Создаем несколько сессий одновременно
        console.log(`   Создаем ${connections} одновременных сессий...`);
        const startTime = Date.now();

        const promises = Array(connections).fill().map(async (_, i) => {
            const response = await this.makeRequest('/api/session', 'POST');
            return { index: i, response };
        });

        const results = await Promise.all(promises);
        const totalTime = Date.now() - startTime;

        let successCount = 0;
        results.forEach((result, i) => {
            if (result.response.status === 200) {
                successCount++;
                sessions.push(result.response.data.sessionId);
            } else {
                console.log(`❌ Сессия ${i + 1} не создана: ${result.response.status}`);
            }
        });

        console.log(`✅ Успешно создано: ${successCount}/${connections} сессий`);
        console.log(`⏱️ Общее время: ${totalTime}ms (${(totalTime / connections).toFixed(1)}ms на сессию)`);

        // Проверяем, что сессии созданы
        if (sessions.length === 0) {
            console.log(`❌ Нет доступных сессий для тестирования команд`);
            this.results.concurrentConnections = {
                sessionsCreated: successCount,
                commandsSuccessful: 0,
                avgCommandLatency: 0,
                totalTime: totalTime
            };
            return false;
        }

        // Тестируем одновременные команды
        console.log(`   Отправляем команды во все сессии...`);
        const commandPromises = sessions.map(async (sessionId, i) => {
            const start = Date.now();
            const response = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
                speedScalar: 50 + i * 10, // Разные скорости
                dirX: 1,
                dirY: 0
            });
            const latency = Date.now() - start;
            return { sessionId, latency, status: response.status };
        });

        const commandResults = await Promise.all(commandPromises);

        let commandSuccessCount = 0;
        let totalCommandLatency = 0;

        commandResults.forEach((result, i) => {
            if (result.status === 200) {
                commandSuccessCount++;
                totalCommandLatency += result.latency;
                console.log(`   ✅ Команда ${i + 1}: ${result.latency}ms`);
            } else {
                console.log(`   ❌ Команда ${i + 1}: ошибка ${result.status}`);
            }
        });

        const avgCommandLatency = commandSuccessCount > 0 ? totalCommandLatency / commandSuccessCount : 0;

        console.log(`✅ Успешных команд: ${commandSuccessCount}/${sessions.length}`);
        console.log(`⏱️ Средняя задержка команды: ${avgCommandLatency.toFixed(1)}ms`);

        this.results.concurrentConnections = {
            sessionsCreated: successCount,
            commandsSuccessful: commandSuccessCount,
            avgCommandLatency: avgCommandLatency,
            totalTime: totalTime
        };

        return commandSuccessCount === sessions.length && (commandSuccessCount === 0 || avgCommandLatency < 200);
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 ПОДРОБНЫЙ ОТЧЕТ ТЕСТИРОВАНИЯ');
        console.log('='.repeat(60));

        // Задержка сети
        if (this.results.latency) {
            console.log('\n🌐 Сетевая задержка:');
            console.log(`   Средняя: ${this.results.latency.avg.toFixed(1)}ms`);
            console.log(`   Диапазон: ${this.results.latency.min}-${this.results.latency.max}ms`);
            console.log(`   Медиана: ${this.results.latency.median}ms`);
            console.log(`   Выборок: ${this.results.latency.samples}`);
        }

        // Точность синхронизации
        if (this.results.syncAccuracy && this.results.syncAccuracy.length > 0) {
            const accuracies = this.results.syncAccuracy.map(a => a.accuracy);
            const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;

            console.log('\n🎯 Точность синхронизации:');
            console.log(`   Средняя погрешность: ${(avgAccuracy * 100).toFixed(1)}%`);
            console.log(`   Лучшая точность: ${(Math.min(...accuracies) * 100).toFixed(1)}%`);
            console.log(`   Худшая точность: ${(Math.max(...accuracies) * 100).toFixed(1)}%`);

            // Детали по скоростям
            console.log('\n   По скоростям:');
            const speedGroups = {};
            this.results.syncAccuracy.forEach(acc => {
                if (!speedGroups[acc.speed]) speedGroups[acc.speed] = [];
                speedGroups[acc.speed].push(acc.accuracy);
            });

            Object.keys(speedGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(speed => {
                const groupAccuracies = speedGroups[speed];
                const avg = groupAccuracies.reduce((a, b) => a + b, 0) / groupAccuracies.length;
                console.log(`      ${speed}%: ${(avg * 100).toFixed(1)}% погрешность`);
            });
        }

        // Пропорциональность экранов
        if (this.results.screenProportionality && this.results.screenProportionality.length > 0) {
            console.log('\n📱 Пропорциональность экранов:');
            this.results.screenProportionality.forEach(result => {
                const screen = result.screenSize;
                console.log(`   ${screen.name} (${screen.width}x${screen.height}):`);
                console.log(`      Отклонение: ${(result.deviation * 100).toFixed(1)}%`);
            });
        }

        // Одновременные подключения
        if (this.results.concurrentConnections) {
            const conc = this.results.concurrentConnections;
            console.log('\n👥 Одновременные подключения:');
            console.log(`   Сессий создано: ${conc.sessionsCreated}`);
            console.log(`   Команд выполнено: ${conc.commandsSuccessful}`);
            console.log(`   Ср. задержка команды: ${conc.avgCommandLatency.toFixed(1)}ms`);
            console.log(`   Общее время: ${conc.totalTime}ms`);
        }

        console.log('\n' + '='.repeat(60));
    }

    async runComprehensiveTests() {
        console.log('🚀 ЗАПУСК КОМПЛЕКСНОГО ТЕСТИРОВАНИЯ');
        console.log('Проверяем задержки, синхронизацию и пропорциональность\n');

        let allPassed = true;
        const testResults = [];

        // Тест 1: Задержка сети
        console.log('═'.repeat(50));
        console.log('ТЕСТ 1: Сетевая задержка');
        console.log('═'.repeat(50));
        const latencyTest = await this.testNetworkLatency();
        testResults.push({ name: 'Network Latency', passed: latencyTest });
        if (!latencyTest) allPassed = false;

        // Тест 2: Точность синхронизации
        console.log('\n' + '═'.repeat(50));
        console.log('ТЕСТ 2: Точность синхронизации');
        console.log('═'.repeat(50));
        const syncTest = await this.testSyncAccuracy();
        testResults.push({ name: 'Sync Accuracy', passed: syncTest });
        if (!syncTest) allPassed = false;

        // Тест 3: Пропорциональность экранов
        console.log('\n' + '═'.repeat(50));
        console.log('ТЕСТ 3: Пропорциональность экранов');
        console.log('═'.repeat(50));
        const screenTest = await this.testScreenSizeProportionality();
        testResults.push({ name: 'Screen Proportionality', passed: screenTest });
        if (!screenTest) allPassed = false;

        // Тест 4: Одновременные подключения
        console.log('\n' + '═'.repeat(50));
        console.log('ТЕСТ 4: Одновременные подключения');
        console.log('═'.repeat(50));
        const concurrentTest = await this.testConcurrentConnections();
        testResults.push({ name: 'Concurrent Connections', passed: concurrentTest });
        if (!concurrentTest) allPassed = false;

        // Итоговый отчет
        this.generateReport();

        console.log('\n' + '═'.repeat(60));
        console.log('ИТОГОВЫЕ РЕЗУЛЬТАТЫ:');
        testResults.forEach(test => {
            const status = test.passed ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН';
            console.log(`${status}: ${test.name}`);
        });

        const passedCount = testResults.filter(t => t.passed).length;
        console.log(`\n🎯 ОБЩИЙ РЕЗУЛЬТАТ: ${passedCount}/${testResults.length} тестов пройдено`);

        if (allPassed) {
            console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Система готова к продакшену!');
        } else {
            console.log('⚠️ Некоторые тесты провалены. Требуется оптимизация.');
        }

        console.log('═'.repeat(60));

        return allPassed;
    }
}

// Запуск комплексного тестирования
if (require.main === module) {
    const test = new LatencySyncTest();
    test.runComprehensiveTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Критическая ошибка тестирования:', error);
        process.exit(1);
    });
}

module.exports = LatencySyncTest;
