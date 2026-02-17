'use strict'
/**
 * SessionState - Управление глобальным состоянием сессии
 * @module domain/session-state
 */

// Инициализация глобального состояния
if (typeof globalThis.__current === 'undefined') {
  globalThis.__current = {
    sessionId: null,
    viewerConnected: false,
    viewerScreenSize: { width: 0, height: 0 },
    viewerAudioActivated: false,
    isInitializing: true,
    isPlaying: false
  }
}

// Рендерер для превью
if (typeof globalThis.__previewRenderer === 'undefined') {
  globalThis.__previewRenderer = null
}
if (typeof globalThis.__previewScale === 'undefined') {
  globalThis.__previewScale = 1
}

/**
 * Получить текущее состояние сессии
 */
function getSessionState() {
  return globalThis.__current
}

/**
 * Обновить состояние сессии
 */
function updateSessionState(updates) {
  Object.assign(globalThis.__current, updates)
}

/**
 * Сбросить состояние сессии
 */
function resetSessionState() {
  globalThis.__current = {
    sessionId: globalThis.__current?.sessionId || null,
    viewerConnected: false,
    viewerScreenSize: { width: 0, height: 0 },
    viewerAudioActivated: false,
    isInitializing: false,
    isPlaying: false
  }
}

/**
 * Проверить подключен ли viewer
 */
function isViewerConnected() {
  return globalThis.__current?.viewerConnected === true
}

/**
 * Установить ID сессии
 */
function setSessionId(sessionId) {
  globalThis.__current.sessionId = sessionId
}

/**
 * Получить ID сессии
 */
function getSessionId() {
  return globalThis.__current?.sessionId
}

// Экспорт в глобальную область
if (typeof globalThis !== 'undefined') {
  globalThis.SessionState = {
    get: getSessionState,
    update: updateSessionState,
    reset: resetSessionState,
    isViewerConnected,
    setSessionId,
    getSessionId
  }
}
