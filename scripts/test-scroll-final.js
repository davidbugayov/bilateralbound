#!/usr/bin/env node
/**
 * Финальный тест - проверка CSS overflow в реальном файле
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 ФИНАЛЬНАЯ ПРОВЕРКА СКРОЛЛА\n');

const cssPath = path.join(__dirname, '../packages/web-client/public/css/shared-components.css');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('📋 Проверка критических настроек overflow:\n');

// Извлекаем секцию html, body
const htmlBodyMatch = css.match(/html,\s*body\s*{([^}]+)}/s);
if (htmlBodyMatch) {
  const styles = htmlBodyMatch[1];
  console.log('✓ Стили для html, body:');

  const overflowX = styles.match(/overflow-x:\s*([^;]+)/);
  const overflowY = styles.match(/overflow-y:\s*([^;]+)/);

  console.log(`  overflow-x: ${overflowX ? overflowX[1].trim() : 'НЕ ЗАДАН'}`);
  console.log(`  overflow-y: ${overflowY ? overflowY[1].trim() : 'НЕ ЗАДАН'}`);

  if (overflowX && overflowX[1].trim() === 'auto' &&
      overflowY && overflowY[1].trim() === 'auto') {
    console.log('  ✅ Скролл РАЗРЕШЕН\n');
  } else {
    console.log('  ❌ Скролл ЗАБЛОКИРОВАН\n');
    process.exit(1);
  }
}

// Проверяем все медиа-запросы
console.log('📱 Проверка медиа-запросов:\n');
const mediaQueries = css.match(/@media[^{]+{[^}]*body[^}]*}/gs) || [];
let hasBlocker = false;

mediaQueries.forEach((mq, i) => {
  if (mq.includes('overflow') && mq.includes('hidden')) {
    console.log(`  ❌ Медиа-запрос #${i+1} блокирует скролл:`);
    console.log(`     ${mq.substring(0, 100)}...`);
    hasBlocker = true;
  }
});

if (!hasBlocker) {
  console.log('  ✅ Медиа-запросы не блокируют скролл\n');
}

// Проверяем .wrap
console.log('📦 Проверка контейнера .wrap:\n');
const wrapMatch = css.match(/\.wrap\s*{([^}]+)}/);
if (wrapMatch) {
  const styles = wrapMatch[1];
  const minHeight = styles.match(/min-height:\s*([^;]+)/);
  const paddingBottom = styles.match(/padding-bottom:\s*([^;]+)/);

  if (minHeight) {
    console.log(`  ✅ min-height: ${minHeight[1].trim()}`);
  } else {
    console.log(`  ⚠️  min-height не задан`);
  }

  if (paddingBottom) {
    console.log(`  ✅ padding-bottom: ${paddingBottom[1].trim()}`);
  }
  console.log();
}

// Итоговая проверка
console.log('='.repeat(60));
if (!hasBlocker) {
  console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!');
  console.log('\n💡 Если скролл не работает в браузере:');
  console.log('   1. Очистите кэш: Cmd+Shift+R (Mac) или Ctrl+Shift+R');
  console.log('   2. DevTools → Application → Clear site data');
  console.log('   3. Проверьте что контент длиннее экрана');
  process.exit(0);
} else {
  console.log('❌ НАЙДЕНЫ БЛОКИРОВКИ СКРОЛЛА!');
  process.exit(1);
}
