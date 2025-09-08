/**
 * Common utilities and functions for BilateralBound
 * Оптимизирован для производительности и переиспользуемости
 */

// Условное логирование только в режиме разработки
const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const debugLog = DEBUG ? (...args) => console.log(...args) : () => {}
const debugError = DEBUG ? (...args) => console.error(...args) : () => {}
const debugWarn = DEBUG ? (...args) => console.warn(...args) : () => {}

/**
 * Извлекает ID сессии из URL.
 * @returns {string|null} ID сессии или null, если не найден.
 */
function getSessionIdFromUrl() {
    const path = window.location.pathname;
    const parts = path.split('/');
    
    // Новый формат: /c/SESSION_ID или /s/SESSION_ID
    if ((parts[1] === 'c' || parts[1] === 's') && parts[2]) {
        return parts[2];
    }
    
    // Старый формат: ?sessionId=SESSION_ID
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('sessionId');
}

/**
 * Управляет полноэкранным режимом
 */
function toggleFullscreen(element = document.documentElement) {
    if (!document.fullscreenElement) {
        element.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

/**
 * Создает throttled-версию функции, которая вызывается не чаще одного раза
 * за указанный период. Полезна для событий, которые срабатывают очень часто (resize, scroll, input).
 * @param {Function} func Функция для throttle.
 * @param {number} limit Задержка в миллисекундах.
 * @returns {Function} Новая throttled-функция.
 */
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
  window.debugLog = debugLog;
  window.debugError = debugError;
  window.debugWarn = debugWarn;
  window.getSessionIdFromUrl = getSessionIdFromUrl;
  window.toggleFullscreen = toggleFullscreen;
  window.throttle = throttle;
}
