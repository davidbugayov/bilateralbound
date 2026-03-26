/* jshint node: true, esversion: 8, strict: true */
'use strict';

const scanner = require('sonarqube-scanner').default;
const path = require('node:path');
const fs = require('node:fs');

const webClientDir = __dirname;

/**
 * Валидация окружения
 * @throws {Error} Если каталог JS не найден
 */
function validateEnvironment() {
  if (!fs.existsSync(path.join(webClientDir, 'public', 'js'))) {
    throw new Error(
      `JavaScript directory not found: ${path.join(webClientDir, 'public', 'js')}`,
    );
  }

  if (!process.env.SONARQUBE_TOKEN) {
    throw new Error('SONARQUBE_TOKEN environment variable is not set');
  }
}

/**
 * @type {Object}
 */
const scannerOptions = {
  serverUrl: process.env.SONARQUBE_HOST || 'http://localhost:9000',
  token: process.env.SONARQUBE_TOKEN,
  options: {
    'sonar.projectKey': 'bilateral-bound-web-client',
    'sonar.projectName': 'Bilateral Bound - Web Client',
    'sonar.projectVersion': '2.39.269',
    'sonar.projectBaseDir': webClientDir,
    'sonar.sources': 'public/js',
    'sonar.exclusions':
      '**/node_modules/**,**/dist/**,**/coverage/**,**/.scannerwork/**,**/*.test.js,**/spec/**,**/vendor/**,**/*.bundle.js',
    'sonar.sourceEncoding': 'UTF-8',
    'sonar.qualitygate.wait': 'true',
    'sonar.qualitygate.timeout': '300',
    'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
    'sonar.javascript.exclusions': '**/vendor/**,**/*.min.js',
    'sonar.javascript.node_modules': 'true',
  },
};

/**
 * Запускает SonarQube анализ
 * @returns {Promise<void>}
 */
async function runScan() {
  try {
    validateEnvironment();
    console.log('🚀 Starting SonarQube analysis for Web Client...');
    console.log(`📍 Server: ${scannerOptions.serverUrl}`);
    console.log(`📦 Project: ${scannerOptions.options['sonar.projectKey']}`);
    console.log(`📂 Base directory: ${webClientDir}`);

    await scanner(scannerOptions, () => {
      console.log('✅ SonarQube analysis completed successfully');
      console.log(
        '📊 View results at:',
        `${scannerOptions.serverUrl}/dashboard?id=${scannerOptions.options['sonar.projectKey']}`,
      );
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ SonarQube analysis failed');
    console.error('Error:', error?.message || error);

    if (error?.message?.includes('ECONNREFUSED')) {
      console.error('⚠️  Cannot connect to SonarQube server');
      console.error(
        `   Ensure SonarQube is running at ${scannerOptions.serverUrl}`,
      );
    }

    process.exit(1);
  }
}

// Run the scan
runScan();
