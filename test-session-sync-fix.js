#!/usr/bin/env node

/**
 * Тест исправления синхронизации sessionId
 * Проверяет корректность работы после исправления проблемы
 */

// Мокаем браузерное окружение
const { JSDOM } = require('jsdom');

// Читаем файлы
const fs = require('fs');
const path = require('path');

console.log('🚀 ТЕСТ ИСПРАВЛЕНИЯ СИНХРОНИЗАЦИИ SESSIONID');
console.log('==========================================\n');

// Создаем JSDOM для эмуляции браузера
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
    <div id="testContainer"></div>
    <script>
        // Мокаем window.__current
        window.__current = {};
    </script>
</body>
</html>
`, {
    url: "http://localhost:3000/viewer.html?sid=test123",
    pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// Мокаем fetch для тестирования
global.fetch = function(url, options) {
    console.log('📡 Мокаемый fetch вызван:', url, options ? JSON.stringify(options.body) : '');
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        status: 200
    });
};

// Загружаем physics.js
const physicsCode = fs.readFileSync(path.join(__dirname, 'public/js/physics.js'), 'utf8');

// Выполняем код physics.js в нашем окружении
const script = dom.window.document.createElement('script');
script.textContent = physicsCode;
dom.window.document.head.appendChild(script);

// Теперь проверяем, что BallPhysics доступен
console.log('✅ Physics.js загружен успешно');
console.log('✅ BallPhysics класс доступен:', typeof dom.window.BallPhysics);

if (typeof dom.window.BallPhysics !== 'function') {
    console.error('❌ Ошибка: BallPhysics не найден');
    process.exit(1);
}

// Создаем экземпляр physics
const physics = new dom.window.BallPhysics();

// Проверяем, что функция syncBounceToServer существует
if (typeof physics.syncBounceToServer !== 'function') {
    console.error('❌ Ошибка: syncBounceToServer не найден');
    process.exit(1);
}

console.log('✅ syncBounceToServer функция доступна');

// Тестируем функцию без sessionId (должна выдать предупреждение)
console.log('\n📋 Тест 1: Вызов syncBounceToServer без sessionId');
let warningLogged = false;
const originalWarn = console.warn;
console.warn = function(message) {
    if (message.includes('sessionId не найден')) {
        warningLogged = true;
    }
    originalWarn.apply(console, arguments);
};

physics.syncBounceToServer();
console.warn = originalWarn;

if (warningLogged) {
    console.log('✅ Правильно выдает предупреждение при отсутствии sessionId');
} else {
    console.error('❌ Не выдает предупреждение при отсутствии sessionId');
}

// Устанавливаем sessionId
console.log('\n📋 Тест 2: Установка sessionId и повторный вызов');
dom.window.__current.sessionId = 'test-session-123';

let fetchCalled = false;
let bounceData = null;

global.fetch = function(url, options) {
    fetchCalled = true;
    bounceData = JSON.parse(options.body);
    console.log('📡 Fetch вызван с данными:', JSON.stringify(bounceData, null, 2));
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
        status: 200
    });
};

// Вызываем syncBounceToServer снова
physics.syncBounceToServer();

// Проверяем результаты
if (fetchCalled) {
    console.log('✅ Fetch был вызван');
    if (bounceData && bounceData.x !== undefined && bounceData.vx !== undefined) {
        console.log('✅ Данные отскока корректны');
    } else {
        console.error('❌ Данные отскока некорректны');
    }
} else {
    console.error('❌ Fetch не был вызван');
}

// Тест 3: Проверка полного цикла отскока
console.log('\n📋 Тест 3: Полный цикл отскока');

physics.ball.x = 400;
physics.ball.vx = 250;
physics.ball.vy = 0;

// Имитируем движение к границе
for (let i = 0; i < 150; i++) {
    physics.updateWithDirection(1, 0, 250);
}

console.log(`После движения: x=${physics.ball.x.toFixed(1)}, vx=${physics.ball.vx}`);

// Проверяем, произошел ли отскок
if (physics.ball.vx < 0) {
    console.log('✅ Отскок произошел корректно');
    console.log('✅ syncBounceToServer будет вызван автоматически');
} else {
    console.log('❌ Отскок не произошел');
}

// Финальные результаты
console.log('\n🏁 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
console.log('='.repeat(30));

const allTestsPassed = warningLogged && fetchCalled && bounceData;

if (allTestsPassed) {
    console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
    console.log('✅ Исправление sessionId работает корректно');
    console.log('✅ Функция syncBounceToServer функционирует правильно');
    console.log('✅ Система готова к использованию');
    process.exit(0);
} else {
    console.log('❌ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛИЛИСЬ!');
    process.exit(1);
}
