#!/usr/bin/env node

/**
 * Главный скрипт для запуска всех тестов BilateralBound
 * Использование: node test.js [тип_тестов]
 * 
 * Типы тестов:
 * - all (по умолчанию) - все тесты
 * - basic - базовые тесты
 * - sync - тесты синхронизации
 * - quick - быстрые тесты
 */

const BilateralBoundTester = require('./test/automated-tests.js');

async function runBasicTests() {
  console.log('🧪 Запуск базовых тестов...');
  const tester = new BilateralBoundTester();
  return await tester.runAllTests();
}

async function runSyncTests() {
  console.log('🔄 Запуск тестов синхронизации...');
  // Синхронизационные тесты интегрированы в базовые тесты
  return await runBasicTests();
}

async function runQuickTests() {
  console.log('⚡ Запуск быстрых тестов...');
  const tester = new BilateralBoundTester();
  
  // Запускаем только критически важные тесты
  try {
    await tester.startServer();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const healthCheck = await tester.testHealthCheck();
    const sessionId = await tester.testSessionCreation();
    const sessionState = sessionId ? await tester.testSessionState(sessionId) : false;
    
    await tester.stopServer();
    
    return {
      healthCheck,
      sessionCreation: sessionId !== null,
      sessionState: sessionState !== null
    };
  } catch (error) {
    console.error('❌ Ошибка быстрых тестов:', error.message);
    return { healthCheck: false, sessionCreation: false, sessionState: false };
  }
}

async function main() {
  const testType = process.argv[2] || 'all';
  
  console.log('🚀 BilateralBound - Автоматизированное тестирование');
  console.log('='.repeat(60));
  console.log(`📋 Тип тестов: ${testType}`);
  console.log('='.repeat(60));
  
  let results = {};
  
  try {
    switch (testType) {
      case 'basic':
        results = await runBasicTests();
        break;
        
      case 'sync':
        results = await runSyncTests();
        break;
        
      case 'quick':
        results = await runQuickTests();
        break;
        
      case 'all':
      default:
        console.log('🔄 Запуск всех тестов...');
        const basicResults = await runBasicTests();
        const syncResults = await runSyncTests();
        
        results = {
          ...basicResults,
          ...syncResults
        };
        break;
    }
    
    // Подсчитываем общие результаты
    const allResults = Object.values(results);
    const passedTests = allResults.filter(r => r === true).length;
    const totalTests = allResults.length;
    
    console.log('='.repeat(60));
    console.log('📊 ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ:');
    console.log('='.repeat(60));
    console.log(`✅ Пройдено: ${passedTests}`);
    console.log(`❌ Провалено: ${totalTests - passedTests}`);
    console.log(`📈 Общий процент: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
      console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
      process.exit(0);
    } else {
      console.log(`⚠️ ${totalTests - passedTests} тестов провалено`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Критическая ошибка тестирования:', error.message);
    process.exit(1);
  }
}

// Показываем справку
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🧪 BilateralBound - Автоматизированное тестирование

Использование:
  node test.js [тип_тестов]

Типы тестов:
  all     - Все тесты (по умолчанию)
  basic   - Базовые тесты (сервер, сессии, движение)
  sync    - Тесты синхронизации (частота, точность, границы)
  quick   - Быстрые тесты (только критически важные)

Примеры:
  node test.js           # Все тесты
  node test.js basic     # Только базовые тесты
  node test.js sync      # Только тесты синхронизации
  node test.js quick     # Быстрые тесты

Коды выхода:
  0 - Все тесты пройдены
  1 - Один или более тестов провалены
  `);
  process.exit(0);
}

main();
