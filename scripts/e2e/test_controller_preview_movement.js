#!/usr/bin/env node
/**
 * E2E Test: Controller Preview Ball Movement
 * Проверяет, что мяч движется в превью контроллера при нажатии Play
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3006';
const HEADLESS = process.env.HEADLESS !== 'false';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testControllerPreviewMovement() {
  console.log('🧪 Starting E2E Test: Controller Preview Ball Movement');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`👁️  Headless: ${HEADLESS}`);
  console.log('');

  let browser;
  let passed = true;

  try {
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Включаем логирование консоли браузера
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('ERROR') || text.includes('❌')) {
        console.log(`  [Browser Error] ${text}`);
      }
    });

    console.log('📄 Navigating to test page...');
    await page.goto(`${BASE_URL}/test-controller-preview-movement.html`, {
      waitUntil: 'networkidle0',
      timeout: 10000
    });

    await sleep(500);

    // Ждём инициализации physicsEngine
    await page.waitForFunction(() => typeof physicsEngine !== 'undefined', {
      timeout: 5000
    });

    console.log('✅ Physics engine loaded');
    await sleep(200);

    // Test 1: Проверяем начальное состояние
    console.log('\n✅ Test 1: Initial state');
    const initialState = await page.evaluate(() => {
      return {
        clientSimulation: physicsEngine.options.clientSimulation,
        isViewer: physicsEngine.isViewer,
        paused: physicsEngine.state.paused,
        vx: physicsEngine.ball.vx,
        vy: physicsEngine.ball.vy,
        dirX: physicsEngine.state.lastDirection.x,
        dirY: physicsEngine.state.lastDirection.y
      };
    });

    console.log(`  clientSimulation: ${initialState.clientSimulation}`);
    console.log(`  isViewer: ${initialState.isViewer}`);
    console.log(`  paused: ${initialState.paused}`);

    if (!initialState.clientSimulation) {
      console.log('  ❌ FAIL: clientSimulation should be true');
      passed = false;
    } else {
      console.log('  ✅ PASS: clientSimulation is true');
    }

    if (!initialState.isViewer) {
      console.log('  ❌ FAIL: isViewer should be true');
      passed = false;
    } else {
      console.log('  ✅ PASS: isViewer is true');
    }

    // Test 2: Тест setDirection
    console.log('\n✅ Test 2: setDirection(1, 0)');
    const afterSetDirection = await page.evaluate(() => {
      physicsEngine.setDirection(1, 0);
      return {
        dirX: physicsEngine.state.lastDirection.x,
        dirY: physicsEngine.state.lastDirection.y,
        vx: physicsEngine.ball.vx,
        vy: physicsEngine.ball.vy
      };
    });

    console.log(`  direction: (${afterSetDirection.dirX}, ${afterSetDirection.dirY})`);
    console.log(`  velocity: (${afterSetDirection.vx.toFixed(2)}, ${afterSetDirection.vy.toFixed(2)})`);

    if (afterSetDirection.vx === 0) {
      console.log('  ❌ FAIL: setDirection should update velocity in clientSimulation mode');
      passed = false;
    } else {
      console.log(`  ✅ PASS: Velocity updated (vx=${afterSetDirection.vx.toFixed(2)})`);
    }

    // Test 3: Тест applyCommand с Play
    console.log('\n✅ Test 3: applyCommand({ paused: false, dirX: 1, dirY: 0, speed: 40 })');

    // Сначала ставим на паузу и сбрасываем
    await page.evaluate(() => {
      physicsEngine.setPaused(true);
      physicsEngine.setDirection(0, 0);
      physicsEngine.ball.vx = 0;
      physicsEngine.ball.vy = 0;
    });

    await sleep(100);

    const beforePlay = await page.evaluate(() => {
      return {
        x: physicsEngine.ball.x,
        y: physicsEngine.ball.y,
        paused: physicsEngine.state.paused
      };
    });

    console.log(`  Before: paused=${beforePlay.paused}, pos=(${beforePlay.x.toFixed(2)}, ${beforePlay.y.toFixed(2)})`);

    // Применяем команду Play
    const afterPlay = await page.evaluate(() => {
      const command = {
        paused: false,
        dirX: 1,
        dirY: 0,
        speed: 40
      };
      physicsEngine.applyCommand(command);

      return {
        paused: physicsEngine.state.paused,
        dirX: physicsEngine.state.lastDirection.x,
        dirY: physicsEngine.state.lastDirection.y,
        vx: physicsEngine.ball.vx,
        vy: physicsEngine.ball.vy,
        speed: physicsEngine.ball.speed
      };
    });

    console.log(`  After applyCommand:`);
    console.log(`    paused: ${afterPlay.paused}`);
    console.log(`    direction: (${afterPlay.dirX}, ${afterPlay.dirY})`);
    console.log(`    velocity: (${afterPlay.vx.toFixed(2)}, ${afterPlay.vy.toFixed(2)})`);
    console.log(`    speed: ${afterPlay.speed}%`);

    if (afterPlay.vx === 0 && afterPlay.vy === 0) {
      console.log('  ❌ FAIL: applyCommand should set velocity');
      passed = false;
    } else {
      console.log('  ✅ PASS: Velocity set correctly');
    }

    // Test 4: Проверяем, что мяч действительно движется
    console.log('\n✅ Test 4: Ball actually moves after physics update');

    await sleep(100);

    const afterPhysics = await page.evaluate(() => {
      const x1 = physicsEngine.ball.x;

      // Делаем несколько физических шагов
      for (let i = 0; i < 5; i++) {
        physicsEngine.update(1/60);
      }

      const x2 = physicsEngine.ball.x;

      return {
        x1,
        x2,
        moved: Math.abs(x2 - x1) > 1,
        distance: Math.abs(x2 - x1),
        vx: physicsEngine.ball.vx,
        vy: physicsEngine.ball.vy
      };
    });

    console.log(`  Initial X: ${afterPhysics.x1.toFixed(2)}`);
    console.log(`  After 5 steps X: ${afterPhysics.x2.toFixed(2)}`);
    console.log(`  Distance moved: ${afterPhysics.distance.toFixed(2)} pixels`);
    console.log(`  Current velocity: (${afterPhysics.vx.toFixed(2)}, ${afterPhysics.vy.toFixed(2)})`);

    if (!afterPhysics.moved) {
      console.log('  ❌ FAIL: Ball did not move!');
      console.log('  🔍 This is the CRITICAL bug - ball has velocity but does not move');
      passed = false;
    } else {
      console.log(`  ✅ PASS: Ball moved ${afterPhysics.distance.toFixed(2)} pixels`);
    }

    // Test 5: Интеграционный тест с реальным UI
    console.log('\n✅ Test 5: Integration test with UI button');

    // Нажимаем кнопку "Полный тест"
    await page.click('button:nth-of-type(5)'); // Кнопка "🔬 Полный тест"

    await sleep(500);

    // Проверяем лог на наличие ошибок
    const logContent = await page.evaluate(() => {
      return document.getElementById('log').textContent;
    });

    const hasError = logContent.includes('❌ FAILURE') || logContent.includes('ERROR');
    const hasSuccess = logContent.includes('✅ SUCCESS: Ball is MOVING');

    if (hasError) {
      console.log('  ❌ FAIL: UI test reported errors');
      console.log(`  Log excerpt: ${logContent.slice(-200)}`);
      passed = false;
    } else if (hasSuccess) {
      console.log('  ✅ PASS: UI test confirmed ball is moving');
    } else {
      console.log('  ⚠️  WARNING: Could not determine test result from log');
    }

    // Финальный результат
    console.log('\n' + '='.repeat(60));
    if (passed) {
      console.log('✅ ALL TESTS PASSED - Controller preview ball movement works!');
      console.log('='.repeat(60));
      process.exit(0);
    } else {
      console.log('❌ SOME TESTS FAILED - Controller preview ball does not move correctly');
      console.log('='.repeat(60));
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed with exception:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Запускаем тест
testControllerPreviewMovement();


