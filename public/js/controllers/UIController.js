"use strict";
/**
 * UIController - контроллер для управления пользовательским интерфейсом
 * Отвечает за обновление элементов интерфейса и обработку пользовательских действий
 */
export class UIController {
  /**
   * Создает экземпляр контроллера пользовательского интерфейса
   * @param {Object} appState - глобальное состояние приложения
   */
  constructor(appState) {
    this.appState = appState;
    this.directionSegments = [];
  }
  /**
   * Обновляет кнопку воспроизведения/паузы
   * @param {boolean} isPlaying - флаг состояния воспроизведения
   */
  updatePlayPauseButton(isPlaying) {
    const button = document.getElementById('playPauseBtn');
    if (!button) return;
    if (isPlaying) {
    button.textContent = '⏸ Стоп';
    button.classList.add('playing');
    } else {
    button.textContent = '▶️ Старт';
    button.classList.remove('playing');
    }
  }
  /**
   * Обновляет активные сегменты направлений
   * @param {Object} currentDirection - объект с текущим направлением движения
   * @param {number} currentDirection.dx - компонент X направления
   * @param {number} currentDirection.dy - компонент Y направления
   */
  updateDirectionSegments(currentDirection) {
    // Снимаем активное состояние со всех сегментов
    for (const segment of document.querySelectorAll('.direction-segment')) {
      segment.classList.remove('active');
    }
    // Определяем активный сегмент на основе направления
    const { dx, dy } = currentDirection;
    let activeSegment = null;
    if (Math.abs(dx) > 0.9) activeSegment = 'right';
    else if (Math.abs(dy) > 0.9) activeSegment = 'down';
    else if (dx > 0 && dy > 0) activeSegment = 'down-right';
    else if (dx > 0 && dy < 0) activeSegment = 'up-right';
    // Устанавливаем активное состояние
    if (activeSegment) {
    const activeElement = document.querySelector(`[data-direction="${activeSegment}"]`);
    if (activeElement) {
    activeElement.classList.add('active');
    }
    }
  }
  /**
   * Обновляет статус подключения вьювера
   * @param {boolean} isConnected - флаг подключения вьювера
   * @param {Object|null} screenSize - объект с размерами экрана вьювера
   * @param {number} screenSize.width - ширина экрана
   * @param {number} screenSize.height - высота экрана
   */
  updateViewerStatus(isConnected, screenSize = null) {
    const statusEl = document.getElementById('viewerStatus');
    if (!statusEl) return;
    if (isConnected && screenSize) {
    statusEl.textContent = `Подключен (${screenSize.width}×${screenSize.height})`;
    statusEl.classList.add('connected');
    statusEl.classList.remove('disconnected');
    } else {
    statusEl.textContent = 'Ожидание...';
    statusEl.classList.add('disconnected');
    statusEl.classList.remove('connected');
    }
  }
}
