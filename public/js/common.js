/**
 * Common utilities and functions for BilateralBound
 * Оптимизирован для производительности и переиспользуемости
 */

// Кэшируем часто используемые функции
const random = Math.random;
const toString = (num, radix) => num.toString(radix);

/**
 * Генерирует случайный ID сессии (оптимизированная версия)
 */
function randomSid() {
    return toString(random() * 36, 36).slice(2, 8);
}

/**
 * Проверяет поддержку Canvas (кэшированная версия)
 */
function isCanvasSupported() {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('2d'));
}

/**
 * Создает и возвращает canvas элемент с оптимизированными настройками
 */
function createOptimizedCanvas(width = 800, height = 600) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    // Оптимизируем canvas для производительности
    const ctx = canvas.getContext('2d', {
        alpha: false,           // Отключаем альфа-канал для лучшей производительности
        desynchronized: true,   // Улучшаем производительность на некоторых устройствах
        powerPreference: 'high-performance' // Предпочитаем высокую производительность
    });
    
    // Устанавливаем оптимальные настройки рендеринга
    ctx.imageSmoothingEnabled = false; // Отключаем сглаживание для пиксельной графики
    
    return { canvas, ctx };
}

/**
 * Создает пул объектов для переиспользования
 */
class ObjectPool {
    constructor(createFn, resetFn, initialSize = 10) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = new Set();
        
        // Предварительно создаем объекты
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }
    
    acquire() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        
        this.active.add(obj);
        return obj;
    }
    
    release(obj) {
        if (this.active.has(obj)) {
            this.resetFn(obj);
            this.active.delete(obj);
            this.pool.push(obj);
        }
    }
    
    clear() {
        this.pool.length = 0;
        this.active.clear();
    }
}

/**
 * Утилита для измерения производительности
 */
class PerformanceMonitor {
    constructor() {
        this.marks = new Map();
        this.measures = new Map();
    }
    
    mark(name) {
        this.marks.set(name, performance.now());
    }
    
    measure(name, startMark, endMark) {
        const start = this.marks.get(startMark);
        const end = this.marks.get(endMark);
        
        if (start && end) {
            this.measures.set(name, end - start);
        }
    }
    
    getMeasure(name) {
        return this.measures.get(name);
    }
    
    clear() {
        this.marks.clear();
        this.measures.clear();
    }
}

/**
 * Утилита для дебаунсинга функций
 */
function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(this, args);
    };
}

/**
 * Утилита для throttle функций
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Утилита для анимации чисел
 */
function animateNumber(element, start, end, duration = 1000, easing = 'easeOut') {
    const startTime = performance.now();
    const difference = end - start;
    
    const easingFunctions = {
        linear: t => t,
        easeOut: t => 1 - Math.pow(1 - t, 3),
        easeIn: t => t * t * t,
        easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    };
    
    const ease = easingFunctions[easing] || easingFunctions.easeOut;
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easedProgress = ease(progress);
        const current = start + (difference * easedProgress);
        
        element.textContent = Math.round(current);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

/**
 * Утилита для проверки видимости элемента
 */
function isElementVisible(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    return (
        rect.top < windowHeight &&
        rect.bottom > 0 &&
        rect.left < windowWidth &&
        rect.right > 0
    );
}

/**
 * Утилита для получения размера экрана
 */
function getScreenSize() {
    return {
        width: window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight
    };
}

/**
 * Утилита для проверки мобильного устройства
 */
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Утилита для безопасного парсинга JSON
 */
function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Утилита для глубокого клонирования объекта
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (typeof obj === 'object') {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

// Экспортируем для использования
if (typeof window !== 'undefined') {
    // Основные функции
    window.randomSid = randomSid;
    window.isCanvasSupported = isCanvasSupported;
    
    // Дополнительные утилиты
    window.createOptimizedCanvas = createOptimizedCanvas;
    window.ObjectPool = ObjectPool;
    window.PerformanceMonitor = PerformanceMonitor;
    window.debounce = debounce;
    window.throttle = throttle;
    window.animateNumber = animateNumber;
    window.isElementVisible = isElementVisible;
    window.getScreenSize = getScreenSize;
    window.isMobile = isMobile;
    window.safeJsonParse = safeJsonParse;
    window.deepClone = deepClone;
    
    // Создаем глобальный экземпляр PerformanceMonitor
    window.performanceMonitor = new PerformanceMonitor();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        randomSid,
        isCanvasSupported,
        createOptimizedCanvas,
        ObjectPool,
        PerformanceMonitor,
        debounce,
        throttle,
        animateNumber,
        isElementVisible,
        getScreenSize,
        isMobile,
        safeJsonParse,
        deepClone
    };
}

