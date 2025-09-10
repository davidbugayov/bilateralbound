(function(){
  if (typeof window === 'undefined') return;
  window.BBConfig = window.BBConfig || {
    rendering: {
      hiddenThrottleMs: 100 // при скрытой вкладке ~10 FPS
    },
    smoothing: {
      stiffness: 30,
      damping: 10,
      maxPredictSec: 0.25,
      snapDistance: 2
    }
  };
})();
