#!/usr/bin/env node
/**
 * Простой тест SSE подключения
 */

const https = require('https');

const BASE_URL = process.env.TEST_URL || 'https://dev.emdrbilateral.online';

console.log('🔍 Testing SSE connection to:', BASE_URL);

// 1. Создаем сессию
async function createSession() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/session', BASE_URL);

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const parsed = JSON.parse(data);
          console.log('✅ Session created:', parsed.sessionId);
          resolve(parsed.sessionId);
        } else {
          reject(new Error(`Failed to create session: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 2. Тестируем SSE endpoint
async function testSSE(sessionId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/session/${sessionId}/stream?role=viewer`, BASE_URL);

    console.log('📡 Connecting to SSE:', url.href);

    const req = https.request(url, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      console.log('📊 Response status:', res.statusCode);
      console.log('📊 Response headers:', res.headers);

      if (res.statusCode !== 200) {
        reject(new Error(`SSE failed with status: ${res.statusCode}`));
        return;
      }

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        console.log('📦 Received data:', buffer);

        // Проверяем на события
        if (buffer.includes('event:')) {
          console.log('✅ SSE events received!');
          resolve(true);
        }
      });

      res.on('end', () => {
        console.log('🔚 SSE stream ended');
        resolve(false);
      });

      // Таймаут 5 секунд
      setTimeout(() => {
        console.log('⏱️ Timeout - no data received in 5 seconds');
        req.abort();
        reject(new Error('Timeout'));
      }, 5000);
    });

    req.on('error', (err) => {
      console.error('❌ Request error:', err.message);
      reject(err);
    });

    req.end();
  });
}

// Запуск теста
(async () => {
  try {
    const sessionId = await createSession();
    await testSSE(sessionId);
    console.log('\n✅ TEST PASSED');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
})();
