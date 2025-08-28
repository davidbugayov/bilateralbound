#!/usr/bin/env node

/**
 * Тест исправления проблемы sessionId
 * Проверяет, что функция syncBounceToServer может найти sessionId
 */

// Мокаем браузерное окружение
global.window = {
    __current: {},
    console: console
};

// Mock fetch для тестирования
global.fetch = function(url, options) {
    console.log('[MOCK FETCH]', url, options ? JSON.stringify(options.body) : '');
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
    });
};

// Загружаем physics.js как модуль Node.js
const BallPhysics = require('./public/js/physics.js');

console.log('🚀 ТЕСТ ИСПРАВЛЕНИЯ ПРОБЛЕМЫ SESSIONID');
console.log('====================================\n');

// Создаем экземпляр physics
const physics = new BallPhysics();
console.log('✅ BallPhysics создан успешно');

// Проверяем функцию syncBounceToServer
if (typeof physics.syncBounceToServer === 'function') {
    console.log('✅ syncBounceToServer функция доступна');
} else {
    console.error('❌ syncBounceToServer не найден');
    process.exit(1);
}

// Тест 1: Вызов без sessionId (должен выдать предупреждение)
console.log('\n📋 Тест 1: Вызов syncBounceToServer без sessionId');
let warningCount = 0;
const originalWarn = console.warn;
console.warn = function(message) {
    if (message.includes('sessionId не найден')) {
        warningCount++;
    }
    originalWarn.apply(console, arguments);
};

physics.syncBounceToServer();
console.warn = originalWarn;

if (warningCount > 0) {
    console.log('✅ Правильно выдает предупреждение при отсутствии sessionId');
} else {
    console.error('❌ Не выдает предупреждение при отсутствии sessionId');
}

// Тест 2: Установка sessionId и проверка
console.log('\n📋 Тест 2: Установка sessionId');
window.__current.sessionId = 'test-session-123';
console.log('✅ sessionId установлен:', window.__current.sessionId);

// Мокаем fetch для тестирования
let fetchCalled = false;
let fetchUrl = '';
let fetchOptions = null;

global.fetch = function(url, options) {
    fetchCalled = true;
    fetchUrl = url;
    fetchOptions = options;
    console.log('📡 Fetch вызван:', url);
    if (options && options.body) {
        const body = JSON.parse(options.body);
        console.log('📦 Данные отскока:', JSON.stringify(body, null, 2));
    }
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
    });
};

// Вызываем syncBounceToServer с sessionId
physics.syncBounceToServer();

// Проверяем результаты
if (fetchCalled) {
    console.log('✅ Fetch был вызван');
    if (fetchUrl.includes('test-session-123') && fetchUrl.includes('/bounce')) {
        console.log('✅ URL содержит правильный sessionId и endpoint');
    } else {
        console.error('❌ URL некорректный:', fetchUrl);
    }

    if (fetchOptions && fetchOptions.method === 'POST') {
        console.log('✅ HTTP метод правильный (POST)');
    } else {
        console.error('❌ HTTP метод неправильный');
    }

    if (fetchOptions && fetchOptions.body) {
        const body = JSON.parse(fetchOptions.body);
        if (body.x !== undefined && body.vx !== undefined && body.bounced === true) {
            console.log('✅ Данные отскока корректны');
        } else {
            console.error('❌ Данные отскока некорректны');
        }
    }
} else {
    console.error('❌ Fetch не был вызван');
}

// Тест 3: Проверка интеграции с viewer.html
console.log('\n📋 Тест 3: Имитация работы viewer.html');

// Имитируем установку sessionId как в viewer.html
window.__current = {};
window.__current.sessionId = 'viewer-session-456';

// Имитируем отскок
physics.ball.x = 745;
physics.ball.vx = -250;
physics.ball.vy = 0;

// Сбрасываем счетчики
fetchCalled = false;
fetchUrl = '';

// Вызываем syncBounceToServer
physics.syncBounceToServer();

if (fetchCalled && fetchUrl.includes('viewer-session-456')) {
    console.log('✅ Интеграция с viewer.html работает корректно');
} else {
    console.error('❌ Проблемы с интеграцией viewer.html');
}

// Финальный результат
const allTestsPassed = warningCount > 0 && fetchCalled && fetchUrl.includes('test-session-123');

console.log('\n🏁 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
console.log('='.repeat(30));

if (allTestsPassed) {
    console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
    console.log('✅ Проблема sessionId исправлена');
    console.log('✅ syncBounceToServer работает корректно');
    console.log('✅ Интеграция с viewer.html успешна');
    process.exit(0);
} else {
    console.log('❌ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛИЛИСЬ!');
    process.exit(1);
}
