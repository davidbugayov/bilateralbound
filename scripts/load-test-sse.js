#!/usr/bin/env node
'use strict'

/**
 * Скрипт для сравнения нагрузки WebSocket vs SSE
 * Запускает параллельные сессии и измеряет использование ресурсов
 */

const http = require('http')
const { performance } = require('perf_hooks')

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000'
const NUM_SESSIONS = parseInt(process.env.NUM_SESSIONS || '10', 10)
const DURATION_SEC = parseInt(process.env.DURATION_SEC || '60', 10)
const TRANSPORT = process.env.TRANSPORT || 'sse' // 'sse' or 'websocket'

console.log(`
╔════════════════════════════════════════════════════════════╗
║  Тест нагрузки: ${TRANSPORT.toUpperCase()} Transport                      ║
╠════════════════════════════════════════════════════════════╣
║  Сессий: ${NUM_SESSIONS.toString().padEnd(48)} ║
║  Длительность: ${DURATION_SEC}s${' '.repeat(43)} ║
║  Сервер: ${BASE_URL.padEnd(48)} ║
╚════════════════════════════════════════════════════════════╝
`)

// Статистика
const stats = {
  startTime: Date.now(),
  endTime: null,
  sessions: [],
  totalMessages: 0,
  totalBytes: 0,
  errors: 0,
  reconnects: 0,
  avgLatency: 0,
  memorySnapshots: []
}

/**
 * Создает сессию и подключается
 */
