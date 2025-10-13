export default class CountersController {
  constructor(appState) {
    this.appState = appState;
    this.timerMs = 0;
    this.passes = 0;
    this.sets = 0;
    this.running = false;
  }

  start() {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  onBounce() {
    if (this.running) {
      this.passes++;
    }
  }

  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
    this.timerMs = stats.timerMs || 0;
    this.passes = stats.passes || 0;
    this.sets = stats.sets || 0;
    this.running = stats.running || false;
  }
}
