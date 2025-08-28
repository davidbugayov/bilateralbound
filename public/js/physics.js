// Shared physics engine for ball movement and bouncing
// Used by both server and client for consistent behavior

class BallPhysics {
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
    this.lastBounceTime = 0; // Для защиты от множественных отскоков
    this.colors = {
      ball: '#60a5fa',
      bg: '#020617'
    };

    // Ссылка на общий обработчик ошибок для использования в синхронизации
    this.errorHandler = window.ERROR_CONFIG ? {
      shouldSyncPosition: () => Math.random() < window.ERROR_CONFIG.POSITION_SYNC_CHANCE
    } : {
      shouldSyncPosition: () => Math.random() < 0.03
    };
  }

  // Update ball physics with direction and speed
  updateWithDirection(dirX, dirY, speed, dt = 1/60) {
    if (this.paused) {
      this.ball.vx = 0;
      this.ball.vy = 0;
      return;
    }

    // Скорость уже рассчитана в пикселях в секунду на сервере
    // Применяем направление и скорость так, чтобы отскоки меняли знак и сохранялись
    if (this.ball.vx === 0 && this.ball.vy === 0) {
      // Стартовое задание скорости по направлению
      this.lastDir = { x: dirX, y: dirY };
      this.ball.vx = dirX * speed;
      this.ball.vy = dirY * speed;
    } else {
      // Если скорость уже установлена (синхронизирована с сервера), используем её
      // Иначе применяем новое направление
      if (Math.abs(this.ball.vx) < 0.1 && Math.abs(this.ball.vy) < 0.1) {
        // Скорость не установлена, применяем направление
        if (dirX === 0) {
          this.ball.vx = 0;
        } else {
          this.ball.vx = dirX * speed;
        }

        if (dirY === 0) {
          this.ball.vy = 0;
        } else {
          this.ball.vy = dirY * speed;
        }
      }
      // Если скорость уже установлена, оставляем её как есть

      this.lastDir = { x: dirX, y: dirY };
    }

    // Handle boundary collisions BEFORE updating position to prevent sticking
    this.handleBoundaryCollisions();

    // Update position after collision handling
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    // Handle boundary collisions AFTER position update as a safety net
    this.handleBoundaryCollisions();
  }

  // Handle ball bouncing off boundaries - full screen travel from edge to edge
  handleBoundaryCollisions() {
    const radius = this.ball.radius;
    const width = this.world.width;
    const height = this.world.height;
    const minSpeed = 500; // Увеличена минимальная скорость отскока для надежности
    const edgePadding = 25; // Значительно увеличен отступ от края для предотвращения застревания
    let bounced = false;

    // Защита от множественных отскоков в одном кадре - уменьшена для более частых отскоков
    if (this.lastBounceTime && Date.now() - this.lastBounceTime < 16) { // Не чаще 60 FPS для отскоков
      return false;
    }

    // Сохраняем состояние до отскока для определения изменений
    const beforeVx = this.ball.vx;
    const beforeVy = this.ball.vy;

    // Left boundary - check if ball has gone beyond the left edge
    if (this.ball.x - radius <= 0) {
      // Мяч вышел за левый край - отскок вправо
      this.ball.x = radius + edgePadding; // Гарантированный отступ от края
      // Гарантируем положительную скорость и минимальную величину
      this.ball.vx = Math.max(Math.abs(this.ball.vx), minSpeed); // Сохраняем направление или устанавливаем минимальную
      this.lastBounceTime = Date.now();
      bounced = true;

    }

    // Right boundary - check if ball has gone beyond the right edge
    if (this.ball.x + radius >= width) {
      // Мяч вышел за правый край - отскок влево
      this.ball.x = width - radius - edgePadding; // Гарантированный отступ от края
      // Гарантируем отрицательную скорость и минимальную величину
      this.ball.vx = -Math.max(Math.abs(this.ball.vx), minSpeed); // Сохраняем направление или устанавливаем минимальную
      this.lastBounceTime = Date.now();
      bounced = true;

    }

    // Top boundary - check if ball has gone beyond the top edge
    if (this.ball.y - radius <= 0) {
      // Мяч вышел за верхний край - отскок вниз
      this.ball.y = radius + edgePadding; // Гарантированный отступ от края
      // Гарантируем положительную скорость и минимальную величину
      this.ball.vy = Math.max(Math.abs(this.ball.vy), minSpeed); // Сохраняем направление или устанавливаем минимальную
      this.lastBounceTime = Date.now();
      bounced = true;

    }

    // Bottom boundary - check if ball has gone beyond the bottom edge
    if (this.ball.y + radius >= height) {
      // Мяч вышел за нижний край - отскок вверх
      this.ball.y = height - radius - edgePadding; // Гарантированный отступ от края
      // Гарантируем отрицательную скорость и минимальную величину
      this.ball.vy = -Math.max(Math.abs(this.ball.vy), minSpeed); // Сохраняем направление или устанавливаем минимальную
      this.lastBounceTime = Date.now();
      bounced = true;

    }

    // Защита от нулевой скорости - всегда гарантируем минимальную скорость движения
    const currentSpeed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
    if (currentSpeed < minSpeed * 0.9 && !this.paused && (Math.abs(this.ball.vx) > 0.1 || Math.abs(this.ball.vy) > 0.1)) {
      // Если скорость меньше 90% от минимальной и мяч не на паузе, восстанавливаем скорость
      const scale = minSpeed / currentSpeed;
      this.ball.vx *= scale;
      this.ball.vy *= scale;

    }

    // Специальная обработка для углов - предотвращаем застревание
    if (bounced) {
      // Проверяем, попал ли мяч в угол (два отскока одновременно)
      const cornerBounce = ((this.ball.x - radius <= edgePadding && this.ball.y - radius <= edgePadding) || // Левый верхний
                           (this.ball.x + radius >= width - edgePadding && this.ball.y - radius <= edgePadding) || // Правый верхний
                           (this.ball.x - radius <= edgePadding && this.ball.y + radius >= height - edgePadding) || // Левый нижний
                           (this.ball.x + radius >= width - edgePadding && this.ball.y + radius >= height - edgePadding)); // Правый нижний

      if (cornerBounce) {
        // В углу гарантируем минимальную скорость по обеим осям
        const currentSpeed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
        if (currentSpeed < minSpeed * 1.5) { // Увеличиваем порог для углов
          const scale = (minSpeed * 1.5) / currentSpeed;
          this.ball.vx *= scale;
          this.ball.vy *= scale;
          console.log(`Corner bounce: increased speed to ${Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy).toFixed(1)}`);
        }
      }

      // Отправляем обновленное состояние на сервер
      this.syncBounceToServer();
    }

    return bounced; // Возвращаем флаг отскока для возможного использования
  }

  // Set ball position (for reset/initial sync)
  setPosition(x, y) {
    this.ball.x = x;
    this.ball.y = y;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  // Set ball properties
  setProperties(props) {
    if (props.speed !== undefined) this.ball.speed = props.speed;
    if (props.radius !== undefined) this.ball.radius = props.radius;
    if (props.x !== undefined) this.ball.x = props.x;
    if (props.y !== undefined) this.ball.y = props.y;
    if (props.colorBall !== undefined) this.colors.ball = props.colorBall;
    if (props.colorBg !== undefined) this.colors.bg = props.colorBg;
  }

  // Set world dimensions
  setWorldSize(width, height) {
    this.world.width = width;
    this.world.height = height;
  }

  // Set paused state
  setPaused(paused) {
    this.paused = paused;
    if (paused) {
      this.ball.vx = 0;
      this.ball.vy = 0;
    }
  }

  // Get current ball state
  getState() {
    return {
      ...this.ball,
      paused: this.paused,
      lastDir: { ...this.lastDir },
      colorBall: this.colors.ball,
      colorBg: this.colors.bg,
      width: this.world.width,
      height: this.world.height
    };
  }

  // Update from external state (for sync)
  updateFromState(state) {
    if (state.x !== undefined) this.ball.x = state.x;
    if (state.y !== undefined) this.ball.y = state.y;
    if (state.vx !== undefined) this.ball.vx = state.vx;
    if (state.vy !== undefined) this.ball.vy = state.vy;
    if (state.speed !== undefined) this.ball.speed = state.speed;
    if (state.radius !== undefined) this.ball.radius = state.radius;
    if (state.paused !== undefined) this.paused = state.paused;
    if (state.lastDir) this.lastDir = { ...state.lastDir };
    if (state.colorBall) this.colors.ball = state.colorBall;
    if (state.colorBg) this.colors.bg = state.colorBg;
    if (state.width) this.world.width = state.width;
    if (state.height) this.world.height = state.height;
  }

  // Sync bounce to server
  syncBounceToServer() {
    // Получаем sessionId из глобальной переменной (устанавливается в viewer.html)
    const sessionId = window.__current?.sessionId;
    if (!sessionId) {
      console.warn('Невозможно синхронизировать отскок: sessionId не найден');
      return;
    }

    const bounceData = {
      x: this.ball.x,
      y: this.ball.y,
      vx: this.ball.vx,
      vy: this.ball.vy,
      bounced: true,
      timestamp: Date.now()
    };



    // Отправляем состояние после отскока на сервер
    fetch(`/api/session/${sessionId}/bounce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bounceData)
    }).then(response => {
      if (response.ok) {

      } else {
        console.warn('Ошибка синхронизации отскока:', response.status);
      }
    }).catch(error => {
      console.error('Ошибка отправки отскока:', error);
    });
  }

  // Check if ball is moving
  isMoving() {
    return Math.abs(this.ball.vx) > 0.1 || Math.abs(this.ball.vy) > 0.1;
  }
}

// Export for Node.js (server) and browser (client)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BallPhysics;
} else if (typeof window !== 'undefined') {
  window.BallPhysics = BallPhysics;
}
