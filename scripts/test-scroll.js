#!/usr/bin/env node
/**
 * Тест проверки скролла на страницах
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Проверка настроек скролла...\n');

const publicPath = path.join(__dirname, '../packages/web-client/public');
const cssPath = path.join(publicPath, 'css/shared-components.css');

let errors = 0;
let warnings = 0;

// Читаем CSS файл
const css = fs.readFileSync(cssPath, 'utf8');

// Проверка 1: Наличие overflow-y: auto для body
console.log('✓ Проверка 1: overflow-y: auto в основных стилях');
const hasOverflowY = /html,\s*body\s*{[^}]*overflow-y:\s*auto/s.test(css);
if (hasOverflowY) {
  console.log('  ✅ overflow-y: auto найден');
} else {
  console.log('  ❌ overflow-y: auto НЕ найден');
  errors++;
}

// Проверка 2: Отсутствие overflow-x: hidden для body
console.log('\n✓ Проверка 2: отсутствие overflow-x: hidden для body');
const bodyOverflowHidden = css.match(/body\s*{[^}]*overflow-x:\s*hidden/g);
if (!bodyOverflowHidden || bodyOverflowHidden.length === 0) {
  console.log('  ✅ Блокировок скролла не найдено');
} else {
  console.log(`  ❌ Найдено ${bodyOverflowHidden.length} блокировок скролла для body`);
  bodyOverflowHidden.forEach(block => console.log('    ', block.substring(0, 50)));
  errors++;
}

// Проверка 3: Отсутствие overflow: hidden для html
console.log('\n✓ Проверка 3: отсутствие overflow: hidden для html');
const htmlOverflowHidden = css.match(/html\s*{[^}]*overflow:\s*hidden/g);
if (!htmlOverflowHidden || htmlOverflowHidden.length === 0) {
  console.log('  ✅ Блокировок скролла для html не найдено');
} else {
  console.log(`  ❌ Найдено ${htmlOverflowHidden.length} блокировок скролла для html`);
  errors++;
}

// Проверка 4: min-height для контента
console.log('\n✓ Проверка 4: min-height для обеспечения скролла');
const hasMinHeight = /\.wrap\s*{[^}]*min-height:/s.test(css);
if (hasMinHeight) {
  console.log('  ✅ min-height для .wrap найден');
} else {
  console.log('  ⚠️  min-height для .wrap не найден (скролл может не появляться если контент короткий)');
  warnings++;
}

// Проверка 5: Проверяем HTML файлы на версии CSS
console.log('\n✓ Проверка 5: версии CSS файлов в HTML');
const htmlFiles = ['index.html', 'session-controller.html', 'viewer.html'];
htmlFiles.forEach(file => {
  const htmlPath = path.join(publicPath, file);
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const hasVersion = /shared-components\.css\?v=/i.test(html);
    if (hasVersion) {
      console.log(`  ✅ ${file}: версия CSS есть`);
    } else {
      console.log(`  ❌ ${file}: версия CSS отсутствует (будет кэширование)`);
      errors++;
    }
  }
});

// Итоги
console.log('\n' + '='.repeat(50));
console.log(`Ошибок: ${errors}`);
console.log(`Предупреждений: ${warnings}`);

if (errors === 0) {
  console.log('\n✅ Все проверки пройдены! Скролл должен работать.');
  process.exit(0);
} else {
  console.log('\n❌ Найдены проблемы! Скролл может не работать.');
  process.exit(1);
}
