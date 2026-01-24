#!/usr/bin/env node
/**
 * Master E2E Test - проверка физики движения мяча
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Запуск master E2E теста...\n');

// Симуляция окружения браузера
global.performance = { now: () => Date.now() };
global.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};

// Загружаем физический движок
const physicsEnginePath = path.join(__dirname, '..', '..', 'packages', 'web-client', 'public', 'js', 'physics-engine.js');

if (!fs.existsSync(physicsEnginePath)) {
  console.error('❌ Файл physics-engine.js не найден:', physicsEnginePath);
  process.exit(1);
}

const physicsCode = fs.readFileSync(physicsEnginePath, 'utf8');
eval(physicsCode);

// Тесты
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Тест 1: Вертикальное движение
test('Вертикальное движение остается вертикальным', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    maxSpeed: 500,
    minSpeed: 50,
    ballRadius: 20,
    isServer: true
  });

  engine.setPosition(400, 300);
  engine.setSpeed(50);
  engine.setDirection(0, 1);

  for (let i = 0; i < 100; i++) {
    engine.update(0.016);
  }

  const dirX = engine.state.lastDirection.x || 0;
  const dirY = engine.state.lastDirection.y || 0;

  assert(Math.abs(dirX) < 1e-5, `dirX должен быть 0, получено ${dirX}`);
  assert(Math.abs(dirY) > 0.9, `dirY должен быть ≈1, получено ${dirY}`);
  assert(Math.abs(engine.ball.vx) < 0.1, `vx должен быть ≈0, получено ${engine.ball.vx}`);
});

// Тест 2: Горизонтальное движение
test('Горизонтальное движение остается горизонтальным', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    maxSpeed: 500,
    minSpeed: 50,
    ballRadius: 20,
    isServer: true
  });

  engine.setPosition(400, 300);
  engine.setSpeed(50);
  engine.setDirection(1, 0);

  for (let i = 0; i < 100; i++) {
    engine.update(0.016);
  }

  const dirX = engine.state.lastDirection.x || 0;
  const dirY = engine.state.lastDirection.y || 0;

  assert(Math.abs(dirY) < 1e-5, `dirY должен быть 0, получено ${dirY}`);
  assert(Math.abs(dirX) > 0.9, `dirX должен быть ≈1, получено ${dirX}`);
  assert(Math.abs(engine.ball.vy) < 0.1, `vy должен быть ≈0, получено ${engine.ball.vy}`);
});

// Тест 3: Вертикальное движение у стенки
test('Вертикальное движение у стенки не становится диагональным', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    maxSpeed: 500,
    minSpeed: 50,
    ballRadius: 20,
    isServer: true
  });

  engine.setPosition(25, 300);
  engine.setSpeed(50);
  engine.setDirection(0, 1);

  for (let i = 0; i < 50; i++) {
    engine.update(0.016);
  }

  const dirX = engine.state.lastDirection.x || 0;

  assert(Math.abs(dirX) < 1e-5, `dirX должен оставаться 0 у стенки, получено ${dirX}`);
  assert(Math.abs(engine.ball.vx) < 0.1, `vx должен оставаться ≈0 у стенки, получено ${engine.ball.vx}`);
});

// Тест 4: ensureMinimumSpeed
test('ensureMinimumSpeed сохраняет направление', () => {
  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    maxSpeed: 500,
    minSpeed: 50,
    ballRadius: 20,
    isServer: true
  });

  engine.setDirection(0, 1);
  engine.setPosition(400, 300);
  engine.ball.vx = 0;
  engine.ball.vy = 0;

  engine.ensureMinimumSpeed();

  assert(Math.abs(engine.ball.vx) < 1e-5, `vx должен остаться 0, получено ${engine.ball.vx}`);
  assert(Math.abs(engine.ball.vy) >= engine.options.minSpeed * 0.9, `vy должен быть ≥ minSpeed`);
});

// Итоги
console.log('\n' + '='.repeat(50));
console.log(`Пройдено: ${passed}/${passed + failed}`);

if (failed === 0) {
  console.log('✅ Все тесты пройдены успешно!');
  process.exit(0);
} else {
  console.log(`❌ Провалено тестов: ${failed}`);
  process.exit(1);
}
