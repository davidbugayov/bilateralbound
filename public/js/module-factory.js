/**
 * ModuleFactory - фабрика для создания и управления модулями BilateralBound
 * Обеспечивает переиспользование и оптимизацию производительности
 */

class ModuleFactory {
    constructor() {
        this.instances = new Map();
        this.configs = new Map();
        this.pools = new Map();
    }

    /**
     * Создает экземпляр PhysicsEngine с переиспользованием
     */
    createPhysicsEngine(options = {}) {
        const key = this.generateKey('physics', options);
        
        if (this.instances.has(key)) {
            const instance = this.instances.get(key);
            instance.reset();
            return instance;
        }

        const instance = new PhysicsEngine(options);
        this.instances.set(key, instance);
        return instance;
    }

    /**
     * Создает экземпляр BallRenderer с переиспользованием
     */
    createRenderer(canvas, physicsEngine, options = {}) {
        const key = this.generateKey('renderer', { canvasId: canvas.id, options });
        
        if (this.instances.has(key)) {
            const instance = this.instances.get(key);
            instance.setPhysicsEngine(physicsEngine);
            return instance;
        }

        const instance = new BallRenderer(canvas, physicsEngine);
        this.instances.set(key, instance);
        return instance;
    }

    /**
     * Создает экземпляр SessionSync с переиспользованием
     */
    createSessionSync(options = {}) {
        const key = this.generateKey('session', options);
        
        if (this.instances.has(key)) {
            const instance = this.instances.get(key);
            instance.resetErrorCounters();
            return instance;
        }

        const instance = new SessionSync(options);
        this.instances.set(key, instance);
        return instance;
    }

    /**
     * Создает оптимизированный canvas
     */
    createCanvas(width = 800, height = 600, options = {}) {
        const key = this.generateKey('canvas', { width, height, options });
        
        if (this.instances.has(key)) {
            const instance = this.instances.get(key);
            return instance;
        }

        const instance = createOptimizedCanvas(width, height);
        this.instances.set(key, instance);
        return instance;
    }

    /**
     * Создает пул объектов для переиспользования
     */
    createObjectPool(createFn, resetFn, initialSize = 10) {
        const key = this.generateKey('pool', { createFn: createFn.name, initialSize });
        
        if (this.pools.has(key)) {
            return this.pools.get(key);
        }

        const pool = new ObjectPool(createFn, resetFn, initialSize);
        this.pools.set(key, pool);
        return pool;
    }

    /**
     * Создает полный набор модулей для сессии
     */
    createSessionModules(sessionId, canvas, options = {}) {
        const physicsEngine = this.createPhysicsEngine({
            worldWidth: canvas.width,
            worldHeight: canvas.height,
            ...options.physics
        });

        const renderer = this.createRenderer(canvas, physicsEngine, options.renderer);

        const sessionSync = this.createSessionSync({
            sessionId,
            ...options.sync
        });

        return {
            physicsEngine,
            renderer,
            sessionSync,
            // Методы для управления жизненным циклом
            start: () => {
                renderer.start();
                sessionSync.startPolling();
            },
            stop: () => {
                renderer.stop();
                sessionSync.stopPolling();
            },
            destroy: () => {
                renderer.stop();
                sessionSync.stopPolling();
                // Очищаем ссылки
                this.cleanupSession(sessionId);
            }
        };
    }

    /**
     * Создает превью модули с масштабированием
     */
    createPreviewModules(canvas, viewerScreenSize, options = {}) {
        const scale = Math.min(
            canvas.width / viewerScreenSize.width,
            canvas.height / viewerScreenSize.height
        );

        const physicsEngine = this.createPhysicsEngine({
            worldWidth: canvas.width,
            worldHeight: canvas.height,
            ballRadius: (options.ballRadius || 20) * scale,
            ...options.physics
        });

        const renderer = this.createRenderer(canvas, physicsEngine, {
            ...options.renderer,
            scale
        });

        return {
            physicsEngine,
            renderer,
            scale,
            // Методы для синхронизации с вьювером
            syncFromViewer: (viewerState) => {
                physicsEngine.syncFromServer(viewerState, viewerScreenSize);
            },
            updateSize: (newViewerScreenSize) => {
                const newScale = Math.min(
                    canvas.width / newViewerScreenSize.width,
                    canvas.height / newViewerScreenSize.height
                );
                renderer.resize(canvas.width, canvas.height);
                physicsEngine.setWorldSize(canvas.width, canvas.height);
                return newScale;
            }
        };
    }

    /**
     * Создает модули для вьювера
     */
    createViewerModules(canvas, options = {}) {
        const physicsEngine = this.createPhysicsEngine({
            worldWidth: canvas.width,
            worldHeight: canvas.height,
            ...options.physics
        });

        const renderer = this.createRenderer(canvas, physicsEngine, options.renderer);

        const sessionSync = this.createSessionSync({
            ...options.sync
        });

        return {
            physicsEngine,
            renderer,
            sessionSync,
            // Методы для управления вьювером
            start: () => {
                renderer.start();
                sessionSync.startPolling();
            },
            stop: () => {
                renderer.stop();
                sessionSync.stopPolling();
            },
            resize: (width, height) => {
                renderer.resize(width, height);
            }
        };
    }

    /**
     * Генерирует уникальный ключ для экземпляра
     */
    generateKey(type, params) {
        const paramStr = JSON.stringify(params);
        return `${type}_${paramStr}`;
    }

    /**
     * Очищает экземпляры для конкретной сессии
     */
    cleanupSession(sessionId) {
        for (const [key, instance] of this.instances) {
            if (key.includes(sessionId)) {
                if (instance.stop) instance.stop();
                if (instance.destroy) instance.destroy();
                this.instances.delete(key);
            }
        }
    }

    /**
     * Очищает все экземпляры
     */
    cleanup() {
        for (const [key, instance] of this.instances) {
            if (instance.stop) instance.stop();
            if (instance.destroy) instance.destroy();
        }
        this.instances.clear();
        this.pools.clear();
    }

    /**
     * Получает статистику использования модулей
     */
    getStats() {
        return {
            totalInstances: this.instances.size,
            totalPools: this.pools.size,
            instanceTypes: this.getInstanceTypeCounts(),
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Подсчитывает количество экземпляров каждого типа
     */
    getInstanceTypeCounts() {
        const counts = {};
        for (const key of this.instances.keys()) {
            const type = key.split('_')[0];
            counts[type] = (counts[type] || 0) + 1;
        }
        return counts;
    }

    /**
     * Оценивает использование памяти
     */
    estimateMemoryUsage() {
        let total = 0;
        for (const instance of this.instances.values()) {
            if (instance.canvas) {
                total += instance.canvas.width * instance.canvas.height * 4; // RGBA
            }
        }
        return total;
    }

    /**
     * Оптимизирует использование памяти
     */
    optimizeMemory() {
        // Очищаем неиспользуемые экземпляры
        for (const [key, instance] of this.instances) {
            if (instance.canvas && !isElementVisible(instance.canvas)) {
                if (instance.stop) instance.stop();
                this.instances.delete(key);
            }
        }

        // Очищаем пулы объектов
        for (const pool of this.pools.values()) {
            pool.clear();
        }
    }
}

// Создаем глобальный экземпляр фабрики
const moduleFactory = new ModuleFactory();

// Экспортируем для использования
if (typeof window !== 'undefined') {
    window.ModuleFactory = ModuleFactory;
    window.moduleFactory = moduleFactory;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModuleFactory, moduleFactory };
}
