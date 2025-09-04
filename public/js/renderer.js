/**
 * BallRenderer - оптимизированный модуль рендеринга для BilateralBound
 * Отвечает за отрисовку шарика и фона
 * Оптимизирован для производительности и переиспользуемости
 */

class BallRenderer {
    constructor(canvas, physicsEngine) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.physics = physicsEngine;

        this.animationFrameId = null;
        this.lastTime = 0;
        this.targetFrameTime = 1000 / 60; // 60 FPS

        this.onFrameCallback = null;
        
        // Кэшируем часто используемые значения
        this.pi2 = Math.PI * 2;
        this.fillRect = this.ctx.fillRect.bind(this.ctx);
        this.beginPath = this.ctx.beginPath.bind(this.ctx);
        this.arc = this.ctx.arc.bind(this.ctx);
        this.fill = this.ctx.fill.bind(this.ctx);
        
        // Предварительно создаем объекты для переиспользования
        this.ball = this.physics.ball;
        this.colors = this.physics.colors;
    }

    /**
     * Запускает рендеринг
     */
    start() {
        if (this.animationFrameId) {
            this.stop();
        }
        this.lastTime = 0;
        this.renderLoop();
    }

    /**
     * Останавливает рендеринг
     */
    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Устанавливает callback для каждого кадра
     */
    setFrameCallback(callback) {
        this.onFrameCallback = callback;
    }

    /**
     * Основной цикл рендеринга (оптимизированный)
     */
    renderLoop = (currentTime) => {
        if (!this.canvas || !this.ctx || !this.physics) {
            return;
        }

        const deltaTime = currentTime - this.lastTime;

        // Обновляем физику только при достаточном deltaTime
        if (deltaTime >= this.targetFrameTime) {
            // Вызываем callback перед обновлением физики
            if (this.onFrameCallback) {
                this.onFrameCallback(deltaTime);
            }

            // Обновляем физику
            this.physics.update(deltaTime / 1000);

            // Рендерим сцену
            this.render();

            this.lastTime = currentTime;
        }

        this.animationFrameId = requestAnimationFrame(this.renderLoop);
    };

    /**
     * Рендерит сцену (оптимизированная версия)
     */
    render() {
        // Очищаем canvas
        this.ctx.fillStyle = this.colors.bg;
        this.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Рисуем шарик
        this.renderBall();
    }

    /**
     * Рисует шарик (оптимизированная версия)
     */
    renderBall() {
        const ball = this.ball;

        this.beginPath();
        this.arc(ball.x, ball.y, ball.radius, 0, this.pi2);
        this.ctx.fillStyle = this.colors.ball;
        this.fill();
    }

    /**
     * Изменяет размеры canvas
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;

        // Обновляем размеры мира физики
        if (this.physics) {
            this.physics.setWorldSize(width, height);
        }
    }

    // === ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ДЛЯ ПЕРЕИСПОЛЬЗОВАНИЯ ===

    /**
     * Клонирует рендерер для нового canvas
     */
    clone(newCanvas) {
        return new BallRenderer(newCanvas, this.physics);
    }

    /**
     * Устанавливает новый движок физики
     */
    setPhysicsEngine(physicsEngine) {
        this.physics = physicsEngine;
        this.ball = this.physics.ball;
        this.colors = this.physics.colors;
    }

    /**
     * Рендерит сцену без обновления физики (для статичного рендеринга)
     */
    renderStatic() {
        this.render();
    }

    /**
     * Устанавливает FPS для рендеринга
     */
    setFPS(fps) {
        this.targetFrameTime = 1000 / fps;
    }

    /**
     * Получает текущий FPS
     */
    getFPS() {
        return 1000 / this.targetFrameTime;
    }

    /**
     * Рендерит с дополнительными эффектами
     */
    renderWithEffects(effects = {}) {
        // Основной рендеринг
        this.render();

        // Применяем дополнительные эффекты
        if (effects.shadow) {
            this.renderShadow();
        }
        if (effects.glow) {
            this.renderGlow();
        }
        if (effects.trail) {
            this.renderTrail();
        }
    }

    /**
     * Рендерит тень шарика
     */
    renderShadow() {
        const ball = this.ball;
        
        this.ctx.save();
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#000000';
        this.beginPath();
        this.arc(ball.x + 2, ball.y + 2, ball.radius, 0, this.pi2);
        this.fill();
        this.ctx.restore();
    }

    /**
     * Рендерит свечение шарика
     */
    renderGlow() {
        const ball = this.ball;
        
        this.ctx.save();
        this.ctx.shadowColor = this.colors.ball;
        this.ctx.shadowBlur = 20;
        this.ctx.fillStyle = this.colors.ball;
        this.beginPath();
        this.arc(ball.x, ball.y, ball.radius, 0, this.pi2);
        this.fill();
        this.ctx.restore();
    }

    /**
     * Рендерит след шарика
     */
    renderTrail() {
        // Простая реализация следа
        this.ctx.save();
        this.ctx.globalAlpha = 0.1;
        this.ctx.fillStyle = this.colors.ball;
        this.beginPath();
        this.arc(this.ball.x, this.ball.y, this.ball.radius * 1.5, 0, this.pi2);
        this.fill();
        this.ctx.restore();
    }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
    window.BallRenderer = BallRenderer;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BallRenderer;
}
