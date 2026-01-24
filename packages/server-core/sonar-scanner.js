#!/usr/bin/env node

const scanner = require('sonarqube-scanner').default
const path = require('path')
const fs = require('fs')

const serverCoreDir = __dirname

// Валидация окружения
function validateEnvironment() {
  if (!fs.existsSync(path.join(serverCoreDir, 'server'))) {
    throw new Error(`Server directory not found: ${path.join(serverCoreDir, 'server')}`)
  }
}

const scannerOptions = {
  serverUrl: process.env.SONARQUBE_HOST || 'http://localhost:9000',
  token: process.env.SONARQUBE_TOKEN || 'squ_4c5f0fafcba46d0827a22d5ba95dc50cae7eb9d2',
  options: {
    'sonar.projectKey': 'bilateral-bound-server-core',
    'sonar.projectName': 'Bilateral Bound - Server Core',
    'sonar.projectVersion': '2.39.5',
    'sonar.projectBaseDir': serverCoreDir,
    'sonar.sources': 'server',
    'sonar.exclusions': '**/node_modules/**,**/dist/**,**/coverage/**,**/.scannerwork/**,**/*.test.js,**/spec/**',
    'sonar.sourceEncoding': 'UTF-8',
    'sonar.qualitygate.wait': false,
    'sonar.qualitygate.timeout': 300
  }
}

async function runScan() {
  try {
    validateEnvironment()
    console.log('🚀 Starting SonarQube analysis...')
    console.log(`📍 Server: ${scannerOptions.serverUrl}`)
    console.log(`📦 Project: ${scannerOptions.options['sonar.projectKey']}`)

    await scanner(scannerOptions, () => {
      console.log('✅ SonarQube analysis completed successfully')
      console.log('📊 View results at:', `${scannerOptions.serverUrl}/projects/${scannerOptions.options['sonar.projectKey']}`)
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ SonarQube analysis failed')
    console.error('Error:', error?.message || error)

    if (error?.message?.includes('ECONNREFUSED')) {
      console.error('⚠️  Cannot connect to SonarQube server')
      console.error(`   Ensure SonarQube is running at ${scannerOptions.serverUrl}`)
    }

    process.exit(1)
  }
}

runScan()
