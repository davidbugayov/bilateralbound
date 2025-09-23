// SessionController — отвечает за управление сессией: создание, сброс, пауза/резюм
export class SessionController {
  constructor (deps = {}) {
    this.wsClient = deps.wsClient || null
    this.getSpeed = deps.getSpeed || (() => 30)
    this.bbCounters = deps.bbCounters || null
  }

  async start (direction) {
    if (!this.wsClient) return
    const payload = {
      paused: false,
      dirX: direction?.dx ?? 1,
      dirY: direction?.dy ?? 0,
      speed: this.getSpeed()
    }
    await this.wsClient.send('controller_update', payload)
    if (this.bbCounters && typeof this.bbCounters.start === 'function') this.bbCounters.start()
  }

  async stop () {
    if (!this.wsClient) return
    await this.wsClient.send('controller_update', { paused: true })
    if (this.bbCounters && typeof this.bbCounters.stop === 'function') this.bbCounters.stop(true)
  }

  async resetSession () {
    if (!this.wsClient) return
    await this.wsClient.send('controller_update', { reset: true })
  }
}


