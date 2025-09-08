#!/usr/bin/env node

/**
 * Простой скрипт для запуска автоматизированных тестов
 * Использование: node test/run-tests.js
 */

const BilateralBoundTester = require('./automated-tests.js');

async function main() {
  console.log('🧪 BilateralBound - Автоматизированное тестирование');
  console.log('='.repeat(50));
  
  const tester = new BilateralBoundTester();
  
  try {
    const results = await tester.runAllTests();
    
    // Возвращаем код выхода в зависимости от результатов
    const allPassed = Object.values(results).every(result => result === true);
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('💥 Критическая ошибка тестирования:', error.message);
    process.exit(1);
  }
}

main();
