#!/usr/bin/env node

/**
 * Скрипт развертывания BilateralBound на Render.com
 * Проверяет готовность проекта и создает инструкции для развертывания
 */

const fs = require('fs');
const path = require('path');

class DeployHelper {
  constructor() {
    this.projectRoot = path.resolve(__dirname);
    this.checks = {
      packageJson: false,
      renderYaml: false,
      renderIgnore: false,
      serverFile: false,
      publicFiles: false,
      dependencies: false
    };
  }

  async run() {
    console.log('🚀 ПОДГОТОВКА К РАЗВЕРТЫВАНИЮ BILATERALBOUND');
    console.log('═'.repeat(60));

    try {
      await this.performChecks();
      this.generateReport();
      this.printDeploymentInstructions();

    } catch (error) {
      console.error('❌ Ошибка подготовки:', error.message);
      process.exit(1);
    }
  }

  async performChecks() {
    console.log('\n🔍 ПРОВЕРКА ГОТОВНОСТИ ПРОЕКТА:');

    // 1. Проверка package.json
    if (fs.existsSync('package.json')) {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      this.checks.packageJson = true;
      console.log('✅ package.json найден');

      if (pkg.scripts && pkg.scripts.start) {
        console.log('   📦 Скрипт start: OK');
      } else {
        console.log('   ⚠️  Скрипт start отсутствует');
      }

      if (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) {
        this.checks.dependencies = true;
        console.log(`   📦 Зависимости: ${Object.keys(pkg.dependencies).length} шт.`);
      }
    } else {
      console.log('❌ package.json не найден');
    }

    // 2. Проверка render.yaml
    if (fs.existsSync('render.yaml')) {
      this.checks.renderYaml = true;
      console.log('✅ render.yaml найден');
    } else {
      console.log('❌ render.yaml не найден');
    }

    // 3. Проверка .renderignore
    if (fs.existsSync('.renderignore')) {
      this.checks.renderIgnore = true;
      console.log('✅ .renderignore найден');
    } else {
      console.log('⚠️  .renderignore не найден (необязательно)');
    }

    // 4. Проверка основного файла сервера
    if (fs.existsSync('src/server.js')) {
      this.checks.serverFile = true;
      console.log('✅ src/server.js найден');
    } else {
      console.log('❌ src/server.js не найден');
    }

    // 5. Проверка публичных файлов
    if (fs.existsSync('public')) {
      this.checks.publicFiles = true;
      const files = fs.readdirSync('public');
      console.log(`✅ public/ директория найдена (${files.length} файлов)`);
    } else {
      console.log('❌ public/ директория не найдена');
    }

    // 6. Проверка на наличие тестов
    const testFiles = fs.readdirSync('.').filter(file =>
      file.startsWith('test') && file.endsWith('.js')
    );
    if (testFiles.length > 0) {
      console.log(`✅ Найдено тестов: ${testFiles.length} шт.`);
    }

    // 7. Проверка размера проекта
    await this.checkProjectSize();
  }

  async checkProjectSize() {
    const { execSync } = require('child_process');

    try {
      const output = execSync('du -sh . 2>/dev/null || echo "N/A"', { encoding: 'utf8' });
      const size = output.trim().split('\t')[0];
      console.log(`📊 Размер проекта: ${size}`);
    } catch (error) {
      console.log('📊 Размер проекта: не удалось определить');
    }
  }

  generateReport() {
    console.log('\n📋 ОТЧЕТ ГОТОВНОСТИ:');

    const allChecks = Object.values(this.checks);
    const passedChecks = allChecks.filter(Boolean).length;
    const totalChecks = allChecks.length;

    console.log(`   ✅ Пройдено проверок: ${passedChecks}/${totalChecks}`);

    if (passedChecks === totalChecks) {
      console.log('   🎉 ПРОЕКТ ПОЛНОСТЬЮ ГОТОВ К РАЗВЕРТЫВАНИЮ!');
    } else {
      console.log('   ⚠️  Есть проблемы, требующие исправления');
    }

    // Детальный отчет
    console.log('\n   Детали:');
    Object.entries(this.checks).forEach(([check, passed]) => {
      const status = passed ? '✅' : '❌';
      const name = this.formatCheckName(check);
      console.log(`     ${status} ${name}`);
    });
  }

  formatCheckName(check) {
    const names = {
      packageJson: 'package.json',
      renderYaml: 'render.yaml',
      renderIgnore: '.renderignore',
      serverFile: 'Файл сервера',
      publicFiles: 'Публичные файлы',
      dependencies: 'Зависимости'
    };
    return names[check] || check;
  }

  printDeploymentInstructions() {
    console.log('\n🚀 ИНСТРУКЦИИ ПО РАЗВЕРТЫВАНИЮ:');
    console.log('═'.repeat(60));

    console.log('1️⃣  Подготовка:');
    console.log('   • Убедитесь, что все проверки пройдены');
    console.log('   • Создайте аккаунт на render.com');
    console.log('   • Подготовьте репозиторий на GitHub/GitLab');

    console.log('\n2️⃣  Развертывание на Render.com:');
    console.log('   1. Перейдите на https://render.com');
    console.log('   2. Нажмите "New" → "Web Service"');
    console.log('   3. Подключите ваш репозиторий');
    console.log('   4. Выберите:');
    console.log('      • Runtime: Node.js');
    console.log('      • Build Command: npm install');
    console.log('      • Start Command: npm start');
    console.log('   5. Настройте переменные окружения (если нужно)');
    console.log('   6. Нажмите "Create Web Service"');

    console.log('\n3️⃣  Проверка развертывания:');
    console.log('   • Дождитесь завершения сборки');
    console.log('   • Перейдите по предоставленному URL');
    console.log('   • Проверьте /health эндпоинт');
    console.log('   • Создайте тестовую сессию');

    console.log('\n4️⃣  Мониторинг:');
    console.log('   • Следите за логами в Render Dashboard');
    console.log('   • Настройте alerts при необходимости');
    console.log('   • Мониторьте использование ресурсов');

    console.log('\n📞 ПОДДЕРЖКА:');
    console.log('   Если возникнут проблемы:');
    console.log('   • Проверьте логи сборки на Render');
    console.log('   • Убедитесь в корректности package.json');
    console.log('   • Проверьте переменные окружения');

    console.log('\n🎯 ПРИГОТОВИТЬСЯ К ЗАПУСКУ!');
    console.log('═'.repeat(60));
  }

  createDeploymentChecklist() {
    const checklist = [
      '✅ Аккаунт Render.com создан',
      '✅ Репозиторий на GitHub/GitLab',
      '✅ Проект загружен в репозиторий',
      '✅ Все тесты пройдены локально',
      '✅ package.json настроен корректно',
      '✅ render.yaml присутствует',
      '✅ .renderignore настроен',
      '✅ Переменные окружения подготовлены',
      '✅ Доменное имя (опционально)'
    ];

    console.log('\n📝 ЧЕК-ЛИСТ РАЗВЕРТЫВАНИЯ:');
    checklist.forEach(item => console.log(`   ${item}`));
  }
}

// Запуск помощника развертывания
if (require.main === module) {
  const helper = new DeployHelper();
  helper.run().then(() => {
    helper.createDeploymentChecklist();
  }).catch(console.error);
}

module.exports = DeployHelper;

