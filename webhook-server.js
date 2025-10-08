#!/usr/bin/env node

/**
 * GitHub Webhook Server для автоматического деплоя
 * Обрабатывает push события из GitHub и запускает соответствующие скрипты деплоя
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Конфигурация
const CONFIG = {
  port: 9000,
  secret: process.env.WEBHOOK_SECRET || 'your-webhook-secret-here',
  logFile: '/var/log/webhook-deploy.log',
  
  // Маппинг доменов на конфигурации деплоя
  environments: {
    'emdrbilateral.online': {
      branch: 'stable',
      workDir: '/var/www/bilateralbound-prod',
      serviceName: 'bilateralbound-prod',
      port: 3000
    },
    'emdrbilateral.ru': {
      branch: 'stable',
      workDir: '/var/www/bilateralbound-prod-ru',
      serviceName: 'bilateralbound-prod-ru',
      port: 3001
    },
    'dev.emdrbilateral.online': {
      branch: 'main',
      workDir: '/var/www/bilateralbound-dev',
      serviceName: 'bilateralbound-dev',
      port: 3002
    }
  }
};

// Логирование
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  
  console.log(logMessage.trim());
  
  try {
    fs.appendFileSync(CONFIG.logFile, logMessage);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

// Проверка подписи GitHub
function verifySignature(payload, signature) {
  if (!signature) {
    return false;
  }
  
  const hmac = crypto.createHmac('sha256', CONFIG.secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

// Выполнение команды
function executeCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    log(`Executing: ${command}`);
    
    exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        log(`Error: ${error.message}`, 'ERROR');
        log(`stderr: ${stderr}`, 'ERROR');
        reject(error);
        return;
      }
      
      if (stdout) log(`stdout: ${stdout}`);
      if (stderr) log(`stderr: ${stderr}`, 'WARN');
      
      resolve(stdout);
    });
  });
}

// Деплой приложения
async function deploy(environment, ref) {
  const env = CONFIG.environments[environment];
  
  if (!env) {
    throw new Error(`Unknown environment: ${environment}`);
  }
  
  log(`Starting deployment for ${environment} (${ref})`);
  
  try {
    // 1. Переходим в директорию проекта
    if (!fs.existsSync(env.workDir)) {
      log(`Creating directory: ${env.workDir}`);
      await executeCommand(`mkdir -p ${env.workDir}`, '/tmp');
      await executeCommand(`git clone -b ${env.branch} git@github.com:davidbugayov/bilateralbound.git ${env.workDir}`, '/tmp');
    }
    
    // 2. Останавливаем сервис
    log(`Stopping service: ${env.serviceName}`);
    try {
      await executeCommand(`systemctl stop ${env.serviceName}`, env.workDir);
    } catch (err) {
      log(`Service was not running: ${err.message}`, 'WARN');
    }
    
    // 3. Обновляем код
    log('Pulling latest changes...');
    await executeCommand('git fetch --all', env.workDir);
    await executeCommand(`git checkout ${env.branch}`, env.workDir);
    await executeCommand(`git reset --hard origin/${env.branch}`, env.workDir);
    
    // 4. Устанавливаем зависимости
    log('Installing dependencies...');
    await executeCommand('npm ci --production', env.workDir);
    
    // 5. Копируем конфигурацию systemd (если нужно)
    const serviceFile = `/etc/systemd/system/${env.serviceName}.service`;
    if (!fs.existsSync(serviceFile)) {
      log(`Creating systemd service: ${serviceFile}`);
      const serviceContent = generateServiceFile(env);
      fs.writeFileSync(serviceFile, serviceContent);
      await executeCommand('systemctl daemon-reload', '/tmp');
    }
    
    // 6. Запускаем сервис
    log(`Starting service: ${env.serviceName}`);
    await executeCommand(`systemctl start ${env.serviceName}`, env.workDir);
    await executeCommand(`systemctl enable ${env.serviceName}`, env.workDir);
    
    // 7. Проверяем статус
    await new Promise(resolve => setTimeout(resolve, 3000));
    const status = await executeCommand(`systemctl status ${env.serviceName} --no-pager`, env.workDir);
    log(`Service status:\n${status}`);
    
    log(`✅ Deployment successful for ${environment}`, 'SUCCESS');
    return true;
    
  } catch (error) {
    log(`❌ Deployment failed for ${environment}: ${error.message}`, 'ERROR');
    
    // Пытаемся запустить сервис обратно
    try {
      await executeCommand(`systemctl start ${env.serviceName}`, env.workDir);
    } catch (restartErr) {
      log(`Failed to restart service: ${restartErr.message}`, 'ERROR');
    }
    
    throw error;
  }
}

// Генерация systemd service файла
function generateServiceFile(env) {
  return `[Unit]
Description=BilateralBound EMDR - ${env.serviceName}
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${env.workDir}
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
StartLimitInterval=60s
StartLimitBurst=3

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${env.workDir} /tmp

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${env.serviceName}

Environment=NODE_ENV=production
Environment=PORT=${env.port}

[Install]
WantedBy=multi-user.target
`;
}

// HTTP сервер
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }
  
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      // Проверяем подпись
      const signature = req.headers['x-hub-signature-256'];
      if (!verifySignature(body, signature)) {
        log('Invalid signature', 'ERROR');
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }
      
      // Парсим payload
      const payload = JSON.parse(body);
      const event = req.headers['x-github-event'];
      
      log(`Received ${event} event`);
      
      // Обрабатываем только push события
      if (event !== 'push') {
        log('Ignoring non-push event');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK - event ignored');
        return;
      }
      
      const ref = payload.ref; // refs/heads/main или refs/heads/stable
      const branch = ref.split('/').pop();
      
      log(`Push to branch: ${branch}`);
      
      // Определяем окружения для деплоя
      const environments = Object.entries(CONFIG.environments)
        .filter(([, env]) => env.branch === branch)
        .map(([name]) => name);
      
      if (environments.length === 0) {
        log(`No environments configured for branch: ${branch}`, 'WARN');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK - no matching environments');
        return;
      }
      
      // Отвечаем сразу, чтобы GitHub не ждал
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK - deployment started');
      
      // Запускаем деплой асинхронно
      log(`Starting deployment for environments: ${environments.join(', ')}`);
      
      for (const environment of environments) {
        try {
          await deploy(environment, ref);
        } catch (error) {
          log(`Deployment failed for ${environment}: ${error.message}`, 'ERROR');
        }
      }
      
    } catch (error) {
      log(`Error processing webhook: ${error.message}`, 'ERROR');
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });
});

// Запуск сервера
server.listen(CONFIG.port, () => {
  log(`Webhook server listening on port ${CONFIG.port}`);
  log(`Configured environments: ${Object.keys(CONFIG.environments).join(', ')}`);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'ERROR');
  log(error.stack, 'ERROR');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at ${promise}: ${reason}`, 'ERROR');
});
