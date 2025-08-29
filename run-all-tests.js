#!/usr/bin/env node

/**
 * Скрипт для запуска всех тестов проекта
 */

const { spawn } = require('child_process');
const path = require('path');

const tests = [
    { name: 'Базовая синхронизация', file: 'test-basic-sync.js' },
    { name: 'Простая логика скорости', file: 'test-simple-speed.js' },
    { name: 'Физика углов', file: 'test-physics-corner.js' },
    { name: 'Комплексное тестирование', file: 'test-latency-sync.js' },
    { name: 'Синхронизация и углы', file: 'sync-corner-test.js' }
];

async function runTest(testName, testFile) {
    return new Promise((resolve) => {
        console.log(`\n🚀 Запуск: ${testName}`);
        console.log('═'.repeat(50));

        const testProcess = spawn('node', [testFile], {
            cwd: process.cwd(),
            stdio: 'inherit'
        });

        testProcess.on('close', (code) => {
            const status = code === 0 ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН';
            console.log(`\n${status}: ${testName} (код выхода: ${code})`);
            console.log('═'.repeat(50));
            resolve(code === 0);
        });

        testProcess.on('error', (error) => {
            console.log(`❌ Ошибка запуска ${testName}: ${error.message}`);
            resolve(false);
        });
    });
}

async function runAllTests() {
    console.log('🧪 ЗАПУСК ВСЕХ ТЕСТОВ ПРОЕКТА');
    console.log('═'.repeat(60));

    const results = [];
    let totalTime = Date.now();

    for (const test of tests) {
        const testFilePath = path.join(process.cwd(), test.file);

        // Проверяем существование файла
        try {
            require.resolve(testFilePath);
        } catch (error) {
            console.log(`\n⚠️  Тест пропущен: ${test.name} (файл не найден: ${test.file})`);
            results.push({ name: test.name, passed: false, skipped: true });
            continue;
        }

        const passed = await runTest(test.name, test.file);
        results.push({ name: test.name, passed, skipped: false });
    }

    totalTime = Date.now() - totalTime;

    // Итоговый отчет
    console.log('\n' + '═'.repeat(60));
    console.log('📋 ИТОГОВЫЙ ОТЧЕТ ТЕСТИРОВАНИЯ');
    console.log('═'.repeat(60));

    let passedCount = 0;
    let skippedCount = 0;

    results.forEach(result => {
        if (result.skipped) {
            console.log(`⚠️  ПРОПУЩЕН: ${result.name}`);
            skippedCount++;
        } else {
            const status = result.passed ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН';
            console.log(`${status}: ${result.name}`);
            if (result.passed) passedCount++;
        }
    });

    const totalTests = results.length - skippedCount;
    const successRate = totalTests > 0 ? ((passedCount / totalTests) * 100).toFixed(1) : '0';

    console.log('\n📊 СТАТИСТИКА:');
    console.log(`   Всего тестов: ${results.length}`);
    console.log(`   Пройдено: ${passedCount}/${totalTests} (${successRate}%)`);
    console.log(`   Пропущено: ${skippedCount}`);
    console.log(`   Общее время: ${(totalTime / 1000).toFixed(1)}s`);

    console.log('\n' + '═'.repeat(60));

    if (passedCount === totalTests && skippedCount === 0) {
        console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! ПРОЕКТ ГОТОВ К ПРОДАКШЕНУ!');
    } else if (passedCount === totalTests) {
        console.log('✅ Все доступные тесты пройдены!');
    } else {
        console.log('⚠️  Некоторые тесты провалены. Требуется исправление.');
    }

    console.log('═'.repeat(60));

    // Возвращаем код выхода
    const exitCode = (passedCount === totalTests) ? 0 : 1;
    process.exit(exitCode);
}

// Запуск всех тестов
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests, runTest };

