/**
 * UIController - Управление пользовательским интерфейсом
 * Отвечает за обновление кнопок, сегментов направления и других UI элементов
 */
export class UIController {
  constructor(appState) {
    this.appState = appState;
    this.directionSegments = [];
    this.init();
  }

  init() {
    // Инициализация сегментов направления
    this.initDirectionSegments();
    
    // Инициализация кнопок
    this.initButtons();
  }

  initDirectionSegments() {
    // Находим все сегменты направления
    this.directionSegments = Array.from(document.querySelectorAll('.direction-segment'));
    
    // Добавляем обработчики событий
    this.directionSegments.forEach(segment => {
      segment.addEventListener('click', (e) => {
        const direction = e.target.dataset.direction;
        if (direction) {
          this.onDirectionClick(direction);
        }
      });
    });
  }

  initButtons() {
    // Кнопка play/pause
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => this.onPlayPauseClick());
    }

    // Кнопка сброса
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.onResetClick());
    }

    // Кнопка копирования ссылки
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.onCopyClick());
    }
  }

  updatePlayPauseButton(isPlaying) {
    const button = document.getElementById('playPauseBtn');
    if (!button) return;

    if (isPlaying) {
      button.textContent = '⏸ Стоп';
      button.classList.remove('paused');
      button.classList.add('playing');
    } else {
      button.textContent = '▶️ Старт';
      button.classList.remove('playing');
      button.classList.add('paused');
    }
  }

  updateDirectionSegments(currentDirection) {
    this.directionSegments.forEach(segment => {
      const direction = segment.dataset.direction;
      const isActive = this.isDirectionActive(direction, currentDirection);
      
      segment.classList.toggle('active', isActive);
    });
  }

  isDirectionActive(segmentDirection, currentDirection) {
    const { dx, dy } = currentDirection;
    
    switch (segmentDirection) {
      case 'left': return dx < 0 && Math.abs(dx) > Math.abs(dy);
      case 'right': return dx > 0 && Math.abs(dx) > Math.abs(dy);
      case 'up': return dy < 0 && Math.abs(dy) > Math.abs(dx);
      case 'down': return dy > 0 && Math.abs(dy) > Math.abs(dx);
      case 'up-left': return dx < 0 && dy < 0;
      case 'up-right': return dx > 0 && dy < 0;
      case 'down-left': return dx < 0 && dy > 0;
      case 'down-right': return dx > 0 && dy > 0;
      default: return false;
    }
  }

  updateViewerStatus(connected, screenSize) {
    const statusEl = document.getElementById('viewerStatus');
    if (!statusEl) return;

    if (connected) {
      statusEl.textContent = `Подключен (${screenSize.width}×${screenSize.height})`;
      statusEl.classList.remove('disconnected');
      statusEl.classList.add('connected');
    } else {
      statusEl.textContent = 'Не подключен';
      statusEl.classList.remove('connected');
      statusEl.classList.add('disconnected');
    }
  }

  showMessage(message, type = 'info') {
    // Создаем или обновляем элемент сообщения
    let messageEl = document.getElementById('message');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'message';
      messageEl.className = 'message';
      document.body.appendChild(messageEl);
    }

    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    
    // Автоматически скрываем через 3 секунды
    setTimeout(() => {
      if (messageEl) {
        messageEl.remove();
      }
    }, 3000);
  }

  // Обработчики событий
  onDirectionClick(direction) {
    if (this.appState.onDirectionChange) {
      this.appState.onDirectionChange(direction);
    }
  }

  onPlayPauseClick() {
    if (this.appState.onPlayPauseToggle) {
      this.appState.onPlayPauseToggle();
    }
  }

  onResetClick() {
    if (this.appState.onReset) {
      this.appState.onReset();
    }
  }

  onCopyClick() {
    if (this.appState.onCopy) {
      this.appState.onCopy();
    }
  }
}


