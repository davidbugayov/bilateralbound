#!/usr/bin/env node
/**
 * Тест долгого SSE подключения (проверка heartbeat)
 */

const https = require('https')

const BASE_URL = process.env.TEST_URL || 'https://dev.emdrbilateral.online'
const TEST_DURATION = 90000 // 90 секунд

console.log('🔍 Testing SSE heartbeat for 90 seconds:', BASE_URL)

// 1. Создаем сессию
async function createSession() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/session', BASE_URL)

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }

    const req = https.request(url, options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          const parsed = JSON.parse(data)
          console.log('✅ Session created:', parsed.sessionId)
          resolve(parsed.sessionId)
        } else {
          reject(new Error(`Failed to create session: ${res.statusCode} - ${data}`))
        }
      })
    })

    req.on('error', reject)
    req.end()
  })
}

// 2. Тестируем SSE endpoint на протяжении 90 секунд
async function testSSEHeartbeat(sessionId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/session/${sessionId}/stream?role=viewer`, BASE_URL)

    console.log('📡 Connecting to SSE:', url.href)
    console.log('⏱️  Will monitor for', TEST_DURATION / 1000, 'seconds...\n')

    const startTime = Date.now()
    let eventCount = 0
    let lastEventTime = startTime

    const req = https.request(url, {
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE failed with status: ${res.statusCode}`))
        return
      }

      console.log('✅ SSE connection established\n')

      let buffer = ''
      res.on('data', (chunk) => {
        buffer += chunk.toString()
        const now = Date.now()
        const elapsed = Math.floor((now - startTime) / 1000)
        const timeSinceLastEvent = Math.floor((now - lastEventTime) / 1000)

        eventCount++
        lastEventTime = now

        // Логируем каждое полученное событие
        if (buffer.includes('event:')) {
          const lines = buffer.split('\n')
          const eventLine = lines.find(l => l.startsWith('event:'))
          if (eventLine) {
            console.log(`[${elapsed}s] Event #${eventCount}: ${eventLine} (gap: ${timeSinceLastEvent}s)`)
          }
        } else if (buffer.includes(': heartbeat')) {
          console.log(`[${elapsed}s] Heartbeat #${eventCount} received (gap: ${timeSinceLastEvent}s)`)
        }

        buffer = ''
      })

      res.on('end', () => {
        const duration = Math.floor((Date.now() - startTime) / 1000)
        console.log(`\n⚠️  SSE stream ended after ${duration}s (expected ${TEST_DURATION/1000}s)`)
        reject(new Error('Stream ended prematurely'))
      })

      res.on('error', (err) => {
        const duration = Math.floor((Date.now() - startTime) / 1000)
        console.log(`\n❌ Stream error after ${duration}s:`, err.message)
        reject(err)
      })
    })

    req.on('error', (err) => {
      console.error('❌ Request error:', err.message)
      reject(err)
    })

    req.end()

    // Завершаем тест через TEST_DURATION
    setTimeout(() => {
      const duration = Math.floor((Date.now() - startTime) / 1000)
      console.log('\n✅ Test completed successfully!')
      console.log(`📊 Duration: ${duration}s`)
      console.log(`📊 Events received: ${eventCount}`)
      console.log(`📊 Average event rate: ${(eventCount / duration).toFixed(2)} events/sec`)
      req.abort()
      resolve(true)
    }, TEST_DURATION)
  })
}

// Запуск теста
(async () => {
  try {
    const sessionId = await createSession()
    await testSSEHeartbeat(sessionId)
    console.log('\n✅ HEARTBEAT TEST PASSED - Connection stable for 90 seconds')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ HEARTBEAT TEST FAILED:', error.message)
    process.exit(1)
  }
})()
