'use strict'
if (typeof globalThis !== 'undefined') {
  globalThis.BBConfig = globalThis.BBConfig || {
    rendering: {
      hiddenThrottleMs: 100, // при скрытой вкладке ~10 FPS
      adaptiveFrameRate: true, // Адаптивная частота кадров
      maxFrameTime: 32, // Максимальное время кадра в ms (для предотвращения спирали)
      targetFrameTime: 16 // Целевое время кадра для 60 FPS
    },
    smoothing: {
      // Base parameters (адаптивно меняются через smoothing-utils.js)
      damping: 22, // Base damping (15-25) — чем больше, тем мягче
      stiffness: 28, // Base stiffness (25-35) — чем меньше, тем плавнее
      maxPredictSec: 0.02, // Max prediction time (0.01-0.05)
      snapDistance: 0.3, // Snap distance threshold (0.2-0.4)
      // Adaptive smoothing factors
      dampingJitterFactor: 20, // jitterMs / factor для damping
      stiffnessJitterFactor: 30, // jitterMs / factor для stiffness
      highJitterThreshold: 15, // Порог для snapDistance increase
      // Drift correction
      driftThresholdPx: 50, // Порог дрейфа в пикселях (20-100)
      driftCorrectionMs: 400, // Время коррекции дрейфа (100-500, больше = плавнее)
      driftCheckIntervalMs: 3000, // Интервал проверки дрейфа
      // Legacy flags (сохранены для совместимости)
      predictionEnabled: true, // Включена предикция движения
      adaptiveStiffness: true, // Адаптивная жесткость на основе расстояния
      adaptiveDamping: true, // Адаптивное демпфирование на основе скорости
      exponentialSmoothing: true, // Включено экспоненциальное сглаживание
      stateBuffering: true, // Буферизация состояний для интерполяции
      bufferSize: 10, // Буфер для интерполяции
      smoothingFactor: 0.35, // Коэффициент сглаживания позиции
      velocitySmoothingAlpha: 0.1 // Коэффициент сглаживания скорости
    },
    network: {
      heartbeatInterval: 25000, // 25 секунд
      reconnectDelay: 2000, // Уменьшена задержка для быстрого восстановления
      messageTimeout: 5000, // 5 секунд
      maxReconnectAttempts: 10, // Увеличено количество попыток
      coalesceTypes: ['controller_update'], // Типы сообщений для коалесцирования
      coalesceDelayMs: 8, // Уменьшена задержка для большей плавности
      priorityTypes: ['controller_update', 'heartbeat'] // Приоритетные типы сообщений
    },
    performance: {
      deadReckonEps: 1, // Уменьшен порог dead reckoning для точности
      throttleDelay: 16, // Задержка throttling для 60 FPS
      adaptiveThrottling: true, // Адаптивное throttling
      maxFrameSteps: 3, // Максимальное количество шагов физики за кадр
      stepCapping: true // Включено ограничение шага для предотвращения рывков
    },
    physics: {
      minSpeed: 50, // Минимальная скорость после отскока
      maxSpeed: 5000, // Максимальная скорость
      ballRadius: 20, // Радиус мяча по умолчанию
      worldWidth: 800, // Ширина мира по умолчанию
      worldHeight: 600, // Высота мира по умолчанию
      maxAcceleration: 5000 // Максимальное ускорение для предотвращения рывков
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = globalThis.BBConfig
  }
}
