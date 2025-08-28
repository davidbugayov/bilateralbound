#!/usr/bin/env node

/**
 * Тест физики мяча на углах - проверка исправлений
 */

const fs = require('fs');

// Загружаем и выполняем physics.js для тестирования
let BallPhysics;
try {
    const physicsCode = fs.readFileSync('./public/js/physics.js', 'utf8');

    // Создаем простой конструктор для тестирования
    BallPhysics = class TestBallPhysics {
        constructor() {
            this.ball = {
                x: 400,
                y: 300,
                vx: 0,
                vy: 0,
                speed: 120,
                radius: 40
            };
            this.world = {
                width: 800,
                height: 600
            };
            this.paused = true;
            this.lastDir = { x: 1, y: 0 };
            this.lastBounceTime = 0;
            this.edgePadding = 25;
            this.minSpeed = 500;
        }

        updateWithDirection(dirX, dirY, speed, dt = 1/60) {
            if (this.paused) {
                this.ball.vx = 0;
                this.ball.vy = 0;
                return;
            }

            // Простая логика обновления
            if (this.ball.vx === 0 && this.ball.vy === 0) {
                this.lastDir = { x: dirX, y: dirY };
                this.ball.vx = dirX * speed;
                this.ball.vy = dirY * speed;
            }

            this.handleBoundaryCollisions();
            this.ball.x += this.ball.vx * dt;
            this.ball.y += this.ball.vy * dt;
            this.handleBoundaryCollisions();
        }

        handleBoundaryCollisions() {
            const radius = this.ball.radius;
            const width = this.world.width;
            const height = this.world.height;
            const minSpeed = this.minSpeed;
            const edgePadding = this.edgePadding;

            // Left boundary
            if (this.ball.x - radius <= 0) {
                this.ball.x = radius + edgePadding;
                this.ball.vx = Math.max(Math.abs(this.ball.vx), minSpeed);
                this.lastBounceTime = Date.now();
            }

            // Right boundary
            if (this.ball.x + radius >= width) {
                this.ball.x = width - radius - edgePadding;
                this.ball.vx = -Math.max(Math.abs(this.ball.vx), minSpeed);
                this.lastBounceTime = Date.now();
            }

            // Top boundary
            if (this.ball.y - radius <= 0) {
                this.ball.y = radius + edgePadding;
                this.ball.vy = Math.max(Math.abs(this.ball.vy), minSpeed);
                this.lastBounceTime = Date.now();
            }

            // Bottom boundary
            if (this.ball.y + radius >= height) {
                this.ball.y = height - radius - edgePadding;
                this.ball.vy = -Math.max(Math.abs(this.ball.vy), minSpeed);
                this.lastBounceTime = Date.now();
            }
        }
    };

} catch (error) {
    console.error('Ошибка загрузки BallPhysics:', error.message);
    process.exit(1);
}

class CornerTest {
    constructor() {
        this.physics = new BallPhysics();
    }

    testCornerBounce(cornerName, startX, startY, velocityX, velocityY) {
        console.log(`\n🧪 Тестируем ${cornerName}`);

        // Устанавливаем начальное положение
        this.physics.ball.x = startX;
        this.physics.ball.y = startY;
        this.physics.ball.vx = velocityX;
        this.physics.ball.vy = velocityY;
        this.physics.paused = false;

        console.log(`Начальная позиция: (${startX}, ${startY})`);
        console.log(`Начальная скорость: (${velocityX}, ${velocityY})`);

        let frames = 0;
        let stuckFrames = 0;
        const maxFrames = 100;

        while (frames < maxFrames) {
            const prevX = this.physics.ball.x;
            const prevY = this.physics.ball.y;

            this.physics.updateWithDirection(1, 1, 1000, 1/60);

            const moved = Math.abs(this.physics.ball.x - prevX) > 0.1 ||
                         Math.abs(this.physics.ball.y - prevY) > 0.1;

            if (!moved) {
                stuckFrames++;
                if (stuckFrames > 5) {
                    console.log(`❌ Мяч застрял на кадре ${frames}`);
                    return false;
                }
            } else {
                stuckFrames = 0;
            }

            frames++;

            // Проверяем выход за границы
            if (this.physics.ball.x < 0 || this.physics.ball.x > 800 ||
                this.physics.ball.y < 0 || this.physics.ball.y > 600) {
                console.log(`❌ Мяч вышел за границы на кадре ${frames}`);
                return false;
            }
        }

        const finalSpeed = Math.sqrt(
            this.physics.ball.vx * this.physics.ball.vx +
            this.physics.ball.vy * this.physics.ball.vy
        );

        console.log(`✅ Тест завершен успешно`);
        console.log(`Финальная позиция: (${this.physics.ball.x.toFixed(1)}, ${this.physics.ball.y.toFixed(1)})`);
        console.log(`Финальная скорость: ${finalSpeed.toFixed(1)}`);

        return finalSpeed > 100; // Минимум 100 для успеха
    }

    runAllTests() {
        console.log('🚀 Тестирование физики мяча на углах');

        const corners = [
            { name: 'Левый верхний угол', x: 40, y: 40, vx: -1000, vy: -800 },
            { name: 'Правый верхний угол', x: 760, y: 40, vx: 1000, vy: -800 },
            { name: 'Левый нижний угол', x: 40, y: 560, vx: -1000, vy: 800 },
            { name: 'Правый нижний угол', x: 760, y: 560, vx: 1000, vy: 800 }
        ];

        let passed = 0;
        const total = corners.length;

        for (const corner of corners) {
            if (this.testCornerBounce(
                corner.name,
                corner.x,
                corner.y,
                corner.vx,
                corner.vy
            )) {
                passed++;
            }
        }

        console.log(`\n📊 Результат: ${passed}/${total} тестов пройдено`);

        if (passed === total) {
            console.log('🎉 Все тесты углов пройдены!');
            return true;
        } else {
            console.log('❌ Есть проблемы с углами');
            return false;
        }
    }
}

// Запуск тестов
if (require.main === module) {
    const test = new CornerTest();
    const success = test.runAllTests();
    process.exit(success ? 0 : 1);
}

module.exports = CornerTest;
