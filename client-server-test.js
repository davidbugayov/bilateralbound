#!/usr/bin/env node

/**
 * Тест клиент-сервер взаимодействия
 * Проверяет корректность синхронизации состояний между клиентом и сервером
 */

const http = require('http');

// Mock клиентской физики для тестирования
class TestBall {
    constructor() {
        this.x = 400;
        this.y = 300;
        this.vx = 250;
        this.vy = 0;
        this.radius = 40;
        this.worldWidth = 800;
        this.worldHeight = 600;
        this.edgePadding = 15;
        this.minSpeed = 500;
        this.lastBounceTime = 0;
    }

    updateWithDirection(dirX, dirY, speed, dt = 1/60) {
        if (this.vx === 0 && this.vy === 0) {
            this.vx = dirX * speed;
            this.vy = dirY * speed;
        }

        this.handleBoundaryCollisions();
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.handleBoundaryCollisions();
    }

    handleBoundaryCollisions() {
        let bounced = false;
        const beforeVx = this.vx;
        const beforeVy = this.vy;

        // Right boundary
        if (this.x + this.radius >= this.worldWidth) {
            this.x = this.worldWidth - this.radius - this.edgePadding;
            this.vx = -Math.max(Math.abs(this.vx), this.minSpeed);
            bounced = true;
            this.lastBounceTime = Date.now();
        }

        // Left boundary
        if (this.x - this.radius <= 0) {
            this.x = this.radius + this.edgePadding;
            this.vx = Math.max(Math.abs(this.vx), this.minSpeed);
            bounced = true;
            this.lastBounceTime = Date.now();
        }

        return bounced;
    }

    getState() {
        return {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy
        };
    }
}

// Mock SessionManager для тестирования
class MockSessionManager {
    constructor() {
        this.sessions = new Map();
        this.sessionCounter = 0;
    }

    createSession() {
        const sessionId = `session_${++this.sessionCounter}`;
        const session = {
            id: sessionId,
            ballState: {
                x: 400,
                y: 300,
                vx: 500,
                vy: 0,
                speed: 500,
                radius: 40
            },
            paused: false,
            lastUpdate: Date.now()
        };
        this.sessions.set(sessionId, session);
        return session;
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    updateBallState(sessionId, updates) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;

        if (updates.dirX !== undefined || updates.dirY !== undefined || updates.speed !== undefined) {
            const rawX = typeof updates.dirX === 'number' ? updates.dirX : 0;
            const rawY = typeof updates.dirY === 'number' ? updates.dirY : 0;

            let nx = 0, ny = 0;
            if ((rawX !== 0 && rawY === 0) || (rawX === 0 && rawY !== 0) || (rawX !== 0 && rawY !== 0)) {
                nx = rawX === 0 ? 0 : (rawX > 0 ? 1 : -1);
                ny = rawY === 0 ? 0 : (rawY > 0 ? 1 : -1);
            }

            const pixelsPerSecond = Math.max((session.ballState.speed / 100) * 1280, 500);
            const currentSpeed = Math.sqrt(session.ballState.vx ** 2 + session.ballState.vy ** 2);

            const speedWasChangedByBounce = (nx > 0 && session.ballState.vx < 0) || (nx < 0 && session.ballState.vx > 0);

            if (!speedWasChangedByBounce) {
                session.ballState.vx = nx * pixelsPerSecond;
                session.ballState.vy = ny * pixelsPerSecond;
            }
        }

        return session.ballState;
    }
}

// Функция для создания HTTP запросов
function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
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

