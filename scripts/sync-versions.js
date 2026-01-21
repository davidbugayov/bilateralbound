#!/usr/bin/env node

/**
 * Синхронизирует версии во всех package.json с git hash
 * Запускается автоматически через pre-commit хук
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Получаем git hash
function getGitHash() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch (error) {
    console.warn('⚠️  Не удалось получить git hash, используем без хеша')
    return null
  }
}

// Читаем версию из package.json
function readVersion(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const pkg = JSON.parse(content)
    return pkg.version
  } catch (error) {
    console.error(`❌ Ошибка чтения ${filePath}:`, error.message)
    return null
  }
}

// Обновляем версию в package.json
function updateVersion(filePath, version) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const pkg = JSON.parse(content)

    if (pkg.version === version) {
      return false // Версия не изменилась
    }

    pkg.version = version
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    return true
  } catch (error) {
    console.error(`❌ Ошибка обновления ${filePath}:`, error.message)
    return false
  }
}

// Основная логика
function syncVersions() {
  console.log('🔄 Синхронизация версий...\n')

  const rootDir = path.resolve(__dirname, '..')
  const rootPackage = path.join(rootDir, 'package.json')
  const serverPackage = path.join(rootDir, 'packages/server-core/package.json')
  const webPackage = path.join(rootDir, 'packages/web-client/package.json')

  // Читаем версию из root package.json
  const baseVersion = readVersion(rootPackage)
  if (!baseVersion) {
    console.error('❌ Не удалось прочитать версию из root package.json')
    process.exit(1)
  }

  // Убираем существующий git hash из версии (если есть)
  const versionWithoutHash = baseVersion.split('-')[0]

  // Получаем git hash
  const gitHash = getGitHash()

  // Формируем финальную версию с git hash для ВСЕХ package.json
  const finalVersion = gitHash ? `${versionWithoutHash}-${gitHash}` : versionWithoutHash

  console.log(`📦 Базовая версия: ${versionWithoutHash}`)
  if (gitHash) {
    console.log(`🔖 Git hash: ${gitHash}`)
  }
  console.log(`🎯 Финальная версия (для всех): ${finalVersion}`)
  console.log('')

  // Обновляем версии - ОДИНАКОВАЯ везде с git hash
  let changed = false

  if (updateVersion(rootPackage, finalVersion)) {
    console.log(`✅ root/package.json: ${finalVersion}`)
    changed = true
  }

  if (updateVersion(serverPackage, finalVersion)) {
    console.log(`✅ server-core/package.json: ${finalVersion}`)
    changed = true
  }

  if (updateVersion(webPackage, finalVersion)) {
    console.log(`✅ web-client/package.json: ${finalVersion}`)
    changed = true
  }

  if (changed) {
    console.log('\n🎯 Версии синхронизированы!')

    // Добавляем изменения в git
    try {
      execSync('git add package.json packages/*/package.json', { stdio: 'inherit' })
      console.log('✅ Изменения добавлены в git')
    } catch (error) {
      console.warn('⚠️  Не удалось добавить изменения в git автоматически')
    }
  } else {
    console.log('\n✨ Все версии уже актуальны')
  }
}

// Запускаем синхронизацию
if (require.main === module) {
  syncVersions()
}

module.exports = { syncVersions, getGitHash }

