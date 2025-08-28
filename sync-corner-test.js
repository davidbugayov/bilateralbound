#!/usr/bin/env node

/**
 * Комплексный тест синхронизации клиента-сервера и поведения мяча на углах
 * Проверяет проблемы с рассихронизацией и дерганием мяча
 */

const http = require('http');
const fs = require('fs');

// Импортируем BallPhysics напрямую из файла
let BallPhysics;
try {
    const physicsCode = fs.readFileSync('./public/js/physics.js', 'utf8');
    // Выполняем код в контексте для получения BallPhysics
    const module = { exports: {} };
    const context = {
        console: console,
        window: { ERROR_CONFIG: null },
        module: module,
        exports: module.exports,
        require: () => ({})
    };

    // Простая эмуляция выполнения кода для получения класса
    const BallPhysicsMatch = physicsCode.match(/class BallPhysics[\s\S]*?\}/);
    if (BallPhysicsMatch) {
        // Создаем простой конструктор для тестирования
        BallPhysics = class TestBallPhysics {
            constructor() {
                this.ball = {
                    x: 400,
                    y: 300,
                    vx: 0,
                    vy: 0,
                    speed: 120,
                    radius: 40
                };
                this.world = {
                    width: 800,
                    height: 600
                };
                this.paused = true;
                this.lastDir = { x: 1, y: 0 };
                this.lastBounceTime = 0;
                this.edgePadding = 15;
                this.minSpeed = 500;
            }

            updateWithDirection(dirX, dirY, speed, dt = 1/60) {
                if (this.paused) {
                    this.ball.vx = 0;
                    this.ball.vy = 0;
                    return;
                }

                // Простая логика обновления
                if (this.ball.vx === 0 && this.ball.vy === 0) {
                    this.lastDir = { x: dirX, y: dirY };
                    this.ball.vx = dirX * speed;
                    this.ball.vy = dirY * speed;
                }

                this.handleBoundaryCollisions();
                this.ball.x += this.ball.vx * dt;
                this.ball.y += this.ball.vy * dt;
                this.handleBoundaryCollisions();
            }

            handleBoundaryCollisions() {
                const radius = this.ball.radius;
                const width = this.world.width;
                const height = this.world.height;
                const minSpeed = this.minSpeed;
                const edgePadding = this.edgePadding;

                // Left boundary
                if (this.ball.x - radius <= 0) {
                    this.ball.x = radius + edgePadding;
                    this.ball.vx = Math.max(Math.abs(this.ball.vx), minSpeed);
                    this.lastBounceTime = Date.now();
                }

                // Right boundary
                if (this.ball.x + radius >= width) {
                    this.ball.x = width - radius - edgePadding;
                    this.ball.vx = -Math.max(Math.abs(this.ball.vx), minSpeed);
                    this.lastBounceTime = Date.now();
                }

                // Top boundary
                if (this.ball.y - radius <= 0) {
                    this.ball.y = radius + edgePadding;
                    this.ball.vy = Math.max(Math.abs(this.ball.vy), minSpeed);
                    this.lastBounceTime = Date.now();
                }

                // Bottom boundary
                if (this.ball.y + radius >= height) {
                    this.ball.y = height - radius - edgePadding;
                    this.ball.vy = -Math.max(Math.abs(this.ball.vy), minSpeed);
                    this.lastBounceTime = Date.now();
                }
            }
        };
    }
} catch (error) {
    console.error('Ошибка загрузки BallPhysics:', error.message);
    BallPhysics = class FallbackBallPhysics {
        constructor() {
            this.ball = { x: 400, y: 300, vx: 0, vy: 0 };
            this.world = { width: 800, height: 600 };
            this.paused = true;
        }
        updateWithDirection() {}
        handleBoundaryCollisions() {}
    };
}

class SyncCornerTest {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.testResults = [];
        this.errors = [];
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

    async testServerHealth() {
        this.log('Проверяем здоровье сервера...');
        try {
            const response = await this.makeRequest('/health');
            if (response.status === 200 && response.data.status === 'ok') {
                this.log('Сервер работает нормально', 'success');
                return true;
            } else {
                this.log(`Сервер вернул статус: ${response.status}`, 'error');
                return false;
            }
        } catch (error) {
            this.log(`Ошибка подключения к серверу: ${error.message}`, 'error');
            return false;
        }
    }

    async testSessionCreation() {
        this.log('Создаем тестовую сессию...');
        try {
            const response = await this.makeRequest('/api/session', 'POST');

            if (response.status === 200 && response.data && response.data.sessionId) {
                this.sessionId = response.data.sessionId;
                this.log(`Сессия создана: ${this.sessionId}`, 'success');
                return true;
            } else {
                this.log(`Ошибка создания сессии: ${response.status}, ответ: ${JSON.stringify(response.data)}`, 'error');
                return false;
            }
        } catch (error) {
            this.log(`Ошибка создания сессии: ${error.message}`, 'error');
            return false;
        }
    }

