/**
 * LazyLoader - утилита для динамической загрузки компонентов
 * Позволяет загружать модули по требованию для оптимизации производительности
 */
export class LazyLoader {
  /**
   * Загружает компонент по имени
   * @param {string} componentName - имя компонента для загрузки
   * @returns {Promise} промис с загруженным компонентом
   * @throws {Error} если компонент не найден
   */
  static async loadComponent(componentName) {
    switch (componentName) {
      case 'physics':
        return await import('../physics-engine.js')
      case 'renderer':
        return await import('../renderer.js')
      default:
        throw new Error(`Component "${componentName}" not found for lazy loading.`)
    }
  }
}
