const assert = require('assert');
const PhysicsEngine = require('../public/js/physics-engine.js');

async function runPhysicsTests() {
    console.log('============================================================');
    console.log('🧪 Запуск тестов физического движка...');
    console.log('============================================================');
    
    let passed = 0;
    const total = 4;

    // Test 1: Horizontal bounce (right wall)
    try {
        const engine = new PhysicsEngine({ worldWidth: 800, worldHeight: 600, ballRadius: 20 });
        engine.setPosition(775, 300); // Start near the right wall
        engine.startMovement(1, 0, 100); // Move right at full speed

        let initialVx = 0;
        let bounced = false;

        // Simulate movement
        for (let i = 0; i < 60; i++) {
            if (i === 1) initialVx = engine.ball.vx;
            engine.updateLocalPhysics(16 / 1000); // Simulate 16ms delta
            if (initialVx > 0 && engine.ball.vx <= 0) {
                bounced = true;
                break;
            }
        }
        
        assert.strictEqual(bounced, true, 'Мяч не изменил горизонтальную скорость после удара о правую стену');
        assert.ok(engine.ball.x < 780, 'Мяч застрял в правой стене или не отлетел от нее');
        console.log('✅ ПРОЙДЕН - Отскок от правой стены');
        passed++;
    } catch (error) {
        console.error('❌ ПРОВАЛЕН - Отскок от правой стены:', error.message);
    }

    // Test 2: Horizontal bounce (left wall)
    try {
        const engine = new PhysicsEngine({ worldWidth: 800, worldHeight: 600, ballRadius: 20 });
        engine.setPosition(25, 300); // Start near the left wall
        engine.startMovement(-1, 0, 100); // Move left at full speed

        let initialVx = 0;
        let bounced = false;
        
        for (let i = 0; i < 60; i++) {
            if (i === 1) initialVx = engine.ball.vx;
            engine.updateLocalPhysics(16 / 1000);
            if (initialVx < 0 && engine.ball.vx >= 0) {
                bounced = true;
                break;
            }
        }
        
        assert.strictEqual(bounced, true, 'Мяч не изменил горизонтальную скорость после удара о левую стену');
        assert.ok(engine.ball.x > 20, 'Мяч застрял в левой стене или не отлетел от нее');
        console.log('✅ ПРОЙДЕН - Отскок от левой стены');
        passed++;
    } catch (error) {
        console.error('❌ ПРОВАЛЕН - Отскок от левой стены:', error.message);
    }

    // Test 3: Vertical bounce (bottom wall)
    try {
        const engine = new PhysicsEngine({ worldWidth: 800, worldHeight: 600, ballRadius: 20 });
        engine.setPosition(400, 575); // Start near the bottom wall
        engine.startMovement(0, 1, 100); // Move down at full speed

        let initialVy = 0;
        let bounced = false;

        for (let i = 0; i < 60; i++) {
            if (i === 1) initialVy = engine.ball.vy;
            engine.updateLocalPhysics(16 / 1000);
            if (initialVy > 0 && engine.ball.vy <= 0) {
                bounced = true;
                break;
            }
        }
        
        assert.strictEqual(bounced, true, 'Мяч не изменил вертикальную скорость после удара о нижнюю стену');
        assert.ok(engine.ball.y < 580, 'Мяч застрял в нижней стене или не отлетел от нее');
        console.log('✅ ПРОЙДЕН - Отскок от нижней стены');
        passed++;
    } catch (error) {
        console.error('❌ ПРОВАЛЕН - Отскок от нижней стены:', error.message);
    }

    // Test 4: Vertical bounce (top wall)
    try {
        const engine = new PhysicsEngine({ worldWidth: 800, worldHeight: 600, ballRadius: 20 });
        engine.setPosition(400, 25); // Start near the top wall
        engine.startMovement(0, -1, 100); // Move up at full speed

        let initialVy = 0;
        let bounced = false;

        for (let i = 0; i < 60; i++) {
            if (i === 1) initialVy = engine.ball.vy;
            engine.updateLocalPhysics(16 / 1000);
            if (initialVy < 0 && engine.ball.vy >= 0) {
                bounced = true;
                break;
            }
        }
        
        assert.strictEqual(bounced, true, 'Мяч не изменил вертикальную скорость после удара о верхнюю стену');
        assert.ok(engine.ball.y > 20, 'Мяч застрял в верхней стене или не отлетел от нее');
        console.log('✅ ПРОЙДЕН - Отскок от верхней стены');
        passed++;
    } catch (error) {
        console.error('❌ ПРОВАЛЕН - Отскок от верхней стены:', error.message);
    }
    
    console.log('============================================================');
    console.log(`📈 ИТОГО ТЕСТОВ ФИЗИКИ: ${passed}/${total} пройдено`);
    console.log('============================================================');

    if (passed !== total) {
        throw new Error('Один или несколько тестов физики провалились.');
    }
}

// Allow running this file directly
if (require.main === module) {
    runPhysicsTests().catch(err => {
        process.exit(1);
    });
}

module.exports = runPhysicsTests;