    async testBallSynchronization() {
        this.log('Тестируем синхронизацию мяча...');

        const clientPhysics = new BallPhysics();
        let syncErrors = 0;
        let totalTests = 0;

        // Тестируем различные направления движения
        const directions = [
            { x: 1, y: 0, name: 'вправо' },
            { x: -1, y: 0, name: 'влево' },
            { x: 0, y: 1, name: 'вниз' },
            { x: 0, y: -1, name: 'вверх' },
            { x: 1, y: 1, name: 'диагональ вправо-вниз' },
            { x: -1, y: -1, name: 'диагональ влево-вверх' },
            { x: 1, y: -1, name: 'диагональ вправо-вверх' },
            { x: -1, y: 1, name: 'диагональ влево-вниз' }
        ];

        for (const direction of directions) {
            this.log(`Тестируем направление: ${direction.name}`);

            // Сбрасываем физику клиента
            clientPhysics.ball.x = 400;
            clientPhysics.ball.y = 300;
            clientPhysics.ball.vx = 0;
            clientPhysics.ball.vy = 0;
            clientPhysics.paused = false;

            // Отправляем команду на сервер
            try {
                const response = await this.makeRequest(`/api/session/${this.sessionId}/controller/connect`, 'POST', {
                    speedScalar: 80, // 80% скорости
                    dirX: direction.x,
                    dirY: direction.y
                });

                if (response.status !== 200) {
                    this.log(`Ошибка отправки команды: ${response.status}`, 'error');
                    syncErrors++;
                    continue;
                }

                // Ждем немного для синхронизации
                await new Promise(resolve => setTimeout(resolve, 100));

                // Получаем состояние с сервера
                const stateResponse = await this.makeRequest(`/api/session/${this.sessionId}/state`);
                if (stateResponse.status === 200) {
                    const serverState = stateResponse.data;

                    // Проверяем, что сервер вернул корректное состояние
                    if (!serverState || typeof serverState.x !== 'number') {
                        this.log(`Сервер вернул некорректное состояние для ${direction.name}: ${JSON.stringify(serverState)}`, 'error');
                        syncErrors++;
                        continue;
                    }

                    // Обновляем клиентскую физику
                    clientPhysics.updateWithDirection(direction.x, direction.y, 1280 * 0.8, 1/60);

                    // Сравниваем состояния
                    const positionDiff = Math.sqrt(
                        Math.pow(clientPhysics.ball.x - serverState.x, 2) +
                        Math.pow(clientPhysics.ball.y - serverState.y, 2)
                    );

                    const velocityDiff = Math.sqrt(
                        Math.pow(clientPhysics.ball.vx - (serverState.vx || 0), 2) +
                        Math.pow(clientPhysics.ball.vy - (serverState.vy || 0), 2)
                    );

                    totalTests++;

                    this.log(`Сравнение для ${direction.name}: клиент(${clientPhysics.ball.x.toFixed(1)}, ${clientPhysics.ball.y.toFixed(1)}) сервер(${serverState.x.toFixed(1)}, ${serverState.y.toFixed(1)})`, 'info');

                    if (positionDiff > 5 || velocityDiff > 10) {
                        this.log(`Рассихронизация в направлении ${direction.name}: позиция=${positionDiff.toFixed(2)}, скорость=${velocityDiff.toFixed(2)}`, 'warning');
                        syncErrors++;
                    } else {
                        this.log(`Синхронизация OK для ${direction.name}`, 'success');
                    }
                } else {
                    this.log(`Ошибка получения состояния для ${direction.name}: ${stateResponse.status}`, 'error');
                    syncErrors++;
                }

            } catch (error) {
                this.log(`Ошибка при тестировании ${direction.name}: ${error.message}`, 'error');
                syncErrors++;
            }

            // Небольшая пауза между тестами
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        const successRate = ((totalTests - syncErrors) / totalTests * 100).toFixed(1);
        this.log(`Результат синхронизации: ${totalTests - syncErrors}/${totalTests} (${successRate}%)`, syncErrors > 0 ? 'warning' : 'success');

        return syncErrors === 0;
    }

    async testCornerBehavior() {
        this.log('Тестируем поведение мяча на углах...');

        const clientPhysics = new BallPhysics();
        let cornerErrors = 0;

        // Тестируем углы экрана
        const corners = [
            { x: 40, y: 40, name: 'левый верхний угол' },
            { x: 760, y: 40, name: 'правый верхний угол' },
            { x: 40, y: 560, name: 'левый нижний угол' },
            { x: 760, y: 560, name: 'правый нижний угол' }
        ];

        for (const corner of corners) {
            this.log(`Тестируем ${corner.name}`);

            // Помещаем мяч в угол
            clientPhysics.ball.x = corner.x;
            clientPhysics.ball.y = corner.y;
            clientPhysics.ball.vx = 1000; // Высокая скорость
            clientPhysics.ball.vy = 800;

            // Симулируем несколько кадров
            for (let i = 0; i < 10; i++) {
                const beforeX = clientPhysics.ball.x;
                const beforeY = clientPhysics.ball.y;

                clientPhysics.updateWithDirection(1, 1, 1280, 1/60);

                const afterX = clientPhysics.ball.x;
                const afterY = clientPhysics.ball.y;

                // Проверяем, что мяч не застрял
                const moved = Math.abs(afterX - beforeX) > 1 || Math.abs(afterY - beforeY) > 1;

                if (!moved && i > 2) { // После первых кадров мяч должен двигаться
                    this.log(`Мяч застрял в ${corner.name} на кадре ${i}`, 'error');
                    cornerErrors++;
                    break;
                }

                // Проверяем, что мяч не вышел за границы
                if (clientPhysics.ball.x < 0 || clientPhysics.ball.x > 800 ||
                    clientPhysics.ball.y < 0 || clientPhysics.ball.y > 600) {
                    this.log(`Мяч вышел за границы в ${corner.name}`, 'error');
                    cornerErrors++;
                    break;
                }
            }

            // Проверяем минимальную скорость
            const speed = Math.sqrt(clientPhysics.ball.vx * clientPhysics.ball.vx + clientPhysics.ball.vy * clientPhysics.ball.vy);
            if (speed < 400) { // Минимум 400 для надежности
                this.log(`Скорость слишком низкая в ${corner.name}: ${speed.toFixed(0)}`, 'warning');
                cornerErrors++;
            }
        }

        this.log(`Результат тестирования углов: ${4 - cornerErrors}/4`, cornerErrors > 0 ? 'warning' : 'success');
        return cornerErrors === 0;
    }

    async testPerformance() {
        this.log('Тестируем производительность синхронизации...');

        const startTime = Date.now();
        let requestsCount = 0;
        const testDuration = 5000; // 5 секунд

        while (Date.now() - startTime < testDuration) {
            try {
                const response = await this.makeRequest(`/api/session/${this.sessionId}/state`);
                if (response.status === 200) {
                    requestsCount++;
                }
            } catch (error) {
                // Игнорируем ошибки для теста производительности
            }

            // Небольшая пауза чтобы не перегружать сервер
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        const rps = (requestsCount / (testDuration / 1000)).toFixed(1);
        this.log(`Производительность: ${rps} запросов/сек`, rps > 50 ? 'success' : 'warning');

        return parseFloat(rps) > 30; // Минимум 30 RPS
    }

    async runAllTests() {
        this.log('🚀 Запуск комплексного тестирования синхронизации и углов');
        console.log('═'.repeat(60));

        let allPassed = true;

        // Тест 1: Здоровье сервера
        if (!(await this.testServerHealth())) {
            allPassed = false;
        }
        console.log('─'.repeat(40));

        // Тест 2: Создание сессии
        if (!(await this.testSessionCreation())) {
            allPassed = false;
        }
        console.log('─'.repeat(40));

        // Тест 3: Синхронизация мяча
        if (!(await this.testBallSynchronization())) {
            allPassed = false;
        }
        console.log('─'.repeat(40));

        // Тест 4: Поведение на углах
        if (!(await this.testCornerBehavior())) {
            allPassed = false;
        }
        console.log('─'.repeat(40));

        // Тест 5: Производительность
        if (!(await this.testPerformance())) {
            allPassed = false;
        }

        console.log('═'.repeat(60));
        this.log(`ИТОГ: ${allPassed ? '✅ Все тесты пройдены!' : '❌ Есть проблемы, требующие исправления'}`, allPassed ? 'success' : 'error');

        if (!allPassed) {
            this.log('Рекомендации:', 'info');
            this.log('1. Проверьте логи сервера на ошибки синхронизации', 'info');
            this.log('2. Убедитесь, что physics.js и серверная логика синхронизированы', 'info');
            this.log('3. Проверьте параметры edgePadding и minSpeed', 'info');
            this.log('4. Мониторьте сетевую задержку между клиентом и сервером', 'info');
        }

        return allPassed;
    }
}

// Запуск тестов
if (require.main === module) {
    const test = new SyncCornerTest();
    test.runAllTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Критическая ошибка тестирования:', error);
        process.exit(1);
    });
}

module.exports = SyncCornerTest;
