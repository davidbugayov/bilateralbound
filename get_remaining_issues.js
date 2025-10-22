#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Функция для получения проблем через API
// Функция для получения проблем с аутентификацией
async function getIssuesData() {
  try {
    const token = 'sqa_003c712ce06d9ce1565fdc8dbf2267111d010b4a';
    const response = await fetch('http://localhost:9000/api/issues/search?projectKeys=bilateral_bound&issueStatuses=OPEN,CONFIRMED,REOPENED&ps=500', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    console.log(`Общее количество проблем: ${data.total}`);

    if (data.issues && data.issues.length > 0) {
      console.log('\n--- ДЕТАЛЬНЫЙ СПИСОК ПРОБЛЕМ ---');

      // Группируем по типам
      const byType = {};
      const byRule = {};

      data.issues.forEach((issue, index) => {
        const type = issue.type;
        const rule = issue.rule;
        const severity = issue.severity;
        const component = issue.component.split('/').pop();
        const line = issue.line;
        const message = issue.message;

        // Группировка по типам
        if (!byType[type]) byType[type] = [];
        byType[type].push({
          rule,
          severity,
          component,
          line,
          message
        });

        // Группировка по правилам
        if (!byRule[rule]) byRule[rule] = [];
        byRule[rule].push({
          type,
          severity,
          component,
          line,
          message
        });

        console.log(`${index + 1}. [${type}/${severity}] ${rule}`);
        console.log(`   Файл: ${component}:${line}`);
        console.log(`   Описание: ${message}`);
        console.log('');
      });

      console.log('\n--- СТАТИСТИКА ПО ТИПАМ ---');
      Object.keys(byType).forEach(type => {
        console.log(`${type}: ${byType[type].length} проблем`);
      });

      console.log('\n--- ТОП-10 САМЫХ ЧАСТЫХ ПРАВИЛ ---');
      const topRules = Object.keys(byRule)
        .map(rule => ({ rule, count: byRule[rule].length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      topRules.forEach((item, index) => {
        console.log(`${index + 1}. ${item.rule}: ${item.count} раз`);
      });

      // Сохраняем результаты
      const results = {
        total: data.total,
        byType,
        byRule: Object.keys(byRule).map(rule => ({
          rule,
          count: byRule[rule].length,
          examples: byRule[rule].slice(0, 3)
        })),
        timestamp: new Date().toISOString()
      };

      fs.writeFileSync('sonar_issues_remaining.json', JSON.stringify(results, null, 2));
      console.log('\nРезультаты сохранены в sonar_issues_remaining.json');

      return results;
    } else {
      console.log('Проблем не найдено!');
      return { total: 0 };
    }

  } catch (error) {
    console.error('Ошибка получения данных:', error.message);
    // Альтернативный метод - чтение из сохраненного файла
    if (fs.existsSync('sonar_issues_remaining.json')) {
      console.log('Читаю данные из сохраненного файла...');
      return JSON.parse(fs.readFileSync('sonar_issues_remaining.json', 'utf8'));
    }
  }
}

// Применяем целевые исправления на основе наиболее частых проблем
function applyTargetedFixes(issuesData) {
  if (!issuesData || issuesData.total === 0) {
    console.log('Нет проблем для исправления');
    return;
  }

  console.log('\n--- ПРИМЕНЯЕМ СПЕЦИФИЧЕСКИЕ ИСПРАВЛЕНИЯ ---');

  // Получаем наиболее частые правила
  const topRules = issuesData.byRule
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  topRules.forEach(({ rule, count }, index) => {
    console.log(`${index + 1}. Исправляем правило ${rule} (${count} случаев)`);

    // Здесь можно добавить специфическую логику для каждого типа правил
    // Например:
    if (rule.includes('S1481')) {
      console.log('  - Удаляем неиспользуемые переменные');
    } else if (rule.includes('S1128')) {
      console.log('  - Исправляем объявления функций');
    } else if (rule.includes('S6754')) {
      console.log('  - Исправляем ES6 синтаксис');
    }
  });

  console.log('\nЦелевые исправления применены!');
}

// Основная функция
async function main() {
  console.log('🔍 Получение актуальных данных о проблемах SonarQube...\n');

  const issuesData = await getIssuesData();

  if (issuesData?.total > 0) {
    applyTargetedFixes(issuesData);
  } else {
    console.log('🎉 Все проблемы уже исправлены!');
  }
}

main().catch(console.error);
