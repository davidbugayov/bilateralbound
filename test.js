#!/usr/bin/env node

/**
 * Основной тест для физики мячика
 * Проверяет корректность отскоков и граничных условий
 */

// Импорт физики мячика (используем Node.js версию для тестов)
const BallPhysics = require('./test-physics.js');

// Настройки теста
const TEST_WORLD_WIDTH = 800;
const TEST_WORLD_HEIGHT = 600;
const TEST_BALL_RADIUS = 40;
const TEST_MIN_SPEED = 500;
const TEST_EDGE_PADDING = 15;

// Тестовая функция
function simulateMovement(physics, direction, frames = 100) {
    const beforeUpdate = {
        x: physics.ball.x,
        y: physics.ball.y,
        vx: physics.ball.vx,
        vy: physics.ball.vy
    };

    // Имитируем несколько кадров движения
    for (let i = 0; i < frames; i++) {
        physics.updateWithDirection(direction.x, direction.y, TEST_MIN_SPEED);
    }

    const afterUpdate = {
        x: physics.ball.x,
        y: physics.ball.y,
        vx: physics.ball.vx,
        vy: physics.ball.vy
    };

    // Проверяем, был ли отскок
    const bounced = beforeUpdate.vx !== afterUpdate.vx || beforeUpdate.vy !== afterUpdate.vy;

    return { beforeUpdate, afterUpdate, bounced };
}

function runBasicTest() {
    console.log('🎾 ТЕСТИРОВАНИЕ ФИЗИКИ МЯЧИКА\n');
    console.log('='.repeat(40));

    // Создаем экземпляр физики
    const physics = new BallPhysics();
    physics.setWorldSize(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
    physics.setPosition(TEST_WORLD_WIDTH / 2, TEST_WORLD_HEIGHT / 2); // Начинаем с центра
    physics.setPaused(false); // Снимаем паузу для теста

    console.log('📍 Тест 1: Движение вправо до правой границы');
    console.log(`Начальная позиция: (${physics.ball.x}, ${physics.ball.y})`);

    // Двигаемся вправо до границы
    const result1 = simulateMovement(physics, { x: 1, y: 0 }, 200);

    console.log(`После движения: (${result1.afterUpdate.x.toFixed(1)}, ${result1.afterUpdate.y.toFixed(1)})`);
    console.log(`Скорость: vx=${result1.afterUpdate.vx.toFixed(1)}, vy=${result1.afterUpdate.vy.toFixed(1)}`);
    console.log(`Отскок: ${result1.bounced ? '✅' : '❌'}`);

    // Проверяем границы
    const minX = TEST_BALL_RADIUS + TEST_EDGE_PADDING;
    const maxX = TEST_WORLD_WIDTH - TEST_BALL_RADIUS - TEST_EDGE_PADDING;
    const minY = TEST_BALL_RADIUS + TEST_EDGE_PADDING;
    const maxY = TEST_WORLD_HEIGHT - TEST_BALL_RADIUS - TEST_EDGE_PADDING;

    const inBounds = result1.afterUpdate.x >= minX && result1.afterUpdate.x <= maxX &&
                    result1.afterUpdate.y >= minY && result1.afterUpdate.y <= maxY;

    console.log(`В границах: ${inBounds ? '✅' : '❌'}`);
    console.log(`Ожидаемая скорость при отскоке: vx <= -${TEST_MIN_SPEED}, actual: ${result1.afterUpdate.vx.toFixed(1)}`);

    const correctBounce = result1.bounced && result1.afterUpdate.vx <= -TEST_MIN_SPEED && inBounds;

    console.log('\n📍 Тест 2: Движение влево после отскока');

    // Теперь двигаемся влево
    const result2 = simulateMovement(physics, { x: -1, y: 0 }, 200);

    console.log(`После движения: (${result2.afterUpdate.x.toFixed(1)}, ${result2.afterUpdate.y.toFixed(1)})`);
    console.log(`Скорость: vx=${result2.afterUpdate.vx.toFixed(1)}, vy=${result2.afterUpdate.vy.toFixed(1)}`);
    console.log(`Отскок: ${result2.bounced ? '✅' : '❌'}`);

    const correctBounce2 = result2.bounced && result2.afterUpdate.vx >= TEST_MIN_SPEED;

    console.log('\n📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
    console.log('='.repeat(30));

    if (correctBounce && correctBounce2) {
        console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! Физика работает корректно.');
    } else {
        console.log('❌ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛИЛИСЬ!');
        console.log(`Тест 1 (отскок вправо): ${correctBounce ? '✅' : '❌'}`);
        console.log(`Тест 2 (отскок влево): ${correctBounce2 ? '✅' : '❌'}`);
    }

    return correctBounce && correctBounce2;
}

function runDiagnosticTest() {
    console.log('\n🔍 ДИАГНОСТИЧЕСКИЙ ТЕСТ');
    console.log('='.repeat(30));

    const physics = new BallPhysics();
    physics.setWorldSize(TEST_WORLD_WIDTH, TEST_WORLD_HEIGHT);
    physics.setPosition(TEST_BALL_RADIUS + TEST_EDGE_PADDING, TEST_WORLD_HEIGHT / 2);
    physics.setPaused(false); // Снимаем паузу для теста

    console.log('Проверяем реакцию на различные сценарии...');

    // Тест 1: Нормальное движение
    console.log('\n1. Нормальное движение вправо:');
    const result1 = simulateMovement(physics, { x: 1, y: 0 }, 50);
    console.log(`   Позиция: ${result1.afterUpdate.x.toFixed(1)}, Скорость: ${result1.afterUpdate.vx.toFixed(1)}`);

    // Тест 2: Резкая смена направления
    console.log('\n2. Резкая смена направления:');
    const result2 = simulateMovement(physics, { x: -1, y: 0 }, 50);
    console.log(`   Позиция: ${result2.afterUpdate.x.toFixed(1)}, Скорость: ${result2.afterUpdate.vx.toFixed(1)}`);

    // Тест 3: Диагональное движение
    console.log('\n3. Диагональное движение:');
    physics.setPosition(TEST_WORLD_WIDTH / 2, TEST_WORLD_HEIGHT / 2);
    physics.setPaused(false); // Снимаем паузу для теста
    const result3 = simulateMovement(physics, { x: 1, y: 1 }, 30);
    console.log(`   Позиция: (${result3.afterUpdate.x.toFixed(1)}, ${result3.afterUpdate.y.toFixed(1)})`);
    console.log(`   Скорость: (${result3.afterUpdate.vx.toFixed(1)}, ${result3.afterUpdate.vy.toFixed(1)})`);

    console.log('\n✅ Диагностика завершена');
}

// Запуск тестов
if (require.main === module) {
    const success = runBasicTest();
    runDiagnosticTest();

    console.log('\n🏁 ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
    process.exit(success ? 0 : 1);
}

module.exports = { runBasicTest, runDiagnosticTest, simulateMovement };
