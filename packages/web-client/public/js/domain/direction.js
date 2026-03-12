'use strict'
/**
 * Direction - Логика управления направлением движения
 * @module domain/direction
 */
let _directionState = { dx: 1, dy: 0 }
let _currentDirectionMode = 'horizontal'
/**
 * Получить вектор направления для режима
 * @param {string} directionMode - Режим направления
 * @returns {{dirX: number, dirY: number}|null}
 */
function getDirectionVector(directionMode) {
  switch (directionMode) {
    case 'horizontal':
      return { dirX: 1, dirY: 0 }
    case 'vertical':
      return { dirX: 0, dirY: 1 }
    case 'diagRL':
    case 'diagRLL': {
      // Extract screen dimensions once to avoid duplication
      const width = globalThis.__current?.viewerScreenSize?.width || 800
      const height = globalThis.__current?.viewerScreenSize?.height || 600
      const diagonal = Math.hypot(width, height)
      const dirY = directionMode === 'diagRL' ? height / diagonal : -height / diagonal
      return { dirX: width / diagonal, dirY }
    }
    case 'random': {
      // Math.random() is safe here: used only for visual randomization of ball direction
      // (not cryptographic or security-sensitive). No sensitive data depends on this randomness.
      const angle = Math.random() * 2 * Math.PI
      return { dirX: Math.cos(angle), dirY: Math.sin(angle) }
    }
    default:
      return null
  }
}
/**
 * Определить режим направления по компонентам вектора
 * @param {number} dirX
 * @param {number} dirY
 * @returns {string}
 */
function getDirectionMode(dirX, dirY) {
  if (dirX === undefined || dirY === undefined) return 'horizontal'
  const ax = Math.abs(dirX)
  const ay = Math.abs(dirY)
  if (ay < 0.01) return 'horizontal'
  if (ax < 0.01) return 'vertical'
  if (dirX > 0 && dirY > 0) return 'diagRL' // TL→BR
  if (dirX > 0 && dirY < 0) return 'diagRLL' // BL→TR
  return 'horizontal'
}
/**
 * Проверить, является ли режим диагональным
 * @returns {boolean}
 */
function isDiagonalMode() {
  return (
    _currentDirectionMode === 'diagRL' || _currentDirectionMode === 'diagRLL'
  )
}
/**
 * Получить текущее состояние направления
 */
function getDirectionState() {
  return { ..._directionState }
}
/**
 * Установить состояние направления
 */
function setDirectionState(dx, dy) {
  _directionState = { dx, dy }
}
/**
 * Получить текущий режим направления
 */
function getCurrentDirectionMode() {
  return _currentDirectionMode
}
/**
 * Установить режим направления
 */
function setCurrentDirectionMode(mode) {
  _currentDirectionMode = mode
}
/**
 * Пересчитать диагональное направление при изменении размера экрана
 */
function recalculateDiagonalDirection() {
  if (!isDiagonalMode()) return null
  const vector = getDirectionVector(_currentDirectionMode)
  if (vector) {
    _directionState = { dx: vector.dirX, dy: vector.dirY }
  }
  return vector
}
if (typeof globalThis !== 'undefined') {
  globalThis.Direction = {
    getVector: getDirectionVector,
    getMode: getDirectionMode,
    isDiagonal: isDiagonalMode,
    getState: getDirectionState,
    setState: setDirectionState,
    getCurrentMode: getCurrentDirectionMode,
    setCurrentMode: setCurrentDirectionMode,
    recalculateDiagonal: recalculateDiagonalDirection
  }
}
