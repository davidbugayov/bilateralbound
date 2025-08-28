#!/usr/bin/env node

/**
 * Простой тест синхронизации - проверка одного шага синхронизации
 */

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

// Основной тест
async function runSimpleSyncTest() {
    console.log('🔍 ПРОСТОЙ ТЕСТ СИНХРОНИЗАЦИИ');
    console.log('================================\n');

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

    // Шаг 2: Клиент движется к правой границе
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
        console.log('❌ ПРОБЛЕМА: Сервер перезаписал скорость после отскока клиента!');
        return false;
    } else {
        console.log('✅ УСПЕХ: Синхронизация работает правильно');
        return true;
    }
}

// Запуск теста
if (require.main === module) {
    runSimpleSyncTest().then(success => {
        console.log('\n🏁 РЕЗУЛЬТАТ ПРОСТОГО ТЕСТА:');
        if (success) {
            console.log('✅ ПРОСТАЯ СИНХРОНИЗАЦИЯ РАБОТАЕТ!');
            process.exit(0);
        } else {
            console.log('❌ ПРОБЛЕМЫ С ПРОСТОЙ СИНХРОНИЗАЦИЕЙ!');
            process.exit(1);
        }
    }).catch(error => {
        console.error('❌ ОШИБКА ТЕСТИРОВАНИЯ:', error);
        process.exit(1);
    });
}

module.exports = { TestBall, MockSessionManager, runSimpleSyncTest };
