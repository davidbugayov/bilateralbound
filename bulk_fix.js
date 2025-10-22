"use strict";
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// Найти все JS файлы в проекте
function findJsFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir);
  for (let file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
    results = results.concat(findJsFiles(filePath));
    } else if (file.endsWith('.js')) {
    results.push(filePath);
    }
  };


  return results;
}
// Применить массовые исправления
function applyBulkFixes() {
  const files = findJsFiles('.');
  let totalFixed = 0;
  for (let file of files) {
    try {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;
    // 1. Исправление: Удаление console.log для production
    const consoleLogRegex = /console\.log\([^)]+\);?\s*$/gm;
    if (consoleLogRegex.test(content)) {
    content = content.replace(consoleLogRegex, '');
    modified = true;
    }
    // 2. Исправление: Добавление строгого равенства
    const looseEqualityRegex = /\beq\(([^(]*(==|!=)[^)]*)\)/g;
    if (looseEqualityRegex.test(content)) {
    content = content.replace(/==(?!=)/g, '===');
    content = content.replace(/!=(?!=)/g, '!==');
    modified = true;
    }
    // 3. Исправление: Добавление проверок на undefined/null
    const undefinedAccessRegex = /(\w+)\.(\w+)\s*===\s*undefined/g;
    if (undefinedAccessRegex.test(content)) {
    content = content.replace(/(\w+)\.(\w+)\s*===\s*undefined/g, '!$1 || !$1.$2');
    modified = true;
    }
    // 4. Исправление: Оптимизация условий if
    const ifOptimizationRegex = /if\s*\(\s*!\s*(!\w+)\s*\)/g;
    if (ifOptimizationRegex.test(content)) {
    content = content.replace(/if\s*\(\s*!!(\w+)\s*\)/g, 'if ($1)');
    modified = true;
    };


    if (modified) {
    fs.writeFileSync(file, content);
    totalFixed++;
    }
    } catch (error) {
    console.error(`Ошибка обработки файла ${file}:`, error.message);
    }
  }
}
// Дополнительные исправления через ESLint
function runAdditionalLints() {
  try {
    execSync('npm run format', { stdio: 'inherit' });
  } catch (error) {
  }
}
// Выполнение
applyBulkFixes();
runAdditionalLints();