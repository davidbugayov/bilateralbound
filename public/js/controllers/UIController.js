// UIController — отвечает за управление кнопками, сегментами направления и обновлениями UI
export class UIController {
  constructor () {}

  updatePlayPauseButton (isPlaying) {
    const button = document.getElementById('playPauseBtn')
    if (!button) return
    button.textContent = isPlaying ? '⏸ Стоп' : '▶️ Старт'
    button.classList.toggle('playing', !!isPlaying)
  }
}


