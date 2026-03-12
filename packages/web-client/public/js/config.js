(function () {
  'use strict'
  if (typeof globalThis === 'undefined') return
  globalThis.BBConfig = globalThis.BBConfig || {
    rendering: {
      hiddenThrottleMs: 100, // при скрытой вкладке ~10 FPS
      adaptiveFrameRate: true, // Адаптивная частота кадров
      maxFrameTime: 32, // Максимальное время кадра в ms (для предотвращения спирали)
      targetFrameTime: 16 // Целевое время кадра для 60 FPS
    },
    smoothing: {
      stiffness: 50, // Максимальная жесткость для мгновенной реакции
      damping: 30, // Агрессивное демпфирование для устранения колебаний
      maxPredictSec: 0.05, // Минимальное время предикции для стабильности
      snapDistance: 0.1, // Минимальная дистанция снапа для точности
      predictionEnabled: true, // Включена предикция движения
      adaptiveStiffness: true, // Адаптивная жесткость на основе расстояния
      adaptiveDamping: true, // Адаптивное демпфирование на основе скорости
      exponentialSmoothing: true, // Включено экспоненциальное сглаживание
      stateBuffering: true, // Буферизация состояний для интерполяции
      bufferSize: 10, // ОЧЕНЬ большой буфер для максимального сглаживания
      smoothingFactor: 0.35, // Очень высокий коэффициент сглаживания позиции
      velocitySmoothingAlpha: 0.1 // Очень низкий коэффициент сглаживания скорости
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
})()
