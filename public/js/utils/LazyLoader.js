export class LazyLoader {
  static async loadComponent(componentName) {
    switch (componentName) {
      case 'physics':
        return await import('../physics-engine.js');
      case 'renderer':
        return await import('../renderer.js');
      default:
        throw new Error(`Component "${componentName}" not found for lazy loading.`);
    }
  }
}
