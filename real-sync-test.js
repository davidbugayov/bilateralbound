#!/usr/bin/env node

/**
 * Реальный тест синхронизации - тестирование с запущенным сервером
 */

const http = require('http');

// Класс для тестирования API сервера
class TestAPIClient {
    constructor(baseURL = 'http://localhost:3000') {
        this.baseURL = baseURL;
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

    async createSession() {
        return this.makeRequest('/api/session', 'POST');
    }

    async connectController(sessionId) {
        return this.makeRequest(`/api/session/${sessionId}/controller/connect`, 'POST');
    }

    async getSessionState(sessionId) {
        return this.makeRequest(`/api/session/${sessionId}/state`, 'GET');
    }

    async sendDirection(sessionId, dirX, dirY, speedScalar = 40) {
        return this.makeRequest(`/api/session/${sessionId}/controller/direction`, 'POST', {
            dirX, dirY, speedScalar
        });
    }

    async sendBounce(sessionId, bounceData) {
        return this.makeRequest(`/api/session/${sessionId}/bounce`, 'POST', bounceData);
    }
}

// Основной тест с реальным сервером
async function runRealSyncTest() {
    console.log('🌐 РЕАЛЬНЫЙ ТЕСТ СИНХРОНИЗАЦИИ');
    console.log('=================================\n');

    const client = new TestAPIClient();

    try {
        // Шаг 1: Создание сессии
        console.log('📋 Шаг 1: Создание сессии...');
        const sessionResponse = await client.createSession();

        if (sessionResponse.status !== 200) {
            console.log('❌ Не удалось создать сессию:', sessionResponse);
            return false;
        }

        const sessionId = sessionResponse.data.sessionId;
        console.log(`✅ Создана сессия: ${sessionId}`);

        // Шаг 2: Подключение контроллера
        console.log('\n📋 Шаг 2: Подключение контроллера...');
        const controllerResponse = await client.connectController(sessionId);

        if (controllerResponse.status !== 200) {
            console.log('❌ Не удалось подключить контроллер:', controllerResponse);
            return false;
        }

        console.log('✅ Контроллер подключен');

        // Шаг 3: Получение начального состояния
        console.log('\n📋 Шаг 3: Получение начального состояния...');
        const initialStateResponse = await client.getSessionState(sessionId);

        if (initialStateResponse.status !== 200) {
            console.log('❌ Не удалось получить состояние:', initialStateResponse);
            return false;
        }

        const initialState = initialStateResponse.data;
        console.log(`✅ Начальное состояние: x=${initialState.x}, vx=${initialState.vx}, vy=${initialState.vy}`);

        // Шаг 4: Отправка команды движения
        console.log('\n📋 Шаг 4: Отправка команды движения вправо...');
        const directionResponse = await client.sendDirection(sessionId, 1, 0, 40);

        if (directionResponse.status !== 200) {
            console.log('❌ Не удалось отправить команду движения:', directionResponse);
            return false;
        }

        console.log('✅ Команда движения отправлена');

        // Шаг 5: Получение обновленного состояния
        console.log('\n📋 Шаг 5: Получение обновленного состояния...');
        const updatedStateResponse = await client.getSessionState(sessionId);

        if (updatedStateResponse.status !== 200) {
            console.log('❌ Не удалось получить обновленное состояние:', updatedStateResponse);
            return false;
        }

        const updatedState = updatedStateResponse.data;
        console.log(`✅ Обновленное состояние: x=${updatedState.x}, vx=${updatedState.vx}, vy=${updatedState.vy}`);

        // Шаг 6: Имитация отскока
        console.log('\n📋 Шаг 6: Имитация отскока от правой границы...');
        const bounceData = {
            x: 745, // Позиция после отскока
            y: updatedState.y,
            vx: -250, // Отрицательная скорость (влево)
            vy: 0,
            bounced: true,
            timestamp: Date.now()
        };

        const bounceResponse = await client.sendBounce(sessionId, bounceData);

        if (bounceResponse.status !== 200) {
            console.log('❌ Не удалось отправить данные отскока:', bounceResponse);
            return false;
        }

        console.log('✅ Данные отскока отправлены');

        // Шаг 7: Проверка финального состояния
        console.log('\n📋 Шаг 7: Проверка финального состояния...');
        const finalStateResponse = await client.getSessionState(sessionId);

        if (finalStateResponse.status !== 200) {
            console.log('❌ Не удалось получить финальное состояние:', finalStateResponse);
            return false;
        }

        const finalState = finalStateResponse.data;
        console.log(`✅ Финальное состояние: x=${finalState.x}, vx=${finalState.vx}, vy=${finalState.vy}`);

        // Проверка корректности синхронизации
        const positionCorrect = Math.abs(finalState.x - 745) < 5;
        const velocityCorrect = finalState.vx === -250;

        console.log('\n📊 АНАЛИЗ РЕЗУЛЬТАТОВ:');
        console.log('='.repeat(25));
        console.log(`Позиция корректна: ${positionCorrect ? '✅' : '❌'} (ожидалось ~745, получено ${finalState.x})`);
        console.log(`Скорость корректна: ${velocityCorrect ? '✅' : '❌'} (ожидалось -250, получено ${finalState.vx})`);

        const success = positionCorrect && velocityCorrect;

        if (success) {
            console.log('\n🎉 РЕАЛЬНЫЙ СЕРВЕР РАБОТАЕТ КОРРЕКТНО!');
            console.log('✅ Синхронизация клиент-сервер функционирует правильно');
            return true;
        } else {
            console.log('\n❌ ПРОБЛЕМЫ С СИНХРОНИЗАЦИЕЙ!');
            return false;
        }

    } catch (error) {
        console.log('❌ Ошибка тестирования:', error.message);
        return false;
    }
}

// Функция для проверки здоровья сервера
async function checkServerHealth() {
    const client = new TestAPIClient();

    try {
        const response = await client.makeRequest('/health');
        if (response.status === 200) {
            console.log('✅ Сервер работает корректно');
            return true;
        } else {
            console.log('❌ Сервер недоступен');
            return false;
        }
    } catch (error) {
        console.log('❌ Не удалось подключиться к серверу:', error.message);
        return false;
    }
}

// Запуск тестов
if (require.main === module) {
    (async () => {
        console.log('🚀 ЗАПУСК РЕАЛЬНЫХ ТЕСТОВ СИНХРОНИЗАЦИИ\n');

        // Проверка доступности сервера
        const serverHealthy = await checkServerHealth();
        if (!serverHealthy) {
            console.log('\n❌ СЕРВЕР НЕДОСТУПЕН! Убедитесь, что сервер запущен на порту 3000.');
            process.exit(1);
        }

        // Запуск основного теста
        const testPassed = await runRealSyncTest();

        console.log('\n🏁 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:');
        console.log('='.repeat(30));

        if (testPassed) {
            console.log('🎉 ВСЕ РЕАЛЬНЫЕ ТЕСТЫ ПРОЙДЕНЫ!');
            console.log('✅ Система готова к использованию');
            process.exit(0);
        } else {
            console.log('❌ НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛИЛИСЬ!');
            console.log('🔧 Проверьте логи сервера для диагностики проблем');
            process.exit(1);
        }
    })();
}

module.exports = { TestAPIClient, runRealSyncTest, checkServerHealth };
