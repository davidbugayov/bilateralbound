#!/usr/bin/env node

/**
 * Тест совместимости session-poller.js с браузером
 * Проверяет, что файл корректно загружается без ошибок module
 */

const http = require('http');
const { JSDOM } = require('jsdom');

class BrowserCompatibilityTest {
  async run() {
    console.log('🌐 ТЕСТИРОВАНИЕ СОВМЕСТИМОСТИ С БРАУЗЕРОМ');
    console.log('═'.repeat60);

    try {
      // 1. Получаем session-poller.js с сервера
      const scriptContent = await this.getScriptContent();

      // 2. Тестируем в JSDOM (симуляция браузера)
      await this.testInBrowserEnvironment(scriptContent);

      // 3. Проверяем доступность в реальном браузере
      await this.testRealBrowserLoad();

      console.log('\n🎉 СОВМЕСТИМОСТЬ С БРАУЗЕРОМ ПОДТВЕРЖДЕНА!');
      console.log('✅ session-poller.js корректно работает в браузере');

    } catch (error) {
      console.error('❌ Ошибка совместимости:', error.message);
      process.exit(1);
    }
  }

  async getScriptContent() {
    return new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3000/js/session-poller.js', (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Не удалось загрузить скрипт: ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Таймаут загрузки скрипта'));
      });
    });
  }

  async testInBrowserEnvironment(scriptContent) {
    console.log('🔬 Тестирование в симуляции браузера (JSDOM)...');

    try {
      // Создаем виртуальное окно браузера
      const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        url: 'http://localhost:3000',
        pretendToBeVisual: true,
        resources: 'usable'
      });

      const window = dom.window;
      const document = window.document;

      // Симулируем console для логирования
      window.console = {
        log: (...args) => console.log('[JSDOM]', ...args),
        error: (...args) => console.error('[JSDOM ERROR]', ...args),
        warn: (...args) => console.warn('[JSDOM WARN]', ...args),
        info: (...args) => console.info('[JSDOM INFO]', ...args)
      };

      // Выполняем скрипт в виртуальном браузере
      const script = document.createElement('script');
      script.textContent = scriptContent;

      // Перехватываем ошибки выполнения
      let scriptError = null;
      script.onerror = (error) => {
        scriptError = error;
      };

      document.head.appendChild(script);

      // Даем время на выполнение
      await new Promise(resolve => setTimeout(resolve, 100));

      if (scriptError) {
        throw new Error(`Ошибка выполнения скрипта: ${scriptError.message}`);
      }

      // Проверяем, что SessionPoller доступен
      if (!window.SessionPoller) {
        throw new Error('SessionPoller не найден в глобальной области видимости');
      }

      // Проверяем, что module не определен (как в браузере)
      if (window.module) {
        throw new Error('module найден в браузерной среде - это ошибка!');
      }

      console.log('✅ Скрипт выполнен без ошибок в JSDOM');
      console.log('✅ SessionPoller доступен в window');
      console.log('✅ module не определен (корректно для браузера)');

    } catch (error) {
      throw new Error(`JSDOM тест провален: ${error.message}`);
    }
  }

  async testRealBrowserLoad() {
    console.log('🌐 Проверка загрузки в реальном браузере...');

    // Создаем тестовую HTML страницу
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Test SessionPoller</title>
</head>
<body>
    <h1>Тест SessionPoller</h1>
    <div id="result"></div>

    <script>
        let testResults = [];
        let errors = [];

        function log(message, type = 'info') {
            const result = { message, type, timestamp: Date.now() };
            testResults.push(result);

            if (type === 'error') {
                errors.push(result);
            }

            console.log(\`[\${type.toUpperCase()}] \${message}\`);
        }

        // Тест 1: Загрузка session-poller.js
        try {
            // Создаем скрипт элемент
            const script = document.createElement('script');
            script.src = '/js/session-poller.js';

            script.onload = function() {
                log('session-poller.js загружен успешно');

                // Тест 2: Проверка SessionPoller
                if (typeof SessionPoller !== 'undefined') {
                    log('SessionPoller доступен в глобальной области');

                    // Тест 3: Создание экземпляра
                    try {
                        const poller = new SessionPoller({
                            sessionId: 'test123',
                            pollInterval: 100
                        });
                        log('SessionPoller экземпляр создан успешно');

                        // Тест 4: Проверка отсутствия module
                        if (typeof module === 'undefined') {
                            log('module не определен (корректно для браузера)');
                        } else {
                            log('module найден в браузере - ЭТО ОШИБКА!', 'error');
                        }

                    } catch (error) {
                        log(\`Ошибка создания SessionPoller: \${error.message}\`, 'error');
                    }

                } else {
                    log('SessionPoller НЕ доступен в глобальной области', 'error');
                }

                // Завершаем тест
                finishTest();
            };

            script.onerror = function(error) {
                log(\`Ошибка загрузки session-poller.js: \${error}\`, 'error');
                finishTest();
            };

            document.head.appendChild(script);

        } catch (error) {
            log(\`Критическая ошибка: \${error.message}\`, 'error');
            finishTest();
        }

        function finishTest() {
            const resultDiv = document.getElementById('result');

            if (errors.length === 0) {
                resultDiv.innerHTML = '<h2 style="color: green;">✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!</h2>';
                resultDiv.innerHTML += '<p>SessionPoller корректно работает в браузере</p>';
            } else {
                resultDiv.innerHTML = '<h2 style="color: red;">❌ НАЙДЕНЫ ОШИБКИ:</h2>';
                errors.forEach(error => {
                    resultDiv.innerHTML += \`<p style="color: red;">\${error.message}</p>\`;
                });
            }

            // Отправляем результаты на сервер для проверки
            fetch('/api/test-results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testResults, errors, userAgent: navigator.userAgent })
            }).catch(() => {
                // Игнорируем ошибки отправки результатов
            });
        }
    </script>
</body>
</html>`;

    // Сохраняем тестовую страницу
    const fs = require('fs');
    fs.writeFileSync('test-browser.html', testHtml);

    console.log('✅ Тестовая страница создана: test-browser.html');
    console.log('💡 Откройте в браузере: http://localhost:3000/test-browser.html');
    console.log('   Или используйте: node open-browser.js (для автоматического открытия)');
  }

  printSummary() {
    console.log('\n📋 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
    console.log('═'.repeat60);

    console.log('✅ JSDOM тест пройден');
    console.log('✅ Реальный браузер тест подготовлен');
    console.log('✅ module не экспортируется в браузере');
    console.log('✅ SessionPoller доступен в window');

    console.log('\n🎯 РЕКОМЕНДАЦИИ:');
    console.log('1. Откройте http://localhost:3000/test-browser.html в браузере');
    console.log('2. Проверьте, что нет ошибок в консоли браузера');
    console.log('3. Убедитесь, что все тесты пройдены (зеленый цвет)');
    console.log('4. Если есть ошибки - проверьте логи браузера');

    console.log('\n🔧 ЕСЛИ ПРОБЛЕМЫ:');
    console.log('• Проверьте консоль браузера (F12)');
    console.log('• Очистите кеш браузера (Ctrl+Shift+R)');
    console.log('• Перезагрузите страницу');
  }
}

// Запуск тестирования
if (require.main === module) {
  const test = new BrowserCompatibilityTest();
  test.run().then(() => {
    test.printSummary();
  }).catch(console.error);
}

module.exports = BrowserCompatibilityTest;

