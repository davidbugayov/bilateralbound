#!/usr/bin/env node
/**
 * Минимальная проверка перед запуском основного теста
 */

console.log('🔍 Checking environment...\n')

// 1. Node.js
console.log(`✅ Node.js: ${process.version}`)

// 2. Puppeteer
try {
  require.resolve('puppeteer')
  console.log('✅ Puppeteer: installed')
} catch (err) {
  console.log('❌ Puppeteer: NOT installed')
  console.log('   Run: npm install')
  process.exit(1)
}

// 3. Сервер
async function checkServer() {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

  try {
    const response = await fetch(`${BASE_URL}/health`)
    if (response.ok) {
      console.log(`✅ Server: running on ${BASE_URL}`)
      return true
    }
  } catch (err) {
    console.log(`❌ Server: NOT running on ${BASE_URL}`)
    console.log('   Start: cd packages/server-core && PORT=3000 node server/index.js')
    process.exit(1)
  }
}

checkServer().then(() => {
  console.log('\n✅ All checks passed! You can run the full test.')
  console.log('   npm run test:sse:sync')
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