async function createSession(index) {
  return new Promise((resolve, reject) => {
    // Создаем сессию
    const createReq = http.request(`${BASE_URL}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const { sessionId } = JSON.parse(data)
          console.log(`✓ Сессия ${index + 1}/${NUM_SESSIONS} создана: ${sessionId}`)

          const sessionStats = {
            sessionId,
            index,
            messages: 0,
            bytes: 0,
            latencies: [],
            startTime: Date.now(),
            connected: false
          }

          stats.sessions.push(sessionStats)

          if (TRANSPORT === 'sse') {
            connectSSE(sessionStats, resolve, reject)
          } else {
            connectWebSocket(sessionStats, resolve, reject)
          }
        } catch (error) {
          reject(error)
        }
      })
    })

    createReq.on('error', reject)
    createReq.end()
  })
}

/**
 * Подключение через SSE
 */
function connectSSE(sessionStats, resolve, reject) {
  const req = http.request(
    `${BASE_URL}/api/session/${sessionStats.sessionId}/stream?role=viewer`,
    {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    },
    (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE failed with status ${res.statusCode}`))
        return
      }

      sessionStats.connected = true
      console.log(`✓ SSE подключен для сессии ${sessionStats.sessionId}`)

      let buffer = ''

      res.on('data', (chunk) => {
        const data = chunk.toString()
        buffer += data
        sessionStats.bytes += chunk.length
        stats.totalBytes += chunk.length

        // Парсим SSE события
        const events = buffer.split('\n\n')
        buffer = events.pop() || '' // Сохраняем неполное событие

        for (const event of events) {
          if (event.startsWith('event:') || event.startsWith('data:')) {
            sessionStats.messages++
            stats.totalMessages++

            // Измеряем latency если есть timestamp
            const dataMatch = event.match(/data: (.+)/)
            if (dataMatch) {
              try {
                const payload = JSON.parse(dataMatch[1])
                if (payload.timestamp) {
                  const latency = Date.now() - payload.timestamp
                  sessionStats.latencies.push(latency)
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      })

      res.on('error', (error) => {
        stats.errors++
        console.error(`✗ SSE ошибка для сессии ${sessionStats.sessionId}:`, error.message)
      })

      res.on('close', () => {
        sessionStats.connected = false
      })

      resolve(sessionStats)
    }
  )

  req.on('error', (error) => {
    stats.errors++
    reject(error)
  })

  req.end()
}

/**
 * Подключение через WebSocket (для сравнения)
 */
function connectWebSocket(sessionStats, resolve, reject) {
  // Для WebSocket нужна отдельная библиотека
  // Здесь заглушка
  console.warn('⚠ WebSocket тест требует библиотеку ws')
  reject(new Error('WebSocket test not implemented. Use SSE transport.'))
}

/**
 * Получает snapshot использования памяти сервера
 */
async function getMemorySnapshot() {
  return new Promise((resolve) => {
    const req = http.request(`${BASE_URL}/health`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const health = JSON.parse(data)
          resolve({
            timestamp: Date.now(),
            sessions: health.sessions,
            uptime: health.uptime
          })
        } catch (e) {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.end()
  })
}

/**
 * Выводит промежуточную статистику
 */
function printProgress() {
  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000)
  const connectedSessions = stats.sessions.filter(s => s.connected).length
  const messagesPerSec = Math.floor(stats.totalMessages / Math.max(elapsed, 1))
  const bytesPerSec = Math.floor(stats.totalBytes / Math.max(elapsed, 1))

  process.stdout.write(`\r⏱  ${elapsed}s | Сессии: ${connectedSessions}/${NUM_SESSIONS} | ` +
    `Сообщений: ${stats.totalMessages} (${messagesPerSec}/s) | ` +
    `Трафик: ${(stats.totalBytes / 1024).toFixed(1)} KB (${(bytesPerSec / 1024).toFixed(1)} KB/s)`)
}

/**
 * Выводит финальный отчет
 */
function printReport() {
  stats.endTime = Date.now()
  const duration = (stats.endTime - stats.startTime) / 1000

  // Вычисляем среднюю latency
  let totalLatency = 0
  let latencyCount = 0
  for (const session of stats.sessions) {
    for (const lat of session.latencies) {
      totalLatency += lat
      latencyCount++
    }
  }
  stats.avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0

  console.log('\n\n' + '═'.repeat(60))
  console.log('📊 ФИНАЛЬНЫЙ ОТЧЕТ')
  console.log('═'.repeat(60))
  console.log(`Транспорт:           ${TRANSPORT.toUpperCase()}`)
  console.log(`Длительность:        ${duration.toFixed(1)}s`)
  console.log(`Сессий:              ${NUM_SESSIONS}`)
  console.log(`Всего сообщений:     ${stats.totalMessages}`)
  console.log(`Среднее сообщ./сек:  ${(stats.totalMessages / duration).toFixed(1)}`)
  console.log(`Всего трафика:       ${(stats.totalBytes / 1024).toFixed(1)} KB`)
  console.log(`Средний трафик/сек:  ${(stats.totalBytes / 1024 / duration).toFixed(1)} KB/s`)
  console.log(`Средняя latency:     ${stats.avgLatency.toFixed(1)} ms`)
  console.log(`Ошибок:              ${stats.errors}`)
  console.log(`Переподключений:     ${stats.reconnects}`)
  console.log('═'.repeat(60))

  // Сохраняем результаты в файл
  const fs = require('fs')
  const resultsFile = `./load-test-${TRANSPORT}-${Date.now()}.json`
  fs.writeFileSync(resultsFile, JSON.stringify(stats, null, 2))
  console.log(`\n💾 Результаты сохранены в: ${resultsFile}`)
}

/**
 * Главная функция
 */
async function main() {
  try {
    // Создаем все сессии параллельно
    console.log('\n📡 Создание сессий...\n')
    const sessionPromises = []
    for (let i = 0; i < NUM_SESSIONS; i++) {
      sessionPromises.push(createSession(i))
    }

    await Promise.all(sessionPromises)

    console.log(`\n✓ Все ${NUM_SESSIONS} сессий подключены\n`)
    console.log('📊 Сбор статистики...\n')

    // Запускаем мониторинг
    const progressInterval = setInterval(printProgress, 1000)
    const memoryInterval = setInterval(async () => {
      const snapshot = await getMemorySnapshot()
      if (snapshot) {
        stats.memorySnapshots.push(snapshot)
      }
    }, 5000)

    // Ждем указанное время
    await new Promise(resolve => setTimeout(resolve, DURATION_SEC * 1000))

    // Останавливаем мониторинг
    clearInterval(progressInterval)
    clearInterval(memoryInterval)

    // Выводим отчет
    printReport()

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Ошибка:', error)
    process.exit(1)
  }
}

// О��работка прерывания
process.on('SIGINT', () => {
  console.log('\n\n⚠ Тест прерван пользователем')
  printReport()
  process.exit(0)
})

main()
