export class LazyLoader {
  static async load (name) {
    const registry = {
      physics: () => import('../physics-engine.js'),
      renderer: () => import('../renderer.js'),
      speedControl: () => Promise.resolve(),
    }
    if (!registry[name]) throw new Error(`LazyLoader: unknown module ${name}`)
    return registry[name]()
  }
}

if (typeof window !== 'undefined') {
  window.LazyLoader = LazyLoader
}



