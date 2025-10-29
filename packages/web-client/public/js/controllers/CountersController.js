/**
 * CountersController - контроллер для управления счётчиками EMDR терапии
 * Отвечает за отслеживание времени, пасов и сетов во время сессии
 */
export default class CountersController {
  /**
   * Создает экземпляр контроллера счётчиков
   * @param {Object} appState - глобальное состояние приложения
   */
  constructor(appState) {
    this.appState = appState
    this.timerMs = 0
    this.passes = 0
    this.sets = 0
    this.running = false
  }

  /**
   * Запускает счётчик времени
   */
  start() {
    this.running = true
  }

  /**
   * Останавливает счётчик времени
   */
  stop() {
    this.running = false
  }

  /**
   * Обрабатывает событие отскока мяча
   * Увеличивает счётчик пасов при активном таймере
   */
  onBounce() {
    if (this.running) {
      this.passes++
    }
  }

  /**
   * Форматирует время из миллисекунд в формат MM:SS
   * @param {number} ms - время в миллисекундах
   * @returns {string} отформатированное время
   */
  formatTime(ms) {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  /**
   * Получает текущие статистические данные
   * @returns {Object} объект с текущими значениями счётчиков
   */
  getStats() {
    return {
      timerMs: this.timerMs,
      passes: this.passes,
      sets: this.sets,
      running: this.running
    }
  }

  /**
   * Устанавливает статистические данные
   * @param {Object} stats - объект с новыми значениями счётчиков
   */
  setStats(stats) {
    this.timerMs = stats.timerMs || 0
    this.passes = stats.passes || 0
    this.sets = stats.sets || 0
    this.running = stats.running || false
  }
}