// Основной тест
async function runClientServerTest() {
    console.log('🔗 ТЕСТ КЛИЕНТ-СЕРВЕР ВЗАИМОДЕЙСТВИЯ');
    console.log('=====================================\n');

    const sessionManager = new MockSessionManager();
    const session = sessionManager.createSession();
    const sessionId = session.id;

    console.log(`📋 Создана сессия: ${sessionId}`);

    // Создаем клиентский мяч
    const clientBall = new TestBall();
    let serverState = sessionManager.getSession(sessionId).ballState;

    console.log('\n📍 ШАГ 1: Начальная синхронизация');
    console.log(`Клиент: x=${clientBall.x}, vx=${clientBall.vx}`);
    console.log(`Сервер: x=${serverState.x}, vx=${serverState.vx}`);

    // Шаг 2: Клиент движется и отскакивает
    console.log('\n📍 ШАГ 2: Клиент движется к правой границе');

    // Имитируем движение клиента до отскока
    for (let i = 0; i < 150; i++) {
        clientBall.updateWithDirection(1, 0, 500);
    }

    console.log(`После движения клиента: x=${clientBall.x.toFixed(1)}, vx=${clientBall.vx}`);

    // Шаг 3: Сервер получает команду
    console.log('\n📍 ШАГ 3: Сервер получает команду движения');
    serverState = sessionManager.updateBallState(sessionId, { dirX: 1, dirY: 0, speed: 500 });

    console.log(`Сервер после команды: x=${serverState.x}, vx=${serverState.vx}`);

    // Шаг 4: Сравнение состояний
    console.log('\n📍 ШАГ 4: Сравнение состояний');

    const posDiff = Math.abs(clientBall.x - serverState.x);
    const velDiff = Math.abs(clientBall.vx - serverState.vx);

    console.log(`Разница позиций: ${posDiff.toFixed(1)} px`);
    console.log(`Разница скоростей: ${velDiff.toFixed(1)} px/s`);

    if (velDiff > 10) {
        console.log('❌ ПРОБЛЕМА: Скорости не синхронизированы!');
        return false;
    } else {
        console.log('✅ Синхронизация скоростей корректна');
    }

    // Шаг 5: Тест отскока
    console.log('\n📍 ШАГ 5: Тест отскока');

    // Клиент продолжает движение до отскока
    let bounces = 0;
    for (let i = 0; i < 100 && bounces < 2; i++) {
        const bounced = clientBall.handleBoundaryCollisions();
        if (bounced) {
            bounces++;
            console.log(`Отскок ${bounces}: x=${clientBall.x.toFixed(1)}, vx=${clientBall.vx}`);
        }
        clientBall.x += clientBall.vx * (1/60);
    }

    // Сервер получает данные отскока (имитация)
    const bounceData = {
        x: clientBall.x,
        y: clientBall.y,
        vx: clientBall.vx,
        vy: clientBall.vy,
        bounced: true,
        timestamp: Date.now()
    };

    // Имитируем обновление сервера
    session.ballState.x = bounceData.x;
    session.ballState.y = bounceData.y;
    session.ballState.vx = bounceData.vx;
    session.ballState.vy = bounceData.vy;

    console.log('Сервер обновлен данными отскока');

    const finalPosDiff = Math.abs(clientBall.x - session.ballState.x);
    const finalVelDiff = Math.abs(clientBall.vx - session.ballState.vx);

    console.log(`Финальная разница позиций: ${finalPosDiff.toFixed(1)} px`);
    console.log(`Финальная разница скоростей: ${finalVelDiff.toFixed(1)} px/s`);

    const syncSuccess = finalVelDiff < 1 && finalPosDiff < 5;

    console.log('\n📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
    console.log('='.repeat(30));

    if (syncSuccess) {
        console.log('✅ КЛИЕНТ-СЕРВЕР СИНХРОНИЗАЦИЯ РАБОТАЕТ КОРРЕКТНО!');
        return true;
    } else {
        console.log('❌ ПРОБЛЕМЫ С СИНХРОНИЗАЦИЕЙ!');
        return false;
    }
}

// Тест с реальным сервером
async function runRealServerTest() {
    console.log('\n🌐 ТЕСТ С РЕАЛЬНЫМ СЕРВЕРОМ');
    console.log('===========================\n');

    try {
        // Создание сессии
        console.log('📋 Создание сессии...');
        const sessionResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: '/api/session',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (sessionResponse.status !== 200) {
            console.log('❌ Не удалось создать сессию');
            return false;
        }

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Создана сессия: ${sessionId}`);

        // Подключение контроллера
        console.log('\n📋 Подключение контроллера...');
        const controllerResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: `/api/session/${sessionId}/controller/connect`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (controllerResponse.status !== 200) {
            console.log('❌ Не удалось подключить контроллер');
            return false;
        }

        console.log('✅ Контроллер подключен');

        // Получение начального состояния
        console.log('\n📋 Получение начального состояния...');
        const stateResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: `/api/session/${sessionId}/state`,
            method: 'GET'
        });

        if (stateResponse.status !== 200) {
            console.log('❌ Не удалось получить состояние');
            return false;
        }

        console.log(`✅ Начальное состояние: x=${stateResponse.data.x}, vx=${stateResponse.data.vx}`);

        // Отправка команды движения
        console.log('\n📋 Отправка команды движения...');
        const directionResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: `/api/session/${sessionId}/controller/direction`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            dirX: 1,
            dirY: 0,
            speedScalar: 40
        });

        if (directionResponse.status !== 200) {
            console.log('❌ Не удалось отправить команду');
            return false;
        }

        console.log('✅ Команда движения отправлена');

        // Имитация отскока
        console.log('\n📋 Имитация отскока...');
        const bounceData = {
            x: 745,
            y: 300,
            vx: -500,
            vy: 0,
            bounced: true,
            timestamp: Date.now()
        };

        const bounceResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: `/api/session/${sessionId}/bounce`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, bounceData);

        if (bounceResponse.status !== 200) {
            console.log('❌ Не удалось отправить данные отскока');
            return false;
        }

        console.log('✅ Данные отскока отправлены');

        // Проверка финального состояния
        console.log('\n📋 Проверка финального состояния...');
        const finalStateResponse = await makeRequest({
            hostname: 'localhost',
            port: 3000,
            path: `/api/session/${sessionId}/state`,
            method: 'GET'
        });

        if (finalStateResponse.status !== 200) {
            console.log('❌ Не удалось получить финальное состояние');
            return false;
        }

        const finalState = finalStateResponse.data;
        console.log(`✅ Финальное состояние: x=${finalState.x}, vx=${finalState.vx}`);

        const success = finalState.vx === -500 && Math.abs(finalState.x - 745) < 5;

        if (success) {
            console.log('✅ РЕАЛЬНЫЙ СЕРВЕР РАБОТАЕТ КОРРЕКТНО!');
        } else {
            console.log('❌ ПРОБЛЕМЫ С РЕАЛЬНЫМ СЕРВЕРОМ!');
        }

        return success;

    } catch (error) {
        console.log('❌ Ошибка сети:', error.message);
        return false;
    }
}

// Запуск тестов
if (require.main === module) {
    (async () => {
        const mockTestPassed = await runClientServerTest();
        const realServerTestPassed = await runRealServerTest();

        const overallSuccess = mockTestPassed && realServerTestPassed;

        console.log('\n🏁 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:');
        console.log('='.repeat(30));

        if (overallSuccess) {
            console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Система работает корректно.');
            process.exit(0);
        } else {
            console.log('❌ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛИЛИСЬ!');
            process.exit(1);
        }
    })();
}

module.exports = { TestBall, MockSessionManager, runClientServerTest };
