'use strict'
/**
 * UI Controls - Инициализация и управление UI контролами
 * @module application/controller/ui-controls
 */
/* global sharedComponents, throttle */
const components = {}
/**
 * Инициализация контрола скорости
 */
function _initializeSpeedControl(onSpeedChange) {
  const container = document.getElementById('speedControl')
  if (!container) return
  components.speed = sharedComponents.createSpeedControl(container, {
    onSpeedChange: throttle((speed) => {
      if (onSpeedChange) onSpeedChange(speed)
    }, 100)
  })
}
/**
 * Инициализация контрола цвета мяча
 */
function _initializeBallColorControl(onColorChange) {
  const container = document.getElementById('ballColorControl')
  if (!container) return
  components.ballColor = sharedComponents.createColorControl(container, {
    colors: [
      '#60a5fa',
      '#ef4444',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#f97316',
      '#06b6d4',
      '#84cc16',
      '#fb7185',
      '#ffffff',
      '#a855f7',
      '#14b8a6'
    ],
    defaultValue: '#60a5fa',
    title: '',
    onColorChange: (color) => {
      if (onColorChange) onColorChange(color)
    }
  })
}
/**
 * Инициализация контрола цвета фона
 */
function _initializeBgColorControl(onColorChange) {
  const container = document.getElementById('bgColorControl')
  if (!container) return
  components.bgColor = sharedComponents.createColorControl(container, {
    colors: [
      '#020617',
      '#000000',
      '#111827',
      '#0a2540',
      '#052e16',
      '#1a102a',
      '#fef3c7',
      '#dbeafe',
      '#fce7f3',
      '#f3f4f6',
      '#e5e7eb',
      '#d1d5db'
    ],
    defaultValue: '#020617',
    title: '',
    onColorChange: (color) => {
      if (onColorChange) onColorChange(color)
    }
  })
}
/**
 * Инициализация контрола размера
 */
function _initializeSizeControl(onSizeChange) {
  const container = document.getElementById('sizeControl')
  if (!container) return
  components.size = sharedComponents.createSizeControl(container, {
    sizes: [20, 40, 80, 100],
    defaultValue: 20,
    title: '',
    onSizeChange: (size) => {
      if (onSizeChange) onSizeChange(size)
    }
  })
}
/**
 * Инициализация контролов звука
 */
function _initializeSoundControls(
  onSoundEnabledChange,
  onSoundTypeChange,
  getLastServerState,
  updateAudioIndicators
) {
  const soundEnabledCheckbox = document.getElementById('soundEnabledCheckbox')
  const soundTypeSelect = document.getElementById('soundTypeSelect')
  const soundTypeControl = document.getElementById('soundTypeControl')
  if (!soundEnabledCheckbox || !soundTypeSelect || !soundTypeControl) return
  try {
    soundEnabledCheckbox.addEventListener('change', (e) => {
      const enabled = e.target.checked
      if (onSoundEnabledChange) onSoundEnabledChange(enabled)
      if (enabled) {
        soundTypeControl.style.opacity = '1'
        soundTypeControl.style.pointerEvents = 'auto'
      } else {
        soundTypeControl.style.opacity = '0.5'
        soundTypeControl.style.pointerEvents = 'none'
      }
      const lastState = getLastServerState ? getLastServerState() : null
      if (lastState) {
        lastState.soundEnabled = enabled
      }
      if (updateAudioIndicators) updateAudioIndicators()
    })
    soundTypeSelect.addEventListener('change', (e) => {
      const soundType = e.target.value
      if (onSoundTypeChange) onSoundTypeChange(soundType)
      const lastState = getLastServerState ? getLastServerState() : null
      if (lastState) {
        lastState.soundType = soundType
      }
    })
    const lastState = getLastServerState ? getLastServerState() : null
    if (lastState) {
      if (typeof lastState.soundEnabled === 'boolean') {
        soundEnabledCheckbox.checked = lastState.soundEnabled
        if (lastState.soundEnabled) {
          soundTypeControl.style.opacity = '1'
          soundTypeControl.style.pointerEvents = 'auto'
        }
      }
      if (lastState.soundType) {
        soundTypeSelect.value = lastState.soundType
      }
    }
  } catch (error) {
    console.error('Error initializing sound controls:', error)
  }
}
/**
 * Инициализация всех компонентов
 */
function initializeComponents(callbacks) {
  _initializeSpeedControl(callbacks?.onSpeedChange)
  _initializeBallColorControl(callbacks?.onBallColorChange)
  _initializeBgColorControl(callbacks?.onBgColorChange)
  _initializeSizeControl(callbacks?.onSizeChange)
  _initializeSoundControls(
    callbacks?.onSoundEnabledChange,
    callbacks?.onSoundTypeChange,
    callbacks?.getLastServerState,
    callbacks?.updateAudioIndicators
  )
  // Don't enable controls here — viewer-status module handles enable/disable via CSS class
  if (callbacks?.updateDirectionDisplay) {
    callbacks.updateDirectionDisplay(1, 0)
  }
}
/**
 * Включить/выключить контролы
 */
function setControlsEnabled(enabled) {
  const toggle = (id) => {
    const el = document.getElementById(id)
    if (!el) return
    el.style.pointerEvents = enabled ? '' : 'none'
    el.style.opacity = enabled ? '1' : '0.5'
    el.querySelectorAll('button,input,select').forEach((node) => {
      node.disabled = !enabled
    })
  }
  toggle('ballColorControl')
  toggle('bgColorControl')
  toggle('sizeControl')
  toggle('speedControl')
}
/**
 * Получить компоненты
 */
function getComponents() {
  return components
}
if (typeof globalThis !== 'undefined') {
  globalThis.UIControls = {
    initialize: initializeComponents,
    setEnabled: setControlsEnabled,
    getComponents
  }
  globalThis.components = components
}

module.exports = { initializeComponents, setControlsEnabled, getComponents }
