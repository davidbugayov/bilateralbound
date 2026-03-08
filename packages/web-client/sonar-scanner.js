const scanner = require('sonarqube-scanner').default;
const path = require('path');
const fs = require('fs');

const webClientDir = __dirname;

// Валидация окружения
function validateEnvironment() {
  if (!fs.existsSync(path.join(webClientDir, 'public', 'js'))) {
    throw new Error(
      `JavaScript directory not found: ${path.join(webClientDir, 'public', 'js')}`,
    );
  }
}

const scannerOptions = {
  serverUrl: process.env.SONARQUBE_HOST || 'http://localhost:9000',
  token:
    process.env.SONARQUBE_TOKEN ||
    'squ_4c5f0fafcba46d0827a22d5ba95dc50cae7eb9d2',
  options: {
    'sonar.projectKey': 'bilateral-bound-web-client',
    'sonar.projectName': 'Bilateral Bound - Web Client',
    'sonar.projectVersion': '2.39.241',
    'sonar.projectBaseDir': webClientDir,
    'sonar.sources': 'public/js',
    'sonar.exclusions':
      '**/node_modules/**,**/dist/**,**/coverage/**,**/.scannerwork/**,**/*.test.js,**/spec/**,**/vendor/**,**/*.bundle.js',
    'sonar.sourceEncoding': 'UTF-8',
    'sonar.qualitygate.wait': true,
    'sonar.qualitygate.timeout': 300,
    // ESLint integration for code quality
    'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
    'sonar.javascript.exclusions': '**/vendor/**,**/*.min.js',
    'sonar.javascript.node_modules': true,
  },
};

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

runScan();
