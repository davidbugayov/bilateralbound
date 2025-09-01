// BallPhysics - класс для управления физикой мяча
class BallPhysics {
    constructor() {
        this.ball = {
            x: 400,
            y: 300,
            vx: 0,
            vy: 0,
            speed: 500,
            radius: 20
        };
        
        this.world = {
            width: 800,
            height: 600
        };
        
        this.colors = {
            ball: '#60a5fa',
            bg: '#0f172a'
        };
        
        this.paused = true;
        this.lastDir = { x: 0, y: 0 };
        
        // Параметры для плавного движения
        this.lerpFactor = 0.1;
        this.targetX = this.ball.x;
        this.targetY = this.ball.y;
        this.targetVx = this.ball.vx;
        this.targetVy = this.ball.vy;
    }
    
    setWorldSize(width, height) {
        this.world.width = width;
        this.world.height = height;
    }
    
    setPosition(x, y) {
        this.ball.x = x;
        this.ball.y = y;
        this.targetX = x;
        this.targetY = y;
    }
    
    setPaused(paused) {
        this.paused = paused;
        if (paused) {
            this.ball.vx = 0;
            this.ball.vy = 0;
            this.targetVx = 0;
            this.targetVy = 0;
        }
    }
    
    updateWithDirection(dirX, dirY, speed, deltaTime) {
        if (this.paused) return;
        
        this.lastDir = { x: dirX, y: dirY };
        
        // Вычисляем целевую скорость
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
        if (magnitude > 0) {
            this.targetVx = (dirX / magnitude) * speed;
            this.targetVy = (dirY / magnitude) * speed;
        } else {
            this.targetVx = 0;
            this.targetVy = 0;
        }
        
        // Плавно интерполируем к целевой скорости
        this.ball.vx += (this.targetVx - this.ball.vx) * this.lerpFactor;
        this.ball.vy += (this.targetVy - this.ball.vy) * this.lerpFactor;
        
        // Обновляем позицию
        this.ball.x += this.ball.vx * deltaTime;
        this.ball.y += this.ball.vy * deltaTime;
        
        // Обрабатываем столкновения с границами
        this.handleBoundaryCollisions();
    }
    
    handleBoundaryCollisions() {
        const edgePadding = this.ball.radius + 2;
        const minSpeed = 50;
        
        // Проверяем столкновения с левой и правой границами
        if (this.ball.x - this.ball.radius <= edgePadding) {
            this.ball.x = edgePadding + this.ball.radius;
            this.ball.vx = Math.abs(this.ball.vx);
            if (Math.abs(this.ball.vx) < minSpeed) {
                this.ball.vx = Math.sign(this.ball.vx) * minSpeed;
            }
        } else if (this.ball.x + this.ball.radius >= this.world.width - edgePadding) {
            this.ball.x = this.world.width - edgePadding - this.ball.radius;
            this.ball.vx = -Math.abs(this.ball.vx);
            if (Math.abs(this.ball.vx) < minSpeed) {
                this.ball.vx = Math.sign(this.ball.vx) * minSpeed;
            }
        }
        
        // Проверяем столкновения с верхней и нижней границами
        if (this.ball.y - this.ball.radius <= edgePadding) {
            this.ball.y = edgePadding + this.ball.radius;
            this.ball.vy = Math.abs(this.ball.vy);
            if (Math.abs(this.ball.vy) < minSpeed) {
                this.ball.vy = Math.sign(this.ball.vy) * minSpeed;
            }
        } else if (this.ball.y + this.ball.radius >= this.world.height - edgePadding) {
            this.ball.y = this.world.height - edgePadding - this.ball.radius;
            this.ball.vy = -Math.abs(this.ball.vy);
            if (Math.abs(this.ball.vy) < minSpeed) {
                this.ball.vy = Math.sign(this.ball.vy) * minSpeed;
            }
        }
    }
    
    // Метод для плавного обновления позиции от сервера
    updateFromServer(serverX, serverY, serverVx, serverVy) {
        this.targetX = serverX;
        this.targetY = serverY;
        this.targetVx = serverVx;
        this.targetVy = serverVy;
        
        // Плавно интерполируем к целевым значениям
        this.ball.x += (this.targetX - this.ball.x) * this.lerpFactor;
        this.ball.y += (this.targetY - this.ball.y) * this.lerpFactor;
        this.ball.vx += (this.targetVx - this.ball.vx) * this.lerpFactor;
        this.ball.vy += (this.targetVy - this.ball.vy) * this.lerpFactor;
    }
    
    // Получить текущую скорость
    getCurrentSpeed() {
        return Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
    }
    
    // Сбросить мяч в центр
    reset() {
        this.ball.x = this.world.width / 2;
        this.ball.y = this.world.height / 2;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.targetX = this.ball.x;
        this.targetY = this.ball.y;
        this.targetVx = 0;
        this.targetVy = 0;
        this.paused = true;
    }
}
