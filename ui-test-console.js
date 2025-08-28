#!/usr/bin/env node

/**
 * Консольный тест UI - симуляция поведения мяча в консоли
 * Проверяет корректность отображения и логики без браузера
 */

// Импорт физики
const BallPhysics = require('./test-physics.js');

// Класс для отслеживания "залипаний"
class StuckDetector {
    constructor() {
        this.lastPosition = { x: 0, y: 0 };
        this.lastMoveTime = Date.now();
        this.stuckThreshold = 2000; // 2 секунды без движения = залипание
        this.positionThreshold = 5; // 5 пикселей минимальное движение
    }

    update(x, y) {
        const now = Date.now();
        const distance = Math.sqrt(
            Math.pow(x - this.lastPosition.x, 2) +
            Math.pow(y - this.lastPosition.y, 2)
        );

        if (distance > this.positionThreshold) {
            this.lastMoveTime = now;
            this.lastPosition = { x, y };
        }

        return now - this.lastMoveTime > this.stuckThreshold;
    }

    getStuckTime() {
        return Date.now() - this.lastMoveTime;
    }
}

// Основной класс теста мяча
class TestBall {
    constructor(worldWidth = 800, worldHeight = 600) {
        this.physics = new BallPhysics();
        this.physics.setWorldSize(worldWidth, worldHeight);
        this.physics.setPosition(worldWidth / 2, worldHeight / 2);
        this.physics.setPaused(false);

        this.stuckDetector = new StuckDetector();
        this.frameCount = 0;
        this.bounceCount = 0;
        this.lastBounceTime = 0;

        console.log(`🎾 Тестовый мяч создан: ${worldWidth}x${worldHeight}`);
    }

    simulateFrame(direction, speed = 500) {
        this.frameCount++;

        // Запоминаем позицию до обновления
        const beforeX = this.physics.ball.x;
        const beforeY = this.physics.ball.y;
        const beforeVx = this.physics.ball.vx;
        const beforeVy = this.physics.ball.vy;

        // Обновляем физику
        this.physics.updateWithDirection(direction.x, direction.y, speed);

        // Проверяем отскок
        const bounced = (beforeVx !== this.physics.ball.vx) || (beforeVy !== this.physics.ball.vy);

        if (bounced) {
            this.bounceCount++;
            this.lastBounceTime = Date.now();
            console.log(`🏓 Отскок ${this.bounceCount}: (${beforeX.toFixed(1)}, ${beforeY.toFixed(1)}) → (${this.physics.ball.x.toFixed(1)}, ${this.physics.ball.y.toFixed(1)})`);
        }

        // Проверяем залипание
        const isStuck = this.stuckDetector.update(this.physics.ball.x, this.physics.ball.y);

        if (isStuck) {
            console.log(`🚨 ЗАЛИПАНИЕ ОБНАРУЖЕНО! Мяч не движется ${this.stuckDetector.getStuckTime()}мс`);
            return false;
        }

        return true;
    }

    runTest(frames = 300, direction = { x: 1, y: 0 }) {
        console.log(`\n▶️ ЗАПУСК ТЕСТА: ${frames} кадров, направление (${direction.x}, ${direction.y})`);
        console.log('='.repeat(50));

        let success = true;
        const startTime = Date.now();

        for (let i = 0; i < frames && success; i++) {
            success = this.simulateFrame(direction);

            // Выводим статус каждые 50 кадров
            if (i % 50 === 0) {
                console.log(`📊 Кадр ${i}: pos=(${this.physics.ball.x.toFixed(1)}, ${this.physics.ball.y.toFixed(1)}), vel=(${this.physics.ball.vx.toFixed(1)}, ${this.physics.ball.vy.toFixed(1)})`);
            }
        }

        const duration = Date.now() - startTime;

        console.log('\n📈 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
        console.log('='.repeat(30));
        console.log(`Время выполнения: ${duration}мс`);
        console.log(`Всего кадров: ${this.frameCount}`);
        console.log(`Отскоков: ${this.bounceCount}`);
        console.log(`Средняя частота кадров: ${(this.frameCount / (duration / 1000)).toFixed(1)} FPS`);

        if (success) {
            console.log('✅ ТЕСТ ПРОЙДЕН: Мяч движется корректно');
        } else {
            console.log('❌ ТЕСТ ПРОВАЛЕН: Обнаружено залипание');
        }

        return success;
    }

    runMultipleDirectionsTest() {
        console.log('\n🔄 ТЕСТ РАЗЛИЧНЫХ НАПРАВЛЕНИЙ');
        console.log('='.repeat(40));

        const directions = [
            { name: 'Вправо', dir: { x: 1, y: 0 } },
            { name: 'Влево', dir: { x: -1, y: 0 } },
            { name: 'Вверх', dir: { x: 0, y: -1 } },
            { name: 'Вниз', dir: { x: 0, y: 1 } },
            { name: 'Диагональ ↗', dir: { x: 1, y: -1 } },
            { name: 'Диагональ ↙', dir: { x: -1, y: 1 } }
        ];

        let allPassed = true;

        for (const { name, dir } of directions) {
            console.log(`\n🎯 Тестируем: ${name}`);

            // Сбрасываем мяч в центр
            this.physics.setPosition(this.physics.world.width / 2, this.physics.world.height / 2);
            this.physics.ball.vx = 0;
            this.physics.ball.vy = 0;
            this.stuckDetector = new StuckDetector();

            const passed = this.runTest(100, dir);
            allPassed = allPassed && passed;

            if (!passed) {
                console.log(`❌ Направление ${name} провалено`);
            }
        }

        console.log('\n🎉 ИТОГОВЫЙ РЕЗУЛЬТАТ:');
        if (allPassed) {
            console.log('✅ ВСЕ НАПРАВЛЕНИЯ ПРОЙДЕНЫ!');
        } else {
            console.log('❌ НЕКОТОРЫЕ НАПРАВЛЕНИЯ ПРОВАЛЕНЫ!');
        }

        return allPassed;
    }
}

// Основная функция
function main() {
    console.log('🎮 КОНСОЛЬНЫЙ UI ТЕСТ');
    console.log('Проверка работы физики мяча без браузера\n');

    const testBall = new TestBall();

    // Тест 1: Базовый тест движения
    const basicTestPassed = testBall.runTest(200, { x: 1, y: 0 });

    // Тест 2: Тест различных направлений
    const directionsTestPassed = testBall.runMultipleDirectionsTest();

    // Итоговый результат
    const overallSuccess = basicTestPassed && directionsTestPassed;

    console.log('\n🏁 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:');
    console.log('='.repeat(30));

    if (overallSuccess) {
        console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Физика работает корректно.');
        process.exit(0);
    } else {
        console.log('❌ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛЕНЫ!');
        process.exit(1);
    }
}

// Запуск
if (require.main === module) {
    main();
}

module.exports = { TestBall, StuckDetector };
