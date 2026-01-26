#!/usr/bin/env node

/**
 * Проверка CSS правил overflow для диагностики проблем со скроллом
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 ДИАГНОСТИКА ПРОБЛЕМ СО СКРОЛЛОМ\n');
console.log('='.repeat(60));

const cssFiles = [
  'packages/web-client/public/css/shared-components.css',
  'packages/web-client/public/css/common.css',
  'packages/web-client/public/css/controller.css',
  'packages/web-client/public/css/main-page.css',
  'packages/web-client/public/css/light-theme.css'
];

cssFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);

  if (!fs.existsSync(filePath)) {
    console.log(`\n⚠️  Файл не найден: ${file}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  console.log(`\n📄 ${file}`);
  console.log('-'.repeat(60));

  // Проверяем все правила overflow
  let foundOverflow = false;
  lines.forEach((line, index) => {
    if (line.includes('overflow')) {
      foundOverflow = true;
      const lineNum = index + 1;
      console.log(`  Строка ${lineNum}: ${line.trim()}`);

      // Проверяем контекст (предыдущие 5 строк для поиска селектора)
      let selector = '';
      for (let i = index - 1; i >= Math.max(0, index - 10); i--) {
        const prevLine = lines[i].trim();
        if (prevLine.includes('{')) {
          // Ищем селектор перед {
          for (let j = i; j >= Math.max(0, i - 5); j--) {
            const selectorLine = lines[j].trim();
            if (selectorLine && !selectorLine.startsWith('/*') && !selectorLine.startsWith('*/')) {
              selector = selectorLine.replace('{', '').trim();
              break;
            }
          }
          break;
        }
      }
      if (selector) {
        console.log(`    → Селектор: ${selector}`);
      }
    }
  });

  if (!foundOverflow) {
    console.log('  ✅ Правила overflow не найдены');
  }
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ ПРОВЕРКА ЗАВЕРШЕНА\n');
console.log('💡 Рекомендации:');
console.log('   1. html, body должны иметь overflow-y: auto');
console.log('   2. Не должно быть overflow: hidden для body');
console.log('   3. В медиа-запросах overflow-y должен быть явно указан\n');
