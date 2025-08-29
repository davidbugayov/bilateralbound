/**
 * SessionPoller - модуль для синхронизации состояния сессии между клиентом и сервером
 * Реализует polling API сервера для получения обновлений состояния мяча
 */

class SessionPoller {
    constructor(options) {
        this.sessionId = options.sessionId;
        this.onDataReceived = options.onDataReceived || (() => {});
        this.onSessionExpired = options.onSessionExpired || (() => {});
        this.onError = options.onError || (() => {});

        // Настройки polling
        this.pollInterval = options.pollInterval || 100; // 100ms - частый polling для плавности
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;

        // Состояние
        this.isPolling = false;
        this.pollTimer = null;
        this.lastState = null;
        this.retryCount = 0;
        this.errorCount = 0;
        this.maxErrors = 5;

        // Статистика
        this.stats = {
            requests: 0,
            successfulRequests: 0,
            errors: 0,
            avgResponseTime: 0
        };

        this.log('SessionPoller initialized', 'info');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': 'ℹ️ ',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️ '
        }[type] || '📝';

        console.log(`[${timestamp}] ${prefix} SessionPoller: ${message}`);
    }

    async makeRequest(endpoint, method = 'GET', data = null) {
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const url = `/api/session/${this.sessionId}${endpoint}`;

            xhr.open(method, url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');

            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    const responseTime = Date.now() - startTime;
                    this.updateStats(xhr.status === 200, responseTime);

                    if (xhr.status === 200) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            resolve({ status: xhr.status, data: response });
                        } catch (e) {
                            resolve({ status: xhr.status, data: xhr.responseText });
                        }
                    } else if (xhr.status === 404) {
                        // Сессия истекла или не найдена
                        this.log(`Session expired or not found: ${xhr.status}`, 'warning');
                        this.onSessionExpired();
                        resolve({ status: xhr.status, data: null });
                    } else {
                        resolve({ status: xhr.status, data: xhr.responseText });
                    }
                }
            };

            xhr.onerror = () => {
                const responseTime = Date.now() - startTime;
                this.updateStats(false, responseTime);
                reject(new Error('Network error'));
            };

            xhr.timeout = 5000; // 5 second timeout
            xhr.ontimeout = () => {
                const responseTime = Date.now() - startTime;
                this.updateStats(false, responseTime);
                reject(new Error('Request timeout'));
            };

            if (data) {
                xhr.send(JSON.stringify(data));
            } else {
                xhr.send();
            }
        });
    }

    updateStats(success, responseTime) {
        this.stats.requests++;
        if (success) {
            this.stats.successfulRequests++;
        } else {
            this.stats.errors++;
        }

        // Обновляем среднее время ответа
        const totalResponseTime = this.stats.avgResponseTime * (this.stats.requests - 1) + responseTime;
        this.stats.avgResponseTime = totalResponseTime / this.stats.requests;
    }

    async poll() {
        if (!this.isPolling) return;

        try {
            const response = await this.makeRequest('/state');

            if (response.status === 200 && response.data) {
                // Проверяем, изменилось ли состояние
                const isChanged = !this.lastState ||
                    JSON.stringify(response.data) !== JSON.stringify(this.lastState);

                if (isChanged) {
                    this.lastState = response.data;
                    this.onDataReceived(response.data);

                    // Сбрасываем счетчик ошибок при успешном запросе
                    this.errorCount = 0;
                    this.retryCount = 0;
                }
            } else if (response.status === 404) {
                // Сессия истекла
                this.log('Session expired, stopping polling', 'warning');
                this.stopPolling();
                this.onSessionExpired();
                return;
            } else {
                throw new Error(`HTTP ${response.status}: ${response.data}`);
            }

        } catch (error) {
            this.errorCount++;
            this.log(`Poll error (${this.errorCount}/${this.maxErrors}): ${error.message}`, 'error');

            if (this.errorCount >= this.maxErrors) {
                this.log('Too many errors, stopping polling', 'error');
                this.stopPolling();
                this.onError(error);
                return;
            }

            // Увеличиваем интервал при ошибках
            this.retryCount = Math.min(this.retryCount + 1, this.maxRetries);
            await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryCount));
        }

        // Продолжаем polling если не остановлены
        if (this.isPolling) {
            this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
        }
    }

    startPolling() {
        if (this.isPolling) {
            this.log('Polling already started', 'warning');
            return;
        }

        this.isPolling = true;
        this.log(`Starting polling with ${this.pollInterval}ms interval`, 'info');
        this.poll(); // Запускаем первый запрос сразу
    }

    stopPolling() {
        if (!this.isPolling) return;

        this.isPolling = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        this.log('Polling stopped', 'info');
    }

    // Принудительное обновление состояния
    async forceUpdate() {
        if (!this.isPolling) return;

        try {
            this.log('Force updating state...', 'info');
            await this.poll();
        } catch (error) {
            this.log(`Force update failed: ${error.message}`, 'error');
        }
    }

    // Получить текущую статистику
    getStats() {
        return {
            ...this.stats,
            isPolling: this.isPolling,
            errorCount: this.errorCount,
            avgResponseTime: Math.round(this.stats.avgResponseTime),
            successRate: this.stats.requests > 0 ?
                Math.round((this.stats.successfulRequests / this.stats.requests) * 100) : 0
        };
    }

    // Изменить интервал polling
    setPollInterval(interval) {
        this.pollInterval = Math.max(50, Math.min(1000, interval)); // Ограничение 50ms-1000ms
        this.log(`Poll interval changed to ${this.pollInterval}ms`, 'info');

        // Если polling активен, перезапускаем с новым интервалом
        if (this.isPolling) {
            this.stopPolling();
            this.startPolling();
        }
    }

    // Очистка ресурсов
    destroy() {
        this.stopPolling();
        this.lastState = null;
        this.stats = {
            requests: 0,
            successfulRequests: 0,
            errors: 0,
            avgResponseTime: 0
        };
        this.log('SessionPoller destroyed', 'info');
    }
}

// Экспортируем для использования в браузере
if (typeof window !== 'undefined') {
    window.SessionPoller = SessionPoller;
}

// Экспортируем для использования в Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionPoller;
}
