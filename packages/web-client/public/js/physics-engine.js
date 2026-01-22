/* jshint boss: true, laxbreak: true, laxcomma: true, asi: true, esversion: 11, es3: false, es5: false, eqeqeq: false, immed: false, nonbsp: true, strict: false, curly: false, forin: false, -W140: true */
/* global globalThis, console, module, Map, Set */
/* eslint-disable no-undefined, prefer-const */

'use strict';
/**
 * PhysicsEngine - оптимизированный движок физики для BilateralBound
 * Управляет движением, отскоками и масштабированием шарика
 * Оптимизирован для производительности и переиспользуемости
 */
if (typeof PhysicsEngine === 'undefined') {
  class PhysicsEngine {
    constructor(options = {}) {
      // Кэшируем часто используемые значения
      this.options = {
        worldWidth: 800,
        worldHeight: 600,
        ballRadius: 20,
        minSpeed: 50,
        maxSpeed: 5000,
        smoothing: {
          // Оптимизированные параметры для синхронизации с сервером
          stiffness: 30, // k - Увеличено для быстрого следования за серверным состоянием
          damping: 20, // c - Увеличено для устранения колебаний при получении обновлений
          maxPredictSec: 0.02, // Уменьшено для более точной синхронизации (меньше предсказания)
          snapDistance: 0.3, // авто-снап к цели в пикселях для устранения микроколебаний
        },
        bounceCallback: null,
        ...options,
      };
      // Применяем глобальную конфигурацию при наличии
      if (typeof globalThis !== 'undefined' && globalThis.BBConfig?.smoothing) {
        this.options.smoothing = {
          ...this.options.smoothing,
          ...globalThis.BBConfig.smoothing,
        };
      }
      // Флаг для определения режима вьювера
      this.isViewer = Boolean(options.isViewer ?? false);
      this._worldSizeSet = false; // Флаг, что размеры мира установлены
      // Предварительно вычисляем центр мира
      this.centerX = this.options.worldWidth / 2;
      this.centerY = this.options.worldHeight / 2;
      this.ball = {
        x: this.centerX,
        y: this.centerY,
        vx: 0,
        vy: 0,
        speed: 30,
        radius: this.options.ballRadius,
      };
      // Буферы для интерполяции рендера (предыдущая и текущая позиции)
      this._prevPos = { x: this.ball.x, y: this.ball.y };

      this._currPos = { x: this.ball.x, y: this.ball.y };
      // Кэшируемый объект для выдачи интерполированного состояния без аллокаций
      this._interpBall = {
        x: this.ball.x,
        y: this.ball.y,
        radius: this.ball.radius,
        colorBall: null,
      };

      this.colors = {
        ball: '#60a5fa',
        bg: '#020617',
      };

      this.state = {
        paused: true, // Игра начинается на паузе
        lastDirection: { x: 0, y: 0 },
        targetVx: 0,
        targetVy: 0,
        targetX: this.centerX, // Устанавливаем начальную позицию в центре
        targetY: this.centerY,
        // Сглаживание (пружина) в viewer-режиме
        smoothVx: 0,
        smoothVy: 0,
        // Разрешить интерполяцию даже на паузе (для плавного возвращения в центр)
        allowInterpWhenPaused: false,
      };

      this.bounceCallback = this.options.bounceCallback;
      // Кэшируем Math функции для производительности
      this.sqrt = Math.sqrt;
      this.min = Math.min;
      this.max = Math.max;
      // Применяем пресет для плавности движения
      this.applySmoothnessPreset(options.preset || 'default');
    }

    /**
     * Устанавливает опции сглаживания для движка.
     * @param {object} [opts={}] - Объект с опциями сглаживания.
     */
    setSmoothingOptions(opts = {}) {
      if (opts && typeof opts === 'object') {
        this.options.smoothing = { ...this.options.smoothing, ...opts };
      }
    }
    /**
     * Применяет пресет для плавности движения
     */
    applySmoothnessPreset(presetName) {
      const presets = {
        therapy: {
          // Для терапевтических сессий - плавность с хорошей синхронизацией
          smoothing: {
            stiffness: 20,
            damping: 12,
            maxPredictSec: 0.08,
            snapDistance: 0.8,
          },
        },
        gaming: {
          // Для динамичных сессий - максимальная отзывчивость
          smoothing: {
            stiffness: 30,
            damping: 18,
            maxPredictSec: 0.03,
            snapDistance: 1.5,
          },
        },
        default: {
          // Баланс между плавностью и точной синхронизацией
          smoothing: {
            stiffness: 25,
            damping: 15,
            maxPredictSec: 0.05,
            snapDistance: 1,
          },
        },
      };

      const preset = presets[presetName] || presets.default;
      // Применяем настройки сглаживания
      if (preset.smoothing) {
        this.options.smoothing = {
          ...this.options.smoothing,
          ...preset.smoothing,
        };
      }
    }
    // === ОСНОВНЫЕ МЕТОДЫ ===
    /**
     * Устанавливает размеры мира с пересчетом центра
     */
    setWorldSize(width, height) {
      this.options.worldWidth = width;
      this.options.worldHeight = height;
      this.centerX = width / 2;
      this.centerY = height / 2;
      this._worldSizeSet = true; // Устанавливаем флаг
      // После изменения размеров мира гарантируем, что мяч и цель в пределах экрана
      this.clampBallWithinBounds();
    }
    /**
     * Устанавливает позицию шарика
     */
    setPosition(x, y) {
      this.ball.x = x;
      this.ball.y = y;
      // Гарантируем, что позиция не выходит за границы экрана
      this.clampBallWithinBounds();
      // Для режима "зрителя" (вьювер/превью) также обновляем цель интерполяции
      // и используем уже откорректированные координаты, чтобы избежать рывков
      if (this.isViewer) {
        this.state.targetX = this.ball.x;
        this.state.targetY = this.ball.y;
      }
    }
    /**
     * Устанавливает скорость шарика (в процентах)
     */
    setSpeed(percent) {
      this.ball.speed = this.max(0, this.min(100, percent));
    }
    /**
     * Устанавливает направление движения
     */
    setDirection(dirX, dirY) {
      this.state.lastDirection.x = dirX;
      this.state.lastDirection.y = dirY;
    }
    /**
     * Устанавливает скорость движения (vx, vy)
     */
    setVelocity(vx, vy) {
      this.ball.vx = vx;
      this.ball.vy = vy;
      this.state.targetVx = vx;
      this.state.targetVy = vy;
      // Обновляем направление на основе скорости
      const speed = this.sqrt(vx * vx + vy * vy);
      if (speed > 0) {
        this.state.lastDirection.x = vx / speed;
        this.state.lastDirection.y = vy / speed;
      }
    }
    /**
     * Устанавливает состояние паузы
     */
    setPaused(paused) {
      this.state.paused = Boolean(paused);
      if (this.state.paused) {
        // Плавное возвращение в центр при паузе
        if (this.isViewer) {
          // В клиентском режиме не телепортируем мяч, а плавно тянем к центру
          // Цель — центр, текущую позицию оставляем как есть
          this.state.targetX = this.centerX;
          this.state.targetY = this.centerY;
          // Разрешаем интерполяцию даже на паузе
          this.state.allowInterpWhenPaused = true;
          // Сбрасываем предсказание и сглаживание, чтобы старт анимации был мягким
          this.state.lastVx = 0;
          this.state.lastVy = 0;
          this.state.smoothVx = 0;
          this.state.smoothVy = 0;
          // Убедимся что мяч в допустимых границах
          this.clampBallWithinBounds();
        } else {
          // На сервере мгновенно ставим в центр (авторитетное состояние)
          this._resetBallToCenter();
        }
      } else {
        // При снятии с паузы возвращаем обычное поведение
        this.state.allowInterpWhenPaused = false;
      }
    }
    /**
     * Сбрасывает мяч в центр с нулевой скоростью
     * @private
     */
    _resetBallToCenter() {
      this.ball.x = this.centerX;
      this.ball.y = this.centerY;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.state.targetX = this.centerX;
      this.state.targetY = this.centerY;
      this.clampBallWithinBounds();
    }
    /**
     * Устанавливает цвет шарика
     */
    setBallColor(color) {
      if (typeof color === 'string' && color.length > 0) {
        this.colors.ball = color;
      }
    }
    /**
     * Устанавливает цвет фона
     */
    setBgColor(color) {
      if (typeof color === 'string' && color.length > 0) {
        this.colors.bg = color;
      }
    }

    setBallSize(radius) {
      if (typeof radius === 'number' && radius > 0 && radius <= 500) {
        this.ball.radius = radius;
        // При изменении размера мяча гарантируем, что он остаётся в пределах экрана
        this.clampBallWithinBounds();
      }
    }
    /**
     * ПРОДВИНУТАЯ интерполяция v4 с буферизацией состояний и экспоненциальным сглаживанием
     */
    updateViewerInterpolation(deltaTime) {
      if (!this._canInterpolate()) return;

      const currentTime = performance.now();

      // Обновляем буфер состояний
      this._updateStateBuffer(currentTime);
      this._applyExponentialSmoothing();

      // Вычисляем целевые позиции с учетом предсказания
      const { clampedTargetX, clampedTargetY } =
        this._calculateAdaptiveClamping();

      // Применяем физику пружины
      this._applySpringPhysics(clampedTargetX, clampedTargetY, deltaTime);
      const { stepX, stepY } = this._limitStepSize(
        clampedTargetX,
        clampedTargetY,
        deltaTime,
      );

      // Обновляем позицию мяча
      this._interpolatePositionWithSteps(stepX, stepY);

      // Применяем финальное позиционирование
      this._autoSnapIfNeeded(clampedTargetX, clampedTargetY);
    }

    _interpolatePositionWithSteps(stepX, stepY) {
      this._applyInterpolationSmoothing(stepX, stepY);
    }

    _applyInterpolationSmoothing(stepX, stepY) {
      const smoothingFactor = this.options?.smoothing?.smoothingFactor ?? 0.25;
      const radius = this.ball.radius;
      const w = this.options.worldWidth;
      const h = this.options.worldHeight;

      this._prevPos.x = this.ball.x;
      this._prevPos.y = this.ball.y;

      const newX = this.ball.x + stepX;
      const newY = this.ball.y + stepY;

      this.ball.x =
        this.ball.x * (1 - smoothingFactor) + newX * smoothingFactor;
      this.ball.y =
        this.ball.y * (1 - smoothingFactor) + newY * smoothingFactor;

      this.ball.x = this.min(w - radius, this.max(radius, this.ball.x));
      this.ball.y = this.min(h - radius, this.max(radius, this.ball.y));

      this._currPos.x = this.ball.x;
      this._currPos.y = this.ball.y;
    }

    _canInterpolate() {
      const isActiveMovement =
        this.state.allowInterpWhenPaused || this.state.paused === false;
      return isActiveMovement && Boolean(this.state?.targetX);
    }

    _updateStateBuffer(currentTime) {
      if (!this._stateBuffer) {
        this._stateBuffer = [];
        this._bufferSize = this.options.smoothing?.bufferSize || 15;
      }

      this._stateBuffer.push({
        x: this.ball.x,
        y: this.ball.y,
        vx: this.state.lastVx || 0,
        vy: this.state.lastVy || 0,
        timestamp: currentTime,
      });

      if (this._stateBuffer.length > this._bufferSize) {
        this._stateBuffer.shift();
      }
    }

    _applyExponentialSmoothing() {
      const alpha = this.options.smoothing?.velocitySmoothingAlpha || 0.08;
      const vx = this.state.lastVx || 0;
      const vy = this.state.lastVy || 0;

      if (this._smoothedVelocity) {
        this._smoothedVelocity.x =
          this._smoothedVelocity.x * (1 - alpha) + vx * alpha;
        this._smoothedVelocity.y =
          this._smoothedVelocity.y * (1 - alpha) + vy * alpha;
      } else {
        this._smoothedVelocity = { x: vx, y: vy };
      }
    }

    _calculateAdaptiveClamping() {
      const radius = this.ball.radius;
      const w = this.options.worldWidth;
      const h = this.options.worldHeight;

      // Упрощенная логика: просто клампим целевую позицию без предсказания отскока
      // Это предотвратит залипание на углах
      const clampedTargetX = Math.min(
        w - radius,
        Math.max(radius, this.state.targetX),
      );
      const clampedTargetY = Math.min(
        h - radius,
        Math.max(radius, this.state.targetY),
      );

      return { clampedTargetX, clampedTargetY };
    }

    _applySpringPhysics(clampedTargetX, clampedTargetY, deltaTime) {
      const dx = clampedTargetX - this.ball.x;
      const dy = clampedTargetY - this.ball.y;
      const distance = Math.hypot(dx, dy);

      const baseStiffness = this.options?.smoothing?.stiffness ?? 25;
      const speed = Math.hypot(
        this._smoothedVelocity.x,
        this._smoothedVelocity.y,
      );

      const adaptiveStiffness =
        baseStiffness * (1 + Math.min(distance / 150, 3));
      const baseDamping = this.options?.smoothing?.damping ?? 15;
      const adaptiveDamping = baseDamping * (1 + Math.min(speed / 800, 2));

      const ax = adaptiveStiffness * dx - adaptiveDamping * this.state.smoothVx;
      const ay = adaptiveStiffness * dy - adaptiveDamping * this.state.smoothVy;

      const maxAcceleration = 8000;
      const clampedAx = Math.max(
        -maxAcceleration,
        Math.min(maxAcceleration, ax),
      );
      const clampedAy = Math.max(
        -maxAcceleration,
        Math.min(maxAcceleration, ay),
      );

      this.state.smoothVx += clampedAx * deltaTime;
      this.state.smoothVy += clampedAy * deltaTime;
    }

    _limitStepSize(clampedTargetX, clampedTargetY, deltaTime) {
      const dx = clampedTargetX - this.ball.x;
      const dy = clampedTargetY - this.ball.y;
      const distance = Math.hypot(dx, dy);

      let stepX = this.state.smoothVx * deltaTime;
      let stepY = this.state.smoothVy * deltaTime;
      const stepMagnitude = Math.hypot(stepX, stepY);

      const adaptiveMaxStep = Math.min(
        distance * 2.5,
        Math.abs(this._smoothedVelocity.x) * deltaTime * 4,
        Math.abs(this._smoothedVelocity.y) * deltaTime * 4,
        150,
      );

      if (stepMagnitude > adaptiveMaxStep && adaptiveMaxStep > 0) {
        const scale = adaptiveMaxStep / stepMagnitude;
        stepX *= scale;
        stepY *= scale;
        this.state.smoothVx *= scale;
        this.state.smoothVy *= scale;
      }

      return { stepX, stepY };
    }

    _autoSnapIfNeeded(clampedTargetX, clampedTargetY) {
      const dx = clampedTargetX - this.ball.x;
      const dy = clampedTargetY - this.ball.y;
      const distance = Math.hypot(dx, dy);

      const snapDistance = this.options.smoothing.snapDistance || 0.2;
      const lowSpeedThreshold = 3;

      if (
        distance < snapDistance &&
        Math.abs(this.state.smoothVx) < lowSpeedThreshold &&
        Math.abs(this.state.smoothVy) < lowSpeedThreshold
      ) {
        this.ball.x = clampedTargetX;
        this.ball.y = clampedTargetY;
        this._currPos.x = this.ball.x;
        this._currPos.y = this.ball.y;
        this.state.smoothVx = 0;
        this.state.smoothVy = 0;
        if (this.state.paused) {
          this.state.allowInterpWhenPaused = false;
        }
      }
    }
    /**
     * Обновляет физику за указанное время
     */
    update(deltaTime) {
      if (this.isViewer) {
        this._updateViewerPhysics(deltaTime);
      } else {
        this._updateServerPhysics(deltaTime);
      }
      // Отмечаем момент последнего обновления физики
      this.__lastPhysicsUpdateTs = performance?.now?.() ?? Date.now();
    }

    /**
     * Обновляет физику в режиме вьювера, управляя интерполяцией и симуляцией.
     * @param {number} deltaTime - Время, прошедшее с последнего кадра.
     * @private
     */
    _updateViewerPhysics(deltaTime) {
      const canUpdate = !this.state.paused || this.state.allowInterpWhenPaused;
      if (canUpdate) {
        if (this.state.paused) {
          this.updateViewerInterpolation(deltaTime);
        } else {
          this.updateClientPhysics(deltaTime);
        }
      }
    }

    /**
     * Обновляет серверную физику
     * @private
     */
    _updateServerPhysics(deltaTime) {
      // Для сервера используем полную физику с отскоками
      // Вызываем оригинальный метод обновления серверной физики
      // (не рекурсивно, так как это private метод)
      const originalUpdateServerPhysics = (deltaTime) => {
        if (this.state.paused) {
          return;
        }
        // ================== НАДЁЖНАЯ ПРОВЕРКА V2 ==================
        // Обновляем физику, только если размеры мира были установлены
        if (this._worldSizeSet) {
          // Пересчитываем скорость напрямую из направления и процента скорости
          const speedPercent = this.ball.speed / 100;
          const pixelsPerSecond = speedPercent * this.options.maxSpeed;
          this.ball.vx = this.state.lastDirection.x * pixelsPerSecond;
          this.ball.vy = this.state.lastDirection.y * pixelsPerSecond;
          // Сохраняем предыдущую позицию для интерполяции
          this._prevPos.x = this.ball.x;
          this._prevPos.y = this.ball.y;
          // Обновляем позицию
          this.ball.x += this.ball.vx * deltaTime;
          this.ball.y += this.ball.vy * deltaTime;
          // Обрабатываем коллизии с границами
          this.handleBoundaryCollisions();
          // Запоминаем текущую позицию как «текущую» для интерполяции
          this._currPos.x = this.ball.x;
          this._currPos.y = this.ball.y;
        }
      };
      originalUpdateServerPhysics(deltaTime);
    }

    /**
     * Обновляет физику на стороне клиента (во вьювере).
     * @param {number} deltaTime - Время, прошедшее с последнего кадра.
     */
    updateClientPhysics(deltaTime) {
      if (this.state.paused) {
        return;
      }
      if (!this._ensureWorldSizeSet()) {
        return;
      }

      const velocity = this._calculateClientVelocity();
      this._applyAxisLock(velocity);
      this._updateBallPosition(velocity, deltaTime);
      this.handleBoundaryCollisions();
      this._updateCurrentPosition();
    }

    _ensureWorldSizeSet() {
      if (this._worldSizeSet) {
        return true;
      }
      if (this.options.worldWidth > 0 && this.options.worldHeight > 0) {
        this._worldSizeSet = true;
        return true;
      }
      return false;
    }

    _calculateClientVelocity() {
      let vx = typeof this.state.lastVx === 'number' ? this.state.lastVx : 0;
      let vy = typeof this.state.lastVy === 'number' ? this.state.lastVy : 0;
      const pps = this.ball.speed / 100 * this.options.maxSpeed;

      if (vx === 0 && vy === 0) {
        vx = (this.state.lastDirection.x || 0) * pps;
        vy = (this.state.lastDirection.y || 0) * pps;
      }

      return { vx, vy };
    }

    _applyAxisLock(velocity) {
      const dirX = this.state.lastDirection.x || 0;
      const dirY = this.state.lastDirection.y || 0;
      const pps = this.ball.speed / 100 * this.options.maxSpeed;

      const isVertical = Math.abs(dirX) < 1e-6 && Math.abs(dirY) > 0;
      const isHorizontal = Math.abs(dirY) < 1e-6 && Math.abs(dirX) > 0;

      if (isVertical) {
        velocity.vx = 0;
        velocity.vy = Math.sign(dirY || 1) * pps;
        this.state.smoothVx = 0;
      } else if (isHorizontal) {
        velocity.vy = 0;
        velocity.vx = Math.sign(dirX || 1) * pps;
        this.state.smoothVy = 0;
      }

      return velocity;
    }

    _updateBallPosition(velocity, deltaTime) {
      this.ball.vx = velocity.vx;
      this.ball.vy = velocity.vy;
      this._prevPos.x = this.ball.x;
      this._prevPos.y = this.ball.y;
      this.ball.x += velocity.vx * deltaTime;
      this.ball.y += velocity.vy * deltaTime;
    }

    _updateCurrentPosition() {
      this._currPos.x = this.ball.x;
      this._currPos.y = this.ball.y;
    }
    /**
     * Обрабатывает коллизии с границами мира
     */
    handleBoundaryCollisions() {
      const ball = this.ball;
      const radius = ball.radius;
      const worldWidth = this.options.worldWidth;
      const worldHeight = this.options.worldHeight;
      let bounced = false;
      // Проверяем левую и правую границы
      if (ball.x < radius) {
        ball.x = radius; // Клампим позицию
        // Сохраняем осевой замок: не вводим горизонталь, если она была 0
        const dx = this.state.lastDirection.x || 0;
        this.state.lastDirection.x = Math.abs(dx) < 1e-6 ? 0 : Math.abs(dx);
        bounced = true;
      } else if (ball.x > worldWidth - radius) {
        ball.x = worldWidth - radius; // Клампим позицию
        const dx = this.state.lastDirection.x || 0;
        this.state.lastDirection.x = Math.abs(dx) < 1e-6 ? 0 : -Math.abs(dx);
        bounced = true;
      }
      // Проверяем верхнюю и нижнюю границы
      if (ball.y < radius) {
        ball.y = radius; // Клампим позицию
        const dy = this.state.lastDirection.y || 0;
        this.state.lastDirection.y = Math.abs(dy) < 1e-6 ? 0 : Math.abs(dy);
        bounced = true;
      } else if (ball.y > worldHeight - radius) {
        ball.y = worldHeight - radius; // Клампим позицию
        const dy = this.state.lastDirection.y || 0;
        this.state.lastDirection.y = Math.abs(dy) < 1e-6 ? 0 : -Math.abs(dy);
        bounced = true;
      }
      // Вызываем callback при отскоке
      if (bounced) {
        this.handleBounce();
      }
    }
    /**
     * Обрабатывает отскок от границы
     */
    handleBounce() {
      // Мгновенно переназначаем скорость по новому направлению, сохраняя величину
      const speedPercent = this.ball.speed / 100;
      const pixelsPerSecond = speedPercent * this.options.maxSpeed;
      this.ball.vx = this.state.lastDirection.x * pixelsPerSecond;
      this.ball.vy = this.state.lastDirection.y * pixelsPerSecond;
      // Обеспечиваем минимальную скорость после отскока (на случай близких к нулю значений)
      this.ensureMinimumSpeed();
      // ВАЖНО: Обновляем lastVx/lastVy, чтобы клиентская физика не залипала на границе
      this.state.lastVx = this.ball.vx;
      this.state.lastVy = this.ball.vy;
      // Вызываем callback если установлен
      if (this.bounceCallback) {
        this.bounceCallback({
          x: this.ball.x,
          y: this.ball.y,
          vx: this.ball.vx,
          vy: this.ball.vy,
        });
      }
      // Дополнительно инициируем DOM-событие для счётчика пасов на стороне контроллера
      try {
        if (typeof globalThis !== 'undefined') {
          const ev = new CustomEvent('bb_bounce', {
            detail: { x: this.ball.x, y: this.ball.y },
          });
          globalThis.dispatchEvent(ev);
        }
      } catch {
        // ignore
      }
    }
    /**
     * Обеспечивает минимальную скорость после отскока
     */
    ensureMinimumSpeed() {
      const currentSpeed = this.sqrt(
        this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy,
      );
      if (currentSpeed < this.options.minSpeed && currentSpeed > 0) {
        const scale = this.options.minSpeed / currentSpeed;
        this.ball.vx *= scale;
        this.ball.vy *= scale;
      } else if (currentSpeed === 0) {
        // Устанавливаем минимальную скорость в направлении от центра
        const dirX = this.ball.x < this.centerX ? 1 : -1;
        const dirY = this.ball.y < this.centerY ? 1 : -1;
        this.ball.vx = dirX * this.options.minSpeed;
        this.ball.vy = dirY * this.options.minSpeed;
      }
    }
    /**
     * Ensures the ball and its target coordinates are within the world boundaries.
     * @returns {void}
     */
    clampBallWithinBounds() {
      const radius = this.ball.radius;
      const w = this.options.worldWidth;
      const h = this.options.worldHeight;
      if (w <= 0 || h <= 0 || radius < 0) return;
      const clampedX = this.max(radius, this.min(w - radius, this.ball.x));
      const clampedY = this.max(radius, this.min(h - radius, this.ball.y));
      if (clampedX !== this.ball.x) {
        this.ball.x = clampedX;
        if (this.isViewer) this.state.smoothVx = 0;
      }

      if (clampedY !== this.ball.y) {
        this.ball.y = clampedY;
        if (this.isViewer) this.state.smoothVy = 0;
      }

      if (this.state && typeof this.state.targetX === 'number') {
        this.state.targetX = this.max(
          radius,
          this.min(w - radius, this.state.targetX),
        );
      }

      if (this.state && typeof this.state.targetY === 'number') {
        this.state.targetY = this.max(
          radius,
          this.min(h - radius, this.state.targetY),
        );
      }
    }
    // Возвращает интерполированное состояние мяча для рендера
    getInterpolatedBall(alpha) {
      const a = Math.max(0, Math.min(1, typeof alpha === 'number' ? alpha : 1));
      const px = this._prevPos.x;
      const py = this._prevPos.y;
      const cx = this._currPos.x;
      const cy = this._currPos.y;
      this._interpBall.x = px + (cx - px) * a;
      this._interpBall.y = py + (cy - py) * a;
      this._interpBall.radius = this.ball.radius;
      this._interpBall.colorBall = this.ball.colorBall || null;
      return this._interpBall;
    }
    /**
     * Validates viewer-specific commands, ensuring coordinates and velocities are finite numbers.
     * @param {object} command - The command object to validate.
     * @returns {object} A new object with validated properties.
     * @private
     */
    _validateViewerCommand(command) {
      const validated = {};
      if (typeof command.x === 'number' && Number.isFinite(command.x))
        validated.x = command.x;
      if (typeof command.y === 'number' && Number.isFinite(command.y))
        validated.y = command.y;
      if (typeof command.vx === 'number' && Number.isFinite(command.vx))
        validated.vx = command.vx;
      if (typeof command.vy === 'number' && Number.isFinite(command.vy))
        validated.vy = command.vy;
      if (
        typeof command.speed === 'number' &&
        command.speed >= 0 &&
        command.speed <= 100 &&
        !Number.isNaN(command.speed)
      ) {
        validated.speed = command.speed;
      }
      return validated;
    }

    /**
     * Validates server-specific commands, ensuring direction vectors are finite numbers.
     * @param {object} command - The command object to validate.
     * @returns {object} A new object with validated properties.
     * @private
     */
    _validateServerCommand(command) {
      const validated = {};
      if (
        typeof command.dirX === 'number' &&
        Math.abs(command.dirX) <= 1 &&
        Number.isFinite(command.dirX)
      ) {
        validated.dirX = command.dirX;
      }
      if (
        typeof command.dirY === 'number' &&
        Math.abs(command.dirY) <= 1 &&
        Number.isFinite(command.dirY)
      ) {
        validated.dirY = command.dirY;
      }
      if (
        typeof command.speed === 'number' &&
        command.speed >= 0 &&
        command.speed <= 100 &&
        !Number.isNaN(command.speed)
      ) {
        validated.speed = command.speed;
      }
      return validated;
    }

    /**
     * @param {object} command - Команда для валидации.
     * @returns {object} - Валидированная команда.
     * @private
     */
    _validateCommonCommands(command) {
      const validated = {};
      if (typeof command.paused === 'boolean')
        validated.paused = command.paused;
      if (command.reset === true) validated.reset = true;
      if (
        typeof command.radius === 'number' &&
        command.radius > 0 &&
        command.radius <= 1000 &&
        Number.isFinite(command.radius)
      ) {
        validated.radius = command.radius;
      }
      if (
        typeof command.colorBall === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(command.colorBall)
      ) {
        validated.colorBall = command.colorBall;
      }
      if (
        typeof command.colorBg === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(command.colorBg)
      ) {
        validated.colorBg = command.colorBg;
      }
      return validated;
    }

    /**
     * Валидирует входящую команду от сервера
     * @param {object} command - Входящая команда.
     * @returns {object} - Валидированная и очищенная команда.
     */
    _validateCommand(command) {
      const modeSpecificValidated =
        this._getModeSpecificValidatedCommand(command);
      const commonValidated = this._validateCommonCommands(command);
      return { ...modeSpecificValidated, ...commonValidated };
    }

    /**
     * Валидирует специфичные для режима команды
     * @param {object} command - Входящая команда.
     * @returns {object} - Валидированная команда.
     * @private
     */
    _getModeSpecificValidatedCommand(command) {
      return this.isViewer
        ? this._validateViewerCommand(command)
        : this._validateServerCommand(command);
    }

    /**
     * Применяет команду от сервера
     */
    applyCommand(command) {
      if (!command) return;

      const validatedCommand = this._validateCommand(command);
      if (Object.keys(validatedCommand).length === 0) return;

      command = validatedCommand;

      if (this.isViewer) {
        this._handleViewerCommand(command);
      } else {
        this._handleServerCommand(command);
      }

      this._handleCommonCommands(command);
    }

    _handleViewerCommand(command) {
      this._handleViewerPositionUpdate(command);
      this._handleViewerVelocityUpdate(command);
      this._handleViewerSpeedUpdate(command);
    }

    _handleViewerPositionUpdate(command) {
      if (command.x !== undefined && command.y !== undefined) {
        const cx = Math.min(
          this.options.worldWidth - this.ball.radius,
          Math.max(this.ball.radius, command.x),
        );
        const cy = Math.min(
          this.options.worldHeight - this.ball.radius,
          Math.max(this.ball.radius, command.y),
        );

        this.state.targetX = cx;
        this.state.targetY = cy;

        if (command.paused === true) {
          this._handleViewerPositionPause(cx, cy);
        }
      }
    }

    _handleViewerPositionPause(cx, cy) {
      this.state.allowInterpWhenPaused = true;
      this.state.smoothVx = 0;
      this.state.smoothVy = 0;
      this.state.lastVx = 0;
      this.state.lastVy = 0;

      this.ball.x = cx;
      this.ball.y = cy;
      this._prevPos.x = this.ball.x;
      this._prevPos.y = this.ball.y;
      this._currPos.x = this.ball.x;
      this._currPos.y = this.ball.y;
    }

    _handleViewerVelocityUpdate(command) {
      if (command.vx !== undefined) this.state.lastVx = command.vx;
      if (command.vy !== undefined) this.state.lastVy = command.vy;

      const lvx = typeof this.state.lastVx === 'number' ? this.state.lastVx : 0;
      const lvy = typeof this.state.lastVy === 'number' ? this.state.lastVy : 0;
      const sp = Math.hypot(lvx, lvy);

      if (sp > 0) {
        this.state.lastDirection.x = lvx / sp;
        this.state.lastDirection.y = lvy / sp;
      }
    }

    _handleViewerSpeedUpdate(command) {
      if (command.speed !== undefined) {
        this.setSpeed(command.speed);
        if (this.state.paused === false) {
          this._updatePredictionBase();
        }
      }
    }

    _updatePredictionBase() {
      const pps = this.ball.speed / 100 * this.options.maxSpeed;
      const dx = this.state.lastDirection.x || 0;
      const dy = this.state.lastDirection.y || 0;

      if (dx !== 0 || dy !== 0) {
        this.state.lastVx = dx * pps;
        this.state.lastVy = dy * pps;
      }
    }

    _handleServerCommand(command) {
      this._handleServerDirection(command);
      this._handleServerSpeed(command);
      this._handleServerUnpause(command);
    }

    _handleServerDirection(command) {
      if (command.dirX !== undefined || command.dirY !== undefined) {
        const newDx =
          typeof command.dirX !== 'undefined'
            ? command.dirX
            : this.state.lastDirection.x;
        const newDy =
          typeof command.dirY !== 'undefined'
            ? command.dirY
            : this.state.lastDirection.y;
        this.setDirection(newDx, newDy);
      }
    }

    _handleServerSpeed(command) {
      if (command.speed !== undefined) {
        this.setSpeed(command.speed);
      }
    }

    _handleServerUnpause(command) {
      const willBeUnpaused =
        command.paused === false || this.state.paused === false;
      if (willBeUnpaused) {
        this._restoreServerVelocity();
      }
    }

    _restoreServerVelocity() {
      const speedPercent = this.ball.speed / 100;
      const pixelsPerSecond = speedPercent * this.options.maxSpeed;

      let dirX = this.state.lastDirection.x || 0;
      let dirY = this.state.lastDirection.y || 0;

      if (dirX === 0 && dirY === 0) {
        const sp = Math.hypot(this.ball.vx || 0, this.ball.vy || 0);
        if (sp > 0) {
          dirX = (this.ball.vx || 0) / sp;
          dirY = (this.ball.vy || 0) / sp;
          this.setDirection(dirX, dirY);
        }
      }

      this.setVelocity(dirX * pixelsPerSecond, dirY * pixelsPerSecond);
    }

    _handleCommonCommands(command) {
      if (command.paused !== undefined) this.setPaused(command.paused);
      if (command.reset) this.reset();
      if (command.radius !== undefined) this.setBallSize(command.radius);
      if (command.colorBall !== undefined) this.setBallColor(command.colorBall);
      if (command.colorBg !== undefined) this.setBgColor(command.colorBg);
    }
    /**
     * Сбрасывает состояние к начальному
     */
    reset() {
      this.ball.x = this.centerX;
      this.ball.y = this.centerY;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.speed = 30;
      this.ball.radius = this.options.ballRadius;
      // Не устанавливаем паузу при сбросе - игра должна быть активной
      // this.state.paused = true
      this.state.lastDirection.x = 0;
      this.state.lastDirection.y = 0;
      this.state.targetVx = 0;
      this.state.targetVy = 0;
      this.state.targetX = this.centerX;
      this.state.targetY = this.centerY;
    }
  }
  // Экспортируем для использования
  if (typeof globalThis !== 'undefined') {
    globalThis.PhysicsEngine = PhysicsEngine;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhysicsEngine;
  }
}
