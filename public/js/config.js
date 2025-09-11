(function(){
  if (typeof window === 'undefined') return;
  window.BBConfig = window.BBConfig || {
    rendering: {
      hiddenThrottleMs: 100, // при скрытой вкладке ~10 FPS
      adaptiveFrameRate: true, // Адаптивная частота кадров
      maxFrameTime: 50 // Максимальное время кадра в ms
    },
    smoothing: {
      stiffness: 45, // Оптимизированная жесткость пружины
      damping: 15, // Оптимизированное демпфирование
      maxPredictSec: 0.4, // Увеличенное время предикции
      snapDistance: 3, // Увеличенная дистанция авто-снапа
      predictionEnabled: true // Включена предикция движения
    },
    network: {
      heartbeatInterval: 25000, // 25 секунд
      reconnectDelay: 3000, // 3 секунды
      messageTimeout: 5000, // 5 секунд
      maxReconnectAttempts: 5
    },
    performance: {
      deadReckonEps: 1.5, // Увеличен порог dead reckoning
      throttleDelay: 50, // Базовая задержка throttling
      adaptiveThrottling: true // Адаптивное throttling
    }
  };
})();
