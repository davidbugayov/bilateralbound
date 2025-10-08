#!/usr/bin/env node

/**
 * Автоматический менеджер версий для BilateralBound
 * Обновляет версию при каждом значимом коммите
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class VersionManager {
    constructor() {
        this.versionFile = path.join(__dirname, 'VERSION.md');
        this.packageFile = path.join(__dirname, 'package.json');
        this.currentVersion = this.getCurrentVersion();
    }

    /**
     * Получить текущую версию из package.json
     */
    getCurrentVersion() {
        try {
            const packageData = JSON.parse(fs.readFileSync(this.packageFile, 'utf8'));
            return packageData.version || '1.0.0';
        } catch (error) {
            console.log('⚠️ Не удалось прочитать package.json, используем версию по умолчанию');
            return '1.0.0';
        }
    }

    /**
     * Получить информацию о последнем коммите
     */
    getLastCommitInfo() {
        try {
            const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
            const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
            const commitDate = execSync('git log -1 --pretty=%cd --date=iso', { encoding: 'utf8' }).trim();
            const shortHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

            return {
                hash: commitHash,
                shortHash,
                message: commitMessage,
                date: commitDate
            };
        } catch (error) {
            console.log('⚠️ Не удалось получить информацию о коммите');
            return {
                hash: 'unknown',
                shortHash: 'unknown',
                message: 'Initial commit',
                date: new Date().toISOString()
            };
        }
    }

    /**
     * Определить тип изменений для семантического версионирования
     */
    determineVersionBump(commitMessage) {
        const message = commitMessage.toLowerCase();

        // Критерии для major версии
        if (message.includes('breaking') || message.includes('major') || message.includes('breaking change')) {
            return 'major';
        }

        // Критерии для minor версии
        if (message.includes('feat') || message.includes('feature') || message.includes('add') ||
            message.includes('new') || message.includes('minor') || message.includes('optimization')) {
            return 'minor';
        }

        // По умолчанию patch версия
        return 'patch';
    }

    /**
     * Увеличить версию
     */
    bumpVersion(currentVersion, bumpType) {
        const [major, minor, patch] = currentVersion.split('.').map(Number);

        switch (bumpType) {
            case 'major':
                return `${major + 1}.0.0`;
            case 'minor':
                return `${major}.${minor + 1}.0`;
            case 'patch':
            default:
                return `${major}.${minor}.${patch + 1}`;
        }
    }

    /**
     * Обновить версию в package.json
     */
    updatePackageVersion(newVersion) {
        try {
            const packageData = JSON.parse(fs.readFileSync(this.packageFile, 'utf8'));
            packageData.version = newVersion;
            fs.writeFileSync(this.packageFile, JSON.stringify(packageData, null, 2));
            console.log(`✅ Обновлена версия в package.json: ${newVersion}`);
        } catch (error) {
            console.error('❌ Ошибка обновления package.json:', error.message);
        }
    }

    /**
     * Обновить файл VERSION.md
     */
    updateVersionFile(newVersion, commitInfo) {
        const versionData = {
            version: newVersion,
            status: 'Активна',
            releaseDate: new Date().toLocaleString('ru-RU', {
                timeZone: 'Europe/Moscow',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            commitHash: commitInfo.shortHash,
            commitMessage: commitInfo.message,
            timestamp: new Date().toISOString()
        };

        const content = `# BilateralBound - Система Версионирования

## Текущая Версия: v${newVersion}
**Статус:** ${versionData.status}
**Дата релиза:** ${versionData.releaseDate}
**Коммит:** ${versionData.commitHash}

### Основные Изменения v${newVersion}:
- ✨ ${versionData.commitMessage}
- 🔄 Автоматическое обновление версии
- 🚀 Готов к развертыванию

### Предыдущие Версии:
- **v${this.currentVersion}** - Предыдущая версия

### Правила Версионирования:
1. **Major** (X.y.z) - Глобальные изменения архитектуры
2. **Minor** (x.Y.z) - Новые функции и оптимизации
3. **Patch** (x.y.Z) - Исправления ошибок

### Автоматическое Обновление:
- Версия обновляется при каждом значимом коммите
- Деплой происходит автоматически через GitHub Actions
- Мобильная версия скрывает индикатор версии

---
*Автоматически сгенерировано: ${versionData.timestamp}*
`;

        try {
            fs.writeFileSync(this.versionFile, content);
            console.log(`✅ Обновлен файл VERSION.md: v${newVersion}`);
        } catch (error) {
            console.error('❌ Ошибка обновления VERSION.md:', error.message);
        }
    }

    /**
     * Основной процесс обновления версии
     */
    async updateVersion() {
        console.log('🔄 Запуск менеджера версий...');

        const commitInfo = this.getLastCommitInfo();
        console.log(`📋 Последний коммит: ${commitInfo.shortHash}`);
        console.log(`📝 Сообщение: ${commitInfo.message}`);

        // Определяем тип обновления версии
        const bumpType = this.determineVersionBump(commitInfo.message);
        console.log(`📈 Тип обновления: ${bumpType}`);

        // Вычисляем новую версию
        const newVersion = this.bumpVersion(this.currentVersion, bumpType);
        console.log(`🔢 Текущая версия: ${this.currentVersion} → Новая версия: ${newVersion}`);

        // Проверяем, нужна ли новая версия
        if (newVersion === this.currentVersion) {
            console.log('⚠️ Версия не изменилась, пропускаем обновление');
            return false;
        }

        // Обновляем файлы
        this.updatePackageVersion(newVersion);
        this.updateVersionFile(newVersion, commitInfo);

        console.log(`🎉 Версия успешно обновлена до v${newVersion}`);
        return true;
    }

    /**
     * Получить текущую информацию о версии
     */
    getVersionInfo() {
        return {
            current: this.currentVersion,
            file: this.versionFile,
            package: this.packageFile
        };
    }
}

// Экспорт для использования как модуля
module.exports = VersionManager;

// Если запущен напрямую
if (require.main === module) {
    const manager = new VersionManager();
    manager.updateVersion().then(success => {
        if (success) {
            console.log('✅ Процесс обновления версии завершен');
            process.exit(0);
        } else {
            console.log('ℹ️ Обновление версии не требуется');
            process.exit(0);
        }
    }).catch(error => {
        console.error('❌ Ошибка обновления версии:', error.message);
        process.exit(1);
    });
}
