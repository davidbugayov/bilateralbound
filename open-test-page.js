#!/usr/bin/env node

const { exec } = require('child_process');
const http = require('http');

async function checkServer() {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3000/health', (res) => {
            resolve(res.statusCode === 200);
        }).on('error', () => resolve(false));
        
        setTimeout(() => resolve(false), 3000);
    });
}

async function openTestPage() {
    console.log('🧪 ОТКРЫТИЕ ТЕСТОВОЙ СТРАНИЦЫ SESSIONPOLLER');
    console.log('═'.repeat50);
    
    // Проверяем сервер
    const serverOk = await checkServer();
    if (!serverOk) {
        console.log('❌ Сервер недоступен. Запустите: npm start');
        process.exit(1);
    }
    
    console.log('✅ Сервер работает');
    console.log('📄 Открываем: http://localhost:3000/test-session-poller.html');
    
    // Открываем в браузере
    const url = 'http://localhost:3000/test-session-poller.html';
    
    try {
        if (process.platform === 'darwin') {
            exec(`open "${url}"`);
        } else if (process.platform === 'linux') {
            exec(`xdg-open "${url}"`);
        } else if (process.platform === 'win32') {
            exec(`start "${url}"`);
        }
        console.log('✅ Страница открыта в браузере');
    } catch (error) {
        console.log('⚠️  Не удалось автоматически открыть браузер');
        console.log(`   Откройте вручную: ${url}`);
    }
    
    console.log('\n📋 ЧТО ПРОВЕРИТЬ:');
    console.log('1. ✅ Страница загружается без ошибок в консоли');
    console.log('2. ✅ Зеленые сообщения о успешных тестах');
    console.log('3. ✅ Нет красных сообщений об ошибках');
    console.log('4. ✅ SessionPoller работает корректно');
    
    console.log('\n🎯 РЕЗУЛЬТАТ: ОШИБКА MODULE ДОЛЖНА ИСЧЕЗНУТЬ!');
}

openTestPage().catch(console.error);
