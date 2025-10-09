/**
 * CountersController - Управление счётчиками (таймер, пасы, сеты)
 * Отвечает за логику подсчёта времени, отскоков и сетов
 */
class CountersController {
  constructor(appState) {
    this.appState = appState;
    this.timerMs = 0;
    this.passes = 0;
    this.sets = 0;
    this.running = false;
    this.lastTickTs = 0;
    this.lastBounceTs = 0;
    this.bounceThreshold = 100; // Минимальный интервал между отскоками (мс)
    
    this.$timer = null;
    this.$passes = null;
    this.$sets = null;
    
    this.init();
  }

  init() {
    // Получаем DOM элементы
    this.$timer = document.getElementById('timer');
    this.$passes = document.getElementById('passes');
    this.$sets = document.getElementById('sets');
    
    // Инициализируем отображение
    this.updateDisplay();
  }

  start() {
    this.running = true;
    this.lastTickTs = performance.now();
    this.updateDisplay();
  }

  stop() {
    // Обновляем время до последнего момента перед остановкой
    if (this.running) {
      const now = performance.now();
      const dt = now - this.lastTickTs;
      this.timerMs += dt;
    }
    this.running = false;
    this.updateDisplay();
  }

  reset() {
    this.timerMs = 0;
    this.passes = 0;
    this.sets = 0;
    this.running = false;
    this.lastTickTs = 0;
    this.lastBounceTs = 0;
    this.updateDisplay();
  }

  tick() {
    if (!this.running) return;

    const now = performance.now();
    const dt = now - this.lastTickTs;
    this.lastTickTs = now;

    if (dt > 0 && dt < 1000) {
      this.timerMs += dt;
    }

    // Обновляем отображение не чаще раза в секунду для таймера
    // и при изменении других значений
    if (!this._lastRenderTs || now - this._lastRenderTs > 1000) {
      this._lastRenderTs = now;
      this.updateDisplay(true); // Принудительное обновление таймера
    } else {
      this.updateDisplay(false); // Обновление только пасов и сетов
    }
  }

  onBounce() {
    if (!this.running) return;

    const now = performance.now();
    if (now - this.lastBounceTs < this.bounceThreshold) return;

    this.lastBounceTs = now;
    this.passes++;

    if (this.passes % 10 === 0) {
      this.sets++;
    }
    // НЕ вызываем updateDisplay здесь, tick() сделает это
  }

  updateDisplay(forceTimerUpdate = false) {
    // Обновляем DOM только если значение изменилось
    if (this.$timer && forceTimerUpdate) {
      const newTime = this.formatTime(this.timerMs);
      if (this.$timer.textContent !== newTime) {
        this.$timer.textContent = newTime;
      }
    }
    
    if (this.$passes) {
      const newPasses = this.passes.toString();
      if (this.$passes.textContent !== newPasses) {
        this.$passes.textContent = newPasses;
      }
    }
    
    if (this.$sets) {
      const newSets = this.sets.toString();
      if (this.$sets.textContent !== newSets) {
        this.$sets.textContent = newSets;
      }
    }
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  getStats() {
    return {
      timerMs: this.timerMs,
      passes: this.passes,
      sets: this.sets,
      running: this.running
    };
  }

  setStats(stats) {
    if (stats.timerMs !== undefined) this.timerMs = stats.timerMs;
    if (stats.passes !== undefined) this.passes = stats.passes;
    if (stats.sets !== undefined) this.sets = stats.sets;
    if (stats.running !== undefined) this.running = stats.running;
    
    this.updateDisplay();
  }
}

export default CountersController;
