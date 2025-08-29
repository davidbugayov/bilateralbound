#!/usr/bin/env node

/**
 * Простой тест для проверки логики расчета скорости
 */

const http = require('http');

class SimpleSpeedTest {
    constructor() {
        this.baseURL = 'http://localhost:3000';
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
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
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(body);
                        resolve({ status: res.statusCode, data: response });
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

    async testSpeedCalculation() {
        console.log('🧪 Проверяем расчет скорости...\n');

        // Создаем сессию
        console.log('1. Создание сессии...');
        const sessionResponse = await this.makeRequest('/api/session', 'POST');
        if (sessionResponse.status !== 200) {
            console.log('❌ Не удалось создать сессию');
            return;
        }

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Сессия: ${sessionId}`);

        // Тестируем разные проценты скорости
        const testCases = [
            { speed: 20, expectedPixels: 256 },
            { speed: 40, expectedPixels: 512 },
            { speed: 60, expectedPixels: 768 },
            { speed: 80, expectedPixels: 1024 },
            { speed: 100, expectedPixels: 1280 }
        ];

        for (const testCase of testCases) {
            console.log(`\n2. Тестируем ${testCase.speed}% (${testCase.expectedPixels} px/s ожидается)`);

            // Отправляем команду
            const commandResponse = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
                speedScalar: testCase.speed,
                dirX: 1,
                dirY: 0,
                resume: true
            });

            if (commandResponse.status !== 200) {
                console.log(`❌ Команда не принята: ${commandResponse.status}`);
                continue;
            }

            // Ждем обработки
            await new Promise(resolve => setTimeout(resolve, 100));

            // Получаем состояние
            const stateResponse = await this.makeRequest(`/api/session/${sessionId}/state`);

            if (stateResponse.status === 200) {
                const vx = stateResponse.data.vx || 0;
                const vy = stateResponse.data.vy || 0;
                const actualSpeed = Math.sqrt(vx * vx + vy * vy);

                const difference = Math.abs(actualSpeed - testCase.expectedPixels);
                const accuracy = ((testCase.expectedPixels - difference) / testCase.expectedPixels * 100).toFixed(1);

                console.log(`   Ожидалось: ${testCase.expectedPixels} px/s`);
                console.log(`   Получено: vx=${vx}, vy=${vy}, скорость=${actualSpeed.toFixed(1)} px/s`);
                console.log(`   Точность: ${accuracy}%`);

                if (difference > 10) {
                    console.log(`   ❌ РАСХОЖДЕНИЕ: ${difference.toFixed(1)} px/s`);
                } else {
                    console.log(`   ✅ ПРИЕМЛЕМО`);
                }
            } else {
                console.log(`❌ Не удалось получить состояние`);
            }
        }

        console.log('\n3. Анализ результатов...');
        console.log('Если vx в 2 раза меньше ожидаемого, проблема в server-side логике');
        console.log('Если скорость правильная, проблема в client-side синхронизации');
    }

    async testDiagonalSpeed() {
        console.log('\n🧪 Проверяем диагональную скорость...\n');

        // Создаем новую сессию
        const sessionResponse = await this.makeRequest('/api/session', 'POST');
        if (sessionResponse.status !== 200) return;

        const sessionId = sessionResponse.data.sessionId;

        // Тестируем диагональное движение
        console.log('Тестируем диагональ 40% (ожидается ~724 px/s)...');

        const commandResponse = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
            speedScalar: 40,
            dirX: 1,
            dirY: 1,
            resume: true
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        const stateResponse = await this.makeRequest(`/api/session/${sessionId}/state`);

        if (stateResponse.status === 200) {
            const vx = stateResponse.data.vx || 0;
            const vy = stateResponse.data.vy || 0;
            const actualSpeed = Math.sqrt(vx * vx + vy * vy);
            const expectedDiagonal = 512 * Math.sqrt(2); // 512 * 1.414 ≈ 724

            console.log(`   Диагональ: vx=${vx}, vy=${vy}`);
            console.log(`   Общая скорость: ${actualSpeed.toFixed(1)} px/s`);
            console.log(`   Ожидалось: ${expectedDiagonal.toFixed(1)} px/s`);

            if (Math.abs(actualSpeed - expectedDiagonal) < 50) {
                console.log(`   ✅ Диагональная скорость корректна`);
            } else {
                console.log(`   ❌ Диагональная скорость некорректна`);
            }
        }
    }

    async runTests() {
        console.log('🚀 ПРОСТОЙ ТЕСТ РАСЧЕТА СКОРОСТИ\n');

        await this.testSpeedCalculation();
        await this.testDiagonalSpeed();

        console.log('\n📋 РЕЗЮМЕ:');
        console.log('Если горизонтальная скорость в 2 раза меньше - проблема в серверной логике');
        console.log('Если диагональная скорость неправильная - проблема в расчетах векторов');
        console.log('Если все скорости правильные - проблема в клиентской синхронизации');
    }
}

// Запуск тестов
if (require.main === module) {
    const test = new SimpleSpeedTest();
    test.runTests().catch(error => {
        console.error('❌ Ошибка тестирования:', error);
        process.exit(1);
    });
}

module.exports = SimpleSpeedTest;

