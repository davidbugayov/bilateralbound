#!/usr/bin/env node

/**
 * Базовый тест синхронизации - проверка работы без SessionPoller
 */

const http = require('http');

class BasicSyncTest {
    constructor() {
        this.baseURL = 'http://localhost:3000';
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

    async testBasicSync() {
        console.log('🧪 Тестируем базовую синхронизацию');

        // Создаем сессию
        console.log('1. Создание сессии...');
        const sessionResponse = await this.makeRequest('/api/session', 'POST');
        if (sessionResponse.status !== 200 || !sessionResponse.data.sessionId) {
            console.log('❌ Не удалось создать сессию');
            return false;
        }

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Сессия создана: ${sessionId}`);

        // Получаем начальное состояние
        console.log('2. Получение начального состояния...');
        const initialState = await this.makeRequest(`/api/session/${sessionId}/state`);
        if (initialState.status !== 200) {
            console.log('❌ Не удалось получить начальное состояние');
            return false;
        }

        console.log('✅ Начальное состояние получено:', JSON.stringify(initialState.data, null, 2));

        // Отправляем команду движения
        console.log('3. Отправка команды движения...');
        const commandResponse = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
            speedScalar: 80,
            dirX: 1,
            dirY: 0
        });

        if (commandResponse.status !== 200) {
            console.log(`❌ Команда движения не принята: ${commandResponse.status}`);
            return false;
        }

        console.log('✅ Команда движения отправлена');

        // Ждем немного для обработки
        await new Promise(resolve => setTimeout(resolve, 200));

        // Получаем обновленное состояние
        console.log('4. Получение обновленного состояния...');
        const updatedState = await this.makeRequest(`/api/session/${sessionId}/state`);
        if (updatedState.status !== 200) {
            console.log('❌ Не удалось получить обновленное состояние');
            return false;
        }

        console.log('✅ Обновленное состояние:', JSON.stringify(updatedState.data, null, 2));

        // Сравниваем состояния
        const initial = initialState.data;
        const updated = updatedState.data;

        const positionChanged = initial.x !== updated.x || initial.y !== updated.y;
        const velocityChanged = initial.vx !== updated.vx || initial.vy !== updated.vy;

        console.log('\n📊 Сравнение состояний:');
        console.log(`Позиция изменилась: ${positionChanged ? '✅' : '❌'}`);
        console.log(`Скорость изменилась: ${velocityChanged ? '✅' : '❌'}`);

        if (velocityChanged) {
            console.log(`Скорость: (${updated.vx}, ${updated.vy})`);
        }

        return velocityChanged;
    }

    async testMultipleCommands() {
        console.log('\n🧪 Тестируем множественные команды');

        // Создаем сессию
        const sessionResponse = await this.makeRequest('/api/session', 'POST');
        if (sessionResponse.status !== 200) return false;

        const sessionId = sessionResponse.data.sessionId;

        const directions = [
            { name: 'Вправо', dirX: 1, dirY: 0 },
            { name: 'Влево', dirX: -1, dirY: 0 },
            { name: 'Вверх', dirX: 0, dirY: -1 },
            { name: 'Вниз', dirX: 0, dirY: 1 }
        ];

        for (const direction of directions) {
            console.log(`Отправка команды: ${direction.name}`);

            const response = await this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST', {
                speedScalar: 60,
                dirX: direction.dirX,
                dirY: direction.dirY
            });

            if (response.status !== 200) {
                console.log(`❌ Ошибка команды ${direction.name}: ${response.status}`);
                return false;
            }

            // Небольшая пауза
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log('✅ Все команды отправлены успешно');
        return true;
    }

    async runTests() {
        console.log('🚀 Запуск базовых тестов синхронизации\n');

        let allPassed = true;

        console.log('═'.repeat(50));
        if (!(await this.testBasicSync())) {
            allPassed = false;
        }

        console.log('─'.repeat(30));
        if (!(await this.testMultipleCommands())) {
            allPassed = false;
        }

        console.log('═'.repeat(50));

        if (allPassed) {
            console.log('🎉 Все базовые тесты синхронизации пройдены!');
        } else {
            console.log('❌ Есть проблемы с базовой синхронизацией');
        }

        return allPassed;
    }
}

// Запуск тестов
if (require.main === module) {
    const test = new BasicSyncTest();
    test.runTests().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Критическая ошибка:', error);
        process.exit(1);
    });
}

module.exports = BasicSyncTest;
