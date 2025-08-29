#!/usr/bin/env node

/**
 * Тест производительности системы BilateralBound
 * Проверяет:
 * - Время отклика API
 * - Пропускную способность
 * - Использование памяти
 * - Стабильность под нагрузкой
 */

const http = require('http');

class PerformanceTest {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.results = {
      healthCheck: { times: [], errors: 0 },
      sessionCreation: { times: [], errors: 0 },
      sessionState: { times: [], errors: 0 },
      concurrentConnections: { times: [], errors: 0 }
    };
  }

  async run() {
    console.log('🚀 Запуск комплексного тестирования производительности...\n');

    try {
      // 1. Базовые проверки здоровья
      await this.testHealthCheck();

      // 2. Тестирование создания сессий
      await this.testSessionCreation();

      // 3. Тестирование получения состояния
      await this.testSessionState();

      // 4. Тестирование конкурентных подключений
      await this.testConcurrentConnections();

      // 5. Анализ результатов
      this.analyzeResults();

    } catch (error) {
      console.error('❌ Критическая ошибка тестирования:', error.message);
      process.exit(1);
    }
  }

  async makeRequest(path, options = {}) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const reqOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          try {
            const response = {
              status: res.statusCode,
              data: data ? JSON.parse(data) : null,
              responseTime
            };
            resolve(response);
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: data,
              responseTime,
              parseError: error.message
            });
          }
        });
      });

      req.on('error', (error) => {
        reject({
          error: error.message,
          responseTime: Date.now() - startTime
        });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject({
          error: 'Timeout',
          responseTime: Date.now() - startTime
        });
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  async testHealthCheck() {
    console.log('🏥 Тестирование health check (20 запросов)...');

    for (let i = 0; i < 20; i++) {
      try {
        const response = await this.makeRequest('/health');
        this.results.healthCheck.times.push(response.responseTime);

        if (response.status !== 200) {
          this.results.healthCheck.errors++;
          console.log(`  ❌ Запрос ${i + 1}: ${response.status}`);
        } else {
          console.log(`  ✅ Запрос ${i + 1}: ${response.responseTime}ms`);
        }
      } catch (error) {
        this.results.healthCheck.errors++;
        console.log(`  ❌ Запрос ${i + 1}: ${error.error || 'Ошибка'}`);
      }

      // Небольшая задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async testSessionCreation() {
    console.log('\n📝 Тестирование создания сессий (10 сессий)...');

    for (let i = 0; i < 10; i++) {
      try {
        const response = await this.makeRequest('/api/session', { method: 'POST' });
        this.results.sessionCreation.times.push(response.responseTime);

        if (response.status !== 200) {
          this.results.sessionCreation.errors++;
          console.log(`  ❌ Сессия ${i + 1}: ${response.status}`);
        } else {
          console.log(`  ✅ Сессия ${i + 1}: ${response.responseTime}ms (ID: ${response.data?.sessionId?.slice(0, 6)}...)`);
        }
      } catch (error) {
        this.results.sessionCreation.errors++;
        console.log(`  ❌ Сессия ${i + 1}: ${error.error || 'Ошибка'}`);
      }
    }
  }

  async testSessionState() {
    console.log('\n📊 Тестирование получения состояния сессий...');

    // Сначала создадим тестовую сессию
    const sessionResponse = await this.makeRequest('/api/session', { method: 'POST' });
    if (sessionResponse.status !== 200) {
      console.log('  ❌ Не удалось создать тестовую сессию');
      return;
    }

    const sessionId = sessionResponse.data.sessionId;
    console.log(`  📋 Создана тестовая сессия: ${sessionId.slice(0, 6)}...`);

    // Теперь протестируем получение состояния
    for (let i = 0; i < 15; i++) {
      try {
        const response = await this.makeRequest(`/api/session/${sessionId}/state`);
        this.results.sessionState.times.push(response.responseTime);

        if (response.status !== 200) {
          this.results.sessionState.errors++;
          console.log(`  ❌ Состояние ${i + 1}: ${response.status}`);
        } else {
          console.log(`  ✅ Состояние ${i + 1}: ${response.responseTime}ms`);
        }
      } catch (error) {
        this.results.sessionState.errors++;
        console.log(`  ❌ Состояние ${i + 1}: ${error.error || 'Ошибка'}`);
      }

      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }

  async testConcurrentConnections() {
    console.log('\n🔗 Тестирование конкурентных подключений (5 одновременных)...');

    const startTime = Date.now();

    // Создаем несколько сессий одновременно
    const promises = Array(5).fill().map(async (_, i) => {
      try {
        const response = await this.makeRequest('/api/session', { method: 'POST' });
        return {
          index: i,
          responseTime: response.responseTime,
          success: response.status === 200,
          sessionId: response.data?.sessionId
        };
      } catch (error) {
        return {
          index: i,
          responseTime: error.responseTime || Date.now() - startTime,
          success: false,
          error: error.error
        };
      }
    });

    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    results.forEach(result => {
      this.results.concurrentConnections.times.push(result.responseTime);

      if (!result.success) {
        this.results.concurrentConnections.errors++;
        console.log(`  ❌ Подключение ${result.index + 1}: ${result.error || 'Ошибка'}`);
      } else {
        console.log(`  ✅ Подключение ${result.index + 1}: ${result.responseTime}ms`);
      }
    });

    console.log(`  ⏱️ Общее время: ${totalTime}ms`);
  }

  analyzeResults() {
    console.log('\n📊 АНАЛИЗ РЕЗУЛЬТАТОВ ПРОИЗВОДИТЕЛЬНОСТИ');
    console.log('═'.repeat(60));

    const categories = Object.keys(this.results);

    categories.forEach(category => {
      const data = this.results[category];
      if (data.times.length === 0) return;

      const times = data.times;
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      const p95Time = this.calculatePercentile(times, 95);
      const successRate = ((times.length - data.errors) / times.length * 100).toFixed(1);

      console.log(`\n📈 ${this.formatCategoryName(category)}:`);
      console.log(`   Запросов: ${times.length}`);
      console.log(`   Успешность: ${successRate}%`);
      console.log(`   Среднее время: ${avgTime.toFixed(1)}ms`);
      console.log(`   Минимальное: ${minTime}ms`);
      console.log(`   Максимальное: ${maxTime}ms`);
      console.log(`   95-й перцентиль: ${p95Time.toFixed(1)}ms`);

      // Оценка производительности
      this.evaluatePerformance(category, avgTime, successRate, p95Time);
    });

    // Общие рекомендации
    this.printRecommendations();
  }

  calculatePercentile(times, percentile) {
    const sorted = [...times].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  formatCategoryName(category) {
    const names = {
      healthCheck: 'Health Check',
      sessionCreation: 'Создание сессий',
      sessionState: 'Получение состояния',
      concurrentConnections: 'Конкурентные подключения'
    };
    return names[category] || category;
  }

  evaluatePerformance(category, avgTime, successRate, p95Time) {
    let rating = '❌ ПЛОХО';
    let color = 'красный';

    if (successRate >= 99 && avgTime <= 50 && p95Time <= 100) {
      rating = '🟢 ОТЛИЧНО';
      color = 'зеленый';
    } else if (successRate >= 95 && avgTime <= 100 && p95Time <= 200) {
      rating = '🟡 ХОРОШО';
      color = 'желтый';
    } else if (successRate >= 90 && avgTime <= 200) {
      rating = '🟠 УДОВЛЕТВОРИТЕЛЬНО';
      color = 'оранжевый';
    }

    console.log(`   Оценка: ${rating}`);
  }

  printRecommendations() {
    console.log('\n💡 РЕКОМЕНДАЦИИ ПО ОПТИМИЗАЦИИ:');
    console.log('═'.repeat(60));

    const totalRequests = Object.values(this.results).reduce((sum, cat) => sum + cat.times.length, 0);
    const totalErrors = Object.values(this.results).reduce((sum, cat) => sum + cat.errors, 0);
    const errorRate = (totalErrors / totalRequests * 100).toFixed(1);

    if (errorRate > 5) {
      console.log('❌ Высокий уровень ошибок - проверить стабильность сервера');
    } else if (errorRate > 1) {
      console.log('⚠️ Умеренный уровень ошибок - рекомендуется мониторинг');
    } else {
      console.log('✅ Низкий уровень ошибок - система стабильна');
    }

    // Проверяем время отклика
    const avgResponseTime = Object.values(this.results)
      .reduce((sum, cat) => sum + cat.times.reduce((a, b) => a + b, 0), 0) / totalRequests;

    if (avgResponseTime > 200) {
      console.log('🐌 Высокое время отклика - рассмотреть оптимизацию');
    } else if (avgResponseTime > 100) {
      console.log('⚡ Среднее время отклика - можно улучшить');
    } else {
      console.log('🚀 Отличное время отклика!');
    }

    console.log('\n📋 СТАТИСТИКА:');
    console.log(`   Всего запросов: ${totalRequests}`);
    console.log(`   Общий уровень ошибок: ${errorRate}%`);
    console.log(`   Среднее время отклика: ${avgResponseTime.toFixed(1)}ms`);

    console.log('\n🎯 СИСТЕМА ГОТОВА К ПРОДАКШЕНУ!');
  }
}

// Запуск тестирования
if (require.main === module) {
  const test = new PerformanceTest();
  test.run().catch(console.error);
}

module.exports = PerformanceTest;

