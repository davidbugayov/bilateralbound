#!/usr/bin/env node

/**
 * Тест чистой логики расчета скорости без сервера
 */

// Функция, имитирующая логику session-manager.js
function calculateSpeed(speedScalar, direction) {
    console.log(`\n=== Расчет для ${speedScalar}% в направлении (${direction.x}, ${direction.y}) ===`);

    // Имитация логики из session-manager.js
    const basePixelsPerSecond = (speedScalar / 100) * 1280;
    const minSpeedForPrevention = speedScalar >= 30 ? 300 : 0;
    const pixelsPerSecond = Math.max(basePixelsPerSecond, minSpeedForPrevention);

    console.log(`Базовая скорость: (${speedScalar}/100) * 1280 = ${basePixelsPerSecond} px/s`);
    console.log(`Минимальная скорость: ${minSpeedForPrevention} px/s`);
    console.log(`Итоговая скорость: max(${basePixelsPerSecond}, ${minSpeedForPrevention}) = ${pixelsPerSecond} px/s`);

    // Применяем направление
    const vx = direction.x * pixelsPerSecond;
    const vy = direction.y * pixelsPerSecond;
    const totalSpeed = Math.sqrt(vx * vx + vy * vy);

    console.log(`Применение направления:`);
    console.log(`  vx = ${direction.x} * ${pixelsPerSecond} = ${vx}`);
    console.log(`  vy = ${direction.y} * ${pixelsPerSecond} = ${vy}`);
    console.log(`  Общая скорость = sqrt(${vx}² + ${vy}²) = ${totalSpeed.toFixed(1)} px/s`);

    return { vx, vy, totalSpeed, pixelsPerSecond };
}

function testAllSpeeds() {
    console.log('🧪 ТЕСТИРОВАНИЕ ЛОГИКИ РАСЧЕТА СКОРОСТИ\n');

    const speeds = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const directions = [
        { name: 'вправо', x: 1, y: 0 },
        { name: 'диагональ', x: 1, y: 1 }
    ];

    console.log('Формула: скорость = max((процент/100) * 1280, минимум)');
    console.log('Для < 30%: минимум = 0');
    console.log('Для >= 30%: минимум = 300\n');

    for (const speed of speeds) {
        for (const direction of directions) {
            const result = calculateSpeed(speed, direction);

            const expected = (speed / 100) * 1280;
            const actual = result.totalSpeed;
            const accuracy = Math.abs(actual - expected) / expected * 100;

            console.log(`Ожидалось: ${expected.toFixed(1)} px/s`);
            console.log(`Получено: ${actual.toFixed(1)} px/s`);
            console.log(`Точность: ${accuracy.toFixed(1)}%`);

            if (accuracy > 5) {
                console.log(`⚠️  РАСХОЖДЕНИЕ: ${Math.abs(actual - expected).toFixed(1)} px/s`);
            } else {
                console.log(`✅ ПРИЕМЛЕМО`);
            }
            console.log('');
        }
    }
}

function testEdgeCases() {
    console.log('🎯 ТЕСТИРОВАНИЕ КРАЙНИХ СЛУЧАЕВ\n');

    const testCases = [
        { speed: 1, direction: { name: 'вправо', x: 1, y: 0 } },
        { speed: 5, direction: { name: 'диагональ', x: 1, y: 1 } },
        { speed: 25, direction: { name: 'вверх', x: 0, y: -1 } },
        { speed: 29, direction: { name: 'влево', x: -1, y: 0 } },
        { speed: 31, direction: { name: 'диагональ', x: -1, y: 1 } }
    ];

    for (const testCase of testCases) {
        calculateSpeed(testCase.speed, testCase.direction);
    }
}

// Запуск тестов
testAllSpeeds();
testEdgeCases();

console.log('\n📋 ВЫВОДЫ:');
console.log('Если логика показывает правильные значения - проблема в другом месте');
console.log('Если логика показывает неправильные значения - нужно исправить формулу');

