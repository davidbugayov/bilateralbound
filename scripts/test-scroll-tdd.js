/**
 * TDD Тест для проверки работы вертикального скролла
 * Запуск: node scripts/test-scroll-tdd.js
 */

const http = require('http');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Утилита для HTTP запросов
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Тесты
const tests = [];
let passedTests = 0;
let failedTests = 0;

function test(description, testFn) {
  tests.push({ description, testFn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// === ТЕСТЫ ===

test('CSS файл shared-components.css должен быть доступен', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  assert(css.length > 0, 'CSS файл должен загружаться');
});

test('CSS должен содержать overflow-y: scroll для body', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  assert(css.includes('overflow-y: scroll') || css.includes('overflow-y:scroll'),
    'CSS должен содержать overflow-y: scroll');
});

test('CSS должен содержать !important для overflow-y в медиа-запросе', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  assert(
    css.includes('overflow-y: scroll !important') || css.includes('overflow-y:scroll!important'),
    'CSS должен содержать overflow-y: scroll !important в медиа-запросе'
  );
});

test('index.html должна загружать shared-components.css', async () => {
  const html = await fetchPage('http://localhost:3000/');
  assert(
    html.includes('shared-components.css'),
    'index.html должна подключать shared-components.css'
  );
});

test('CSS не должен содержать overflow: hidden для body', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');

  // Ищем все блоки body с overflow: hidden
  const lines = css.split('\n');
  let inBodyBlock = false;
  let bodyDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.match(/^body\s*{/)) {
      inBodyBlock = true;
      bodyDepth = 0;
    }

    if (inBodyBlock) {
      if (line.includes('{')) bodyDepth++;
      if (line.includes('}')) bodyDepth--;

      if (line.includes('overflow:') && line.includes('hidden') && !line.includes('overflow-x')) {
        throw new Error(`Найден overflow: hidden для body на строке ${i + 1}: ${line}`);
      }

      if (bodyDepth === 0 && line.includes('}')) {
        inBodyBlock = false;
      }
    }
  }
});

test('CSS должен содержать height: auto для body', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  assert(
    css.includes('height: auto') || css.includes('height:auto'),
    'CSS должен содержать height: auto для разрешения роста body'
  );
});

test('Базовые стили body должны иметь min-height: 100vh', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  assert(
    css.includes('min-height: 100vh') || css.includes('min-height:100vh'),
    'Body должен иметь min-height: 100vh для минимальной высоты'
  );
});

test('CSS не должен устанавливать max-height для body', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  const bodyMaxHeight = /body\s*{[^}]*max-height/;
  assert(
    !bodyMaxHeight.test(css),
    'Body НЕ должен иметь max-height (это блокирует скролл)'
  );
});

test('CSS должен содержать overflow-x: hidden (чтобы скрыть горизонтальный скролл)', async () => {
  const css = await fetchPage('http://localhost:3000/css/shared-components.css');
  assert(
    css.includes('overflow-x: hidden') || css.includes('overflow-x:hidden'),
    'CSS должен содержать overflow-x: hidden'
  );
});

// Запуск тестов
async function runTests() {
  console.log(`\n${colors.bold}${colors.cyan}=== TDD: Тестирование скролла ===${colors.reset}\n`);

  for (const { description, testFn } of tests) {
    try {
      await testFn();
      passedTests++;
      console.log(`${colors.green}✓${colors.reset} ${description}`);
    } catch (error) {
      failedTests++;
      console.log(`${colors.red}✗${colors.reset} ${description}`);
      console.log(`  ${colors.red}${error.message}${colors.reset}\n`);
    }
  }

  console.log(`\n${colors.bold}=== Результаты ===${colors.reset}`);
  console.log(`${colors.green}Пройдено: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}Провалено: ${failedTests}${colors.reset}`);
  console.log(`Всего: ${tests.length}\n`);

  if (failedTests > 0) {
    console.log(`${colors.yellow}⚠️  Есть проваленные тесты. Нужно исправить код.${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✅ Все тесты пройдены!${colors.reset}\n`);
    process.exit(0);
  }
}

// Проверка, что сервер запущен
http.get('http://localhost:3000', (res) => {
  if (res.statusCode === 200) {
    runTests();
  } else {
    console.log(`${colors.red}Ошибка: Сервер вернул статус ${res.statusCode}${colors.reset}`);
    process.exit(1);
  }
}).on('error', (err) => {
  console.log(`${colors.red}Ошибка: Сервер не запущен на порту 3000${colors.reset}`);
  console.log(`Запустите сервер командой: npm start\n`);
  process.exit(1);
});
