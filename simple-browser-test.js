#!/usr/bin/env node

/**
 * Простой тест загрузки session-poller.js в браузере
 */

const http = require('http');

class SimpleBrowserTest {
  async run() {
    console.log('🌐 ПРОСТОЙ ТЕСТ ЗАГРУЗКИ СЕССИОН-ПОЛЛЕРА');
    console.log('═'.repeat60);

    try {
      // 1. Получаем содержимое скрипта
      console.log('📥 Получаем session-poller.js...');
      const scriptContent = await this.getScript();

      // 2. Проверяем отсутствие module.exports на верхнем уровне
      console.log('🔍 Проверяем отсутствие module.exports...');
      await this.checkNoModuleExports(scriptContent);

      // 3. Проверяем наличие window.SessionPoller
      console.log('🔍 Проверяем наличие window.SessionPoller...');
      await this.checkWindowExport(scriptContent);

      // 4. Создаем тестовую страницу для ручной проверки
      console.log('📄 Создаем тестовую страницу...');
      await this.createTestPage();

      console.log('\n🎉 ТЕСТ ПРОЙДЕН!');
      console.log('✅ session-poller.js безопасен для браузера');

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
      process.exit(1);
    }
  }

  async getScript() {
    return new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3000/js/session-poller.js', (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
    });
  }

  async checkNoModuleExports(content) {
    // Ищем module.exports на верхнем уровне (не внутри условий)
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Пропускаем комментарии
      if (line.startsWith('//') || line.startsWith('/*')) continue;

      // Ищем module.exports не внутри условий
      if (line.includes('module.exports') && !line.includes('typeof module')) {
        // Это может быть нормально, если это внутри условия
        const context = lines.slice(Math.max(0, i-2), Math.min(lines.length, i+3)).join('\n');
        if (!context.includes('typeof module') && !context.includes('if (')) {
          throw new Error(`Найден module.exports без проверки на строке ${i+1}: ${line}`);
        }
      }
    }

    console.log('✅ module.exports используется только с проверками');
  }

  async checkWindowExport(content) {
    if (!content.includes('window.SessionPoller = SessionPoller')) {
      throw new Error('window.SessionPoller не найден в скрипте');
    }

    if (!content.includes('typeof window !== \'undefined\'')) {
      throw new Error('Проверка typeof window отсутствует');
    }

    console.log('✅ window.SessionPoller корректно экспортируется');
  }

  async createTestPage() {
    const testHtml = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Тест SessionPoller</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .test-result { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
    </style>
</head>
<body>
    <h1>🧪 Тест SessionPoller в браузере</h1>

    <div id="results"></div>

    <script>
        const results = [];
        const errors = [];

        function addResult(message, type = 'info') {
            results.push({ message, type, time: Date.now() });

            const div = document.createElement('div');
            div.className = \`test-result \${type}\`;
            div.textContent = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
            document.getElementById('results').appendChild(div);

            console.log(\`[\${type.toUpperCase()}] \${message}\`);

            if (type === 'error') {
                errors.push(message);
            }
        }

        // Тест 1: Загрузка скрипта
        addResult('Начинаем тестирование...', 'info');

        try {
            // Создаем скрипт
            const script = document.createElement('script');
            script.src = '/js/session-poller.js';

            script.onload = function() {
                addResult('✅ session-poller.js загружен успешно');

                // Тест 2: Проверка SessionPoller
                if (typeof SessionPoller !== 'undefined') {
                    addResult('✅ SessionPoller доступен в window');

                    // Тест 3: Создание экземпляра
                    try {
                        const poller = new SessionPoller({
                            sessionId: 'test123',
                            pollInterval: 1000  // Большой интервал для теста
                        });
                        addResult('✅ SessionPoller экземпляр создан');

                        // Останавливаем поллинг сразу
                        if (poller.stopPolling) {
                            poller.stopPolling();
                        }

                    } catch (error) {
                        addResult(\`❌ Ошибка создания SessionPoller: \${error.message}\`, 'error');
                    }

                } else {
                    addResult('❌ SessionPoller НЕ доступен', 'error');
                }

                // Тест 4: Проверка отсутствия module
                if (typeof module === 'undefined') {
                    addResult('✅ module не определен (корректно)');
                } else {
                    addResult('❌ module определен в браузере!', 'error');
                }

                // Итоги
                setTimeout(() => {
                    const summary = document.createElement('div');
                    summary.className = 'test-result ' + (errors.length === 0 ? 'success' : 'error');
                    summary.innerHTML = \`
                        <strong>ИТОГИ ТЕСТИРОВАНИЯ:</strong><br>
                        ✅ Всего тестов: \${results.length}<br>
                        ❌ Ошибок: \${errors.length}<br>
                        \${errors.length === 0 ? '🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!' : '⚠️ НАЙДЕНЫ ПРОБЛЕМЫ'}
                    \`;
                    document.getElementById('results').appendChild(summary);
                }, 100);
            };

            script.onerror = function() {
                addResult('❌ Ошибка загрузки session-poller.js', 'error');
            };

            document.head.appendChild(script);

        } catch (error) {
            addResult(\`❌ Критическая ошибка: \${error.message}\`, 'error');
        }
    </script>
</body>
</html>`;

    const fs = require('fs');
    fs.writeFileSync('public/test-session-poller.html', testHtml);

    console.log('✅ Тестовая страница создана: public/test-session-poller.html');
    console.log('💡 Откройте: http://localhost:3000/test-session-poller.html');
  }
}

// Запуск
if (require.main === module) {
  const test = new SimpleBrowserTest();
  test.run().catch(console.error);
}

module.exports = SimpleBrowserTest;

