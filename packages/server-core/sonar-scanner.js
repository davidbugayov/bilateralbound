#!/usr/bin/env node
/* jshint node: true, esversion: 11, strict: true */
'use strict';

const scanner = require('sonarqube-scanner').default;
const path = require('path');
const fs = require('fs');

const serverCoreDir = __dirname;

/**
 * Validates environment before scan
 * @throws {Error} If server directory is missing
 */
function validateEnvironment() {
  if (!fs.existsSync(path.join(serverCoreDir, 'server'))) {
    throw new Error(
      `Server directory not found: ${path.join(serverCoreDir, 'server')}`,
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
    'sonar.projectKey': 'bilateral-bound-server-core',
    'sonar.projectName': 'Bilateral Bound - Server Core',
    'sonar.projectVersion': '2.39.241',
    'sonar.projectBaseDir': serverCoreDir,
    'sonar.sources': 'server',
    'sonar.exclusions':
      '**/node_modules/**,**/dist/**,**/coverage/**,**/.scannerwork/**,**/*.test.js,**/spec/**',
    'sonar.sourceEncoding': 'UTF-8',
    'sonar.qualitygate.wait': 'true',
    'sonar.qualitygate.timeout': '300',
    'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
  },
};

/**
 * Runs SonarQube scan
 * @returns {Promise<void>}
 */
async function runScan() {
  try {
    validateEnvironment();
    console.log('🚀 Starting SonarQube analysis for Server Core...');
    console.log(`📍 Server: ${scannerOptions.serverUrl}`);
    console.log(`📦 Project: ${scannerOptions.options['sonar.projectKey']}`);
    console.log(`📂 Base directory: ${serverCoreDir}`);

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
