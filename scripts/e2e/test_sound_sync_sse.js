#!/usr/bin/env node
/**
 * E2E тест: Проверка синхронизации звука между Controller и Viewer через SSE
 *
 * Сценарий:
 * 1. Создать сессию
 * 2. Подключить Viewer через SSE
 * 3. Подключить Controller
 * 4. Controller включает звук
 * 5. Проверить что Viewer получил событие soundEnabled=true
 */

const http = require('http')
const https = require('https')
const { EventSource } = require('eventsource')

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000'

let testsPassed = 0
let testsFailed = 0

function log(message, level = 'info') {
  const timestamp = new Date().toISOString()
  const prefix = {
    info: '✓',
    error: '✗',
    warn: '⚠',
    debug: '•'
  }[level] || '•'

  console.log(`${prefix} [${timestamp}] ${message}`)
}

function assert(condition, message) {
  if (condition) {
    testsPassed++
    log(`PASS: ${message}`, 'info')
  } else {
    testsFailed++
    log(`FAIL: ${message}`, 'error')
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function httpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    // Выбираем правильный модуль в зависимости от протокола
    const protocol = url.protocol === 'https:' ? https : http

    const req = protocol.request(url, options, (res) => {
      let data = ''
res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {}
          resolve({ status: res.statusCode, data: parsed })
        } catch {
          resolve({ status: res.statusCode, data: data })
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }

    req.end()
  })
}

async function createSession() {
  log('Создание новой сессии...', 'debug')
  const response = await httpRequest('/api/session', 'POST')
  assert(response.status === 200, 'Session created')
  assert(response.data.sessionId, 'Session has ID')
  return response.data.sessionId
}

async function connectViewerSSE(sessionId) {
  log(`Подключение Viewer через SSE к сессии ${sessionId}...`, 'debug')

  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/api/session/${sessionId}/stream?role=viewer`
    log(`SSE URL: ${url}`, 'debug')
    const eventSource = new EventSource(url)

    const receivedEvents = []
    let initialStateReceived = false

    eventSource.onopen = () => {
      log('✓ SSE connection opened successfully', 'info')
    }

    eventSource.onmessage = (e) => {
      log(`Received generic message: ${e.data}`, 'debug')
    }

    eventSource.addEventListener('initial_state', (e) => {
      log('✓ Received initial_state event', 'info')
      try {
        const data = JSON.parse(e.data)
        log(`Initial state: ${JSON.stringify(data)}`, 'debug')
        receivedEvents.push({ type: 'initial_state', data })
        initialStateReceived = true
      } catch (error) {
        log(`Error parsing initial_state: ${error.message}`, 'error')
      }
    })

    eventSource.addEventListener('state_update', (e) => {
      log('Received state_update event', 'debug')
      try {
        const data = JSON.parse(e.data)
        log(`State update: ${JSON.stringify(data)}`, 'debug')
        receivedEvents.push({ type: 'state_update', data })
      } catch (error) {
        log(`Error parsing state_update: ${error.message}`, 'error')
      }
    })

    eventSource.onerror = (error) => {
      log(`⚠️ SSE error - readyState: ${eventSource.readyState}, error: ${JSON.stringify(error)}`, 'warn')

      if (eventSource.readyState === EventSource.CLOSED) {
        log('SSE connection closed by server', 'error')
        clearTimeout(timeout)
        clearInterval(checkInterval)
        reject(new Error('SSE connection closed'))
      }
    }

    // Ждем получения initial_state
    const timeout = setTimeout(() => {
      if (initialStateReceived) {
        resolve({ eventSource, receivedEvents })
      } else {
        log(`Timeout - received ${receivedEvents.length} events, waiting for initial_state`, 'error')
        eventSource.close()
        reject(new Error('Timeout waiting for initial_state'))
      }
    }, 10000) // Увеличили до 10 секунд

    // Если получили initial_state раньше таймаута
    const checkInterval = setInterval(() => {
      if (initialStateReceived) {
        clearTimeout(timeout)
        clearInterval(checkInterval)
        resolve({ eventSource, receivedEvents })
      }
    }, 100)
  })
}

async function enableSoundOnController(sessionId) {
  log('Controller включает звук...', 'debug')
  const response = await httpRequest(
    `/api/session/${sessionId}/controller/update`,
    'POST',
    {
      soundEnabled: true,
      soundType: 'soft'
    }
  )
  assert(response.status === 200, 'Controller update successful')
  return response.data
}

async function waitForSoundEnabledEvent(receivedEvents, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const checkEvents = () => {
      // Проверяем есть ли событие с soundEnabled: true
      const soundEvent = receivedEvents.find(event => {
        const payload = event.data.payload || event.data
        return payload.soundEnabled === true
      })

      if (soundEvent) {
        log('Found soundEnabled event!', 'debug')
        resolve(soundEvent)
      } else if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Timeout waiting for soundEnabled event'))
      } else {
        setTimeout(checkEvents, 100)
      }
    }

    checkEvents()
  })
}

async function runTest() {
  console.log('\n' + '='.repeat(70))
  console.log('E2E Test: Sound Sync Controller → Viewer via SSE')
  console.log('='.repeat(70) + '\n')

  let sessionId
  let viewerConnection

  try {
    // 1. Создаем сессию
    sessionId = await createSession()
    log(`Session ID: ${sessionId}`, 'info')

    // 2. Подключаем Viewer через SSE
    viewerConnection = await connectViewerSSE(sessionId)
    assert(viewerConnection.eventSource.readyState === EventSource.OPEN, 'Viewer SSE connected')
    assert(viewerConnection.receivedEvents.length > 0, 'Viewer received initial_state')

    // 3. Проверяем что initial_state содержит soundEnabled: false
    const initialState = viewerConnection.receivedEvents[0]
    const initialPayload = initialState.data.payload || initialState.data
    assert(initialPayload.soundEnabled === false, 'Initial soundEnabled is false')
    log(`Initial soundEnabled: ${initialPayload.soundEnabled}`, 'debug')

    // 4. Ждем немного чтобы убедиться что SSE работает
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 5. Controller включает звук
    await enableSoundOnController(sessionId)

    // 6. Ждем события soundEnabled: true на Viewer
    log('Ожидание события soundEnabled=true на Viewer...', 'debug')
    const soundEvent = await waitForSoundEnabledEvent(viewerConnection.receivedEvents, 10000)
    const soundPayload = soundEvent.data.payload || soundEvent.data
    assert(soundPayload.soundEnabled === true, 'Viewer received soundEnabled=true')
    assert(soundPayload.soundType === 'soft', 'Viewer received soundType=soft')

    log('\n' + '='.repeat(70), 'info')
    log('✅ ALL TESTS PASSED', 'info')
    log(`Passed: ${testsPassed}, Failed: ${testsFailed}`, 'info')
    log('='.repeat(70) + '\n', 'info')

    // Закрываем соединение
    viewerConnection.eventSource.close()
    process.exit(0)

  } catch (error) {
    log('\n' + '='.repeat(70), 'error')
    log(`❌ TEST FAILED: ${error.message}`, 'error')
    log(`Passed: ${testsPassed}, Failed: ${testsFailed}`, 'error')
    log('='.repeat(70) + '\n', 'error')

    if (viewerConnection) {
      viewerConnection.eventSource.close()
    }

    process.exit(1)
  }
}

// Запускаем тест
runTest().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
