'use strict'

/**
 * AudioVisualizer - A responsive, CSS-based bilateral audio visualizer bar.
 * Visually reflects bilateral stimulation audio frequencies, left/right channels,
 * and active state in real-time.
 */
class AudioVisualizer {
  /**
   * @param {HTMLElement|string} target - Container element or selector
   * @param {Object} [options]
   * @param {number} [options.initialFrequency=180]
   * @param {string} [options.initialSoundType='soft']
   * @param {boolean} [options.listenGlobalEvents=true]
   * @param {string} [options.id='audioVisualizerBar']
   */
  constructor(target, options = {}) {
    this.target =
      typeof target === 'string' ? document.querySelector(target) : target
    this.options = {
      initialFrequency: 180,
      initialSoundType: 'soft',
      listenGlobalEvents: true,
      id: 'audioVisualizerBar',
      ...options
    }

    this.frequency = this.options.initialFrequency
    this.soundType = this.options.initialSoundType
    this.isActive = false
    this._pulseTimers = { left: null, right: null }
    this._boundOnFreqEvent = this._onFrequencyEvent.bind(this)
    this._boundOnStateEvent = this._onStateEvent.bind(this)
    this._boundOnBounceEvent = this._onBounceEvent.bind(this)

    this.init()
  }

  /**
   * Initialize DOM elements and bindings
   */
  init() {
    if (!this.target) return

    // If container is already a visualizer bar, reuse it; otherwise render inside target
    let el = this.target.classList?.contains('audio-visualizer-bar')
      ? this.target
      : this.target.querySelector('.audio-visualizer-bar')

    if (!el) {
      el = document.createElement('div')
      el.id = this.options.id
      el.className = 'audio-visualizer-bar'
      el.setAttribute('role', 'status')
      el.setAttribute('aria-label', 'Bilateral Audio Frequency Visualizer')
      this.target.appendChild(el)
    }

    this.el = el
    this.render()

    if (this.options.listenGlobalEvents) {
      globalThis.addEventListener('bb_audio_frequency', this._boundOnFreqEvent)
      globalThis.addEventListener('bb_audio_state', this._boundOnStateEvent)
      globalThis.addEventListener('bb_bounce', this._boundOnBounceEvent)
    }

    this.setFrequency(this.frequency, this.soundType)
  }

  /**
   * Render internal structure
   */
  render() {
    this.el.innerHTML = `
      <div class="visualizer-channel visualizer-channel--left" data-channel="left" title="Left bilateral audio channel">
        <span class="channel-lbl">L</span>
        <div class="channel-bars">
          <span class="vbar vbar--1" style="--bar-h: 4px;"></span>
          <span class="vbar vbar--2" style="--bar-h: 5px;"></span>
          <span class="vbar vbar--3" style="--bar-h: 4px;"></span>
          <span class="vbar vbar--4" style="--bar-h: 3px;"></span>
          <span class="vbar vbar--5" style="--bar-h: 2px;"></span>
        </div>
      </div>

      <div class="visualizer-center-meter">
        <div class="visualizer-wave">
          <span class="wave-pulse"></span>
        </div>
        <div class="visualizer-freq" title="Active Bilateral Audio Frequency">
          <span class="freq-val">${this.frequency}</span><span class="freq-unit">Hz</span>
        </div>
      </div>

      <div class="visualizer-channel visualizer-channel--right" data-channel="right" title="Right bilateral audio channel">
        <div class="channel-bars">
          <span class="vbar vbar--5" style="--bar-h: 2px;"></span>
          <span class="vbar vbar--4" style="--bar-h: 3px;"></span>
          <span class="vbar vbar--3" style="--bar-h: 4px;"></span>
          <span class="vbar vbar--2" style="--bar-h: 5px;"></span>
          <span class="vbar vbar--1" style="--bar-h: 4px;"></span>
        </div>
        <span class="channel-lbl">R</span>
      </div>
    `

    this.leftChannelEl = this.el.querySelector('.visualizer-channel--left')
    this.rightChannelEl = this.el.querySelector('.visualizer-channel--right')
    this.freqValEl = this.el.querySelector('.freq-val')
    this.wavePulseEl = this.el.querySelector('.wave-pulse')
  }

  /**
   * Calculate CSS hue and frequency band heights based on frequency in Hz
   * @param {number} freq - Frequency in Hz
   * @returns {{ hue: number, heights: number[] }}
   */
  _getFrequencyProfile(freq) {
    const f = Number(freq) || 180

    // Hue progression:
    // 120-180 Hz: 165° (soothing emerald/teal)
    // 220 Hz: 185° (cyan)
    // 440 Hz: 215° (vibrant blue)
    // 600 Hz: 255° (indigo)
    // 800 Hz: 285° (purple)
    // 880 Hz+: 315° (fuchsia/magenta)
    const clampedRatio = Math.max(0, Math.min(1, (f - 120) / (880 - 120)))
    const hue = Math.round(165 + clampedRatio * 150)

    // 5 frequency bands: [Sub/Bass, Low-Mid, Mid, Upper-Mid, High]
    let heights = [4, 5, 4, 3, 2]

    if (f <= 200) {
      // Soft thud / bass sweep (120-180 Hz)
      heights = [18, 15, 9, 5, 3]
    } else if (f <= 300) {
      // Bounce (220 Hz)
      heights = [15, 18, 12, 7, 4]
    } else if (f <= 500) {
      // Tone (440 Hz)
      heights = [8, 16, 18, 13, 7]
    } else if (f <= 700) {
      // Tick (600 Hz)
      heights = [5, 11, 17, 18, 12]
    } else if (f <= 840) {
      // Click (800 Hz)
      heights = [4, 7, 14, 18, 16]
    } else {
      // Beep (880 Hz+)
      heights = [3, 6, 12, 16, 18]
    }

    return { hue, heights }
  }

  /**
   * Sets active audio state (whether audio is playing/ready)
   * @param {boolean} active
   */
  setActive(active) {
    this.isActive = !!active
    if (this.el) {
      this.el.classList.toggle('is-active', this.isActive)
      this.el.classList.toggle('is-inactive', !this.isActive)
    }
  }

  /**
   * Sets the bilateral audio frequency and updates display
   * @param {number} freqHz
   * @param {string} [soundType]
   */
  setFrequency(freqHz, soundType) {
    this.frequency = Number(freqHz) || 180
    if (soundType) this.soundType = soundType

    if (this.freqValEl) {
      this.freqValEl.textContent = String(this.frequency)
    }

    const { hue } = this._getFrequencyProfile(this.frequency)
    if (this.el) {
      this.el.style.setProperty('--freq-hue', String(hue))
      this.el.style.setProperty('--audio-freq', String(this.frequency))
    }
  }

  /**
   * Triggers a pulse animation on a bilateral channel responding to audio frequency
   * @param {'left'|'right'|'both'|string} side
   * @param {number} [freqOverride]
   */
  triggerPulse(side, freqOverride) {
    const freq = freqOverride || this.frequency
    const { heights } = this._getFrequencyProfile(freq)

    const targetSide =
      side === 'left' || side === 'right' ? side : 'both'

    const pulseChannel = (channelEl, channelKey) => {
      if (!channelEl) return

      // Clear any pending decay timer for this channel
      if (this._pulseTimers[channelKey]) {
        clearTimeout(this._pulseTimers[channelKey])
      }

      channelEl.classList.add('channel-active-pulse')

      // Set active heights on bars
      const bars = channelEl.querySelectorAll('.vbar')
      bars.forEach((bar, idx) => {
        const h = heights[idx] || 4
        bar.style.setProperty('--bar-h', `${h}px`)
      })

      // Animate wave pulse
      if (this.wavePulseEl) {
        this.wavePulseEl.classList.remove('wave-pulse--left', 'wave-pulse--right')
        // Force reflow
        void this.wavePulseEl.offsetWidth
        this.wavePulseEl.classList.add(
          channelKey === 'left' ? 'wave-pulse--left' : 'wave-pulse--right'
        )
      }

      // Smooth decay back to idle resting state after bounce
      this._pulseTimers[channelKey] = setTimeout(() => {
        channelEl.classList.remove('channel-active-pulse')
        bars.forEach((bar, idx) => {
          const restingH = [4, 5, 4, 3, 2][idx] || 3
          bar.style.setProperty('--bar-h', `${restingH}px`)
        })
      }, 180)
    }

    if (targetSide === 'left' || targetSide === 'both') {
      pulseChannel(this.leftChannelEl, 'left')
    }
    if (targetSide === 'right' || targetSide === 'both') {
      pulseChannel(this.rightChannelEl, 'right')
    }
  }

  _onFrequencyEvent(e) {
    const detail = e.detail
    if (!detail) return

    if (detail.frequency) {
      this.setFrequency(detail.frequency, detail.soundType)
    }

    if (typeof detail.enabled === 'boolean') {
      this.setActive(detail.enabled)
    } else {
      this.setActive(true)
    }

    if (detail.side) {
      this.triggerPulse(detail.side, detail.frequency)
    }
  }

  _onStateEvent(e) {
    const detail = e.detail
    if (!detail) return

    if (typeof detail.enabled === 'boolean') {
      this.setActive(detail.enabled)
    }

    if (detail.frequency) {
      this.setFrequency(detail.frequency, detail.soundType)
    }
  }

  _onBounceEvent(e) {
    if (!this.isActive) return
    const side = e?.detail?.side || 'both'
    this.triggerPulse(side, this.frequency)
  }

  /**
   * Cleans up event listeners and DOM
   */
  destroy() {
    if (this._pulseTimers.left) clearTimeout(this._pulseTimers.left)
    if (this._pulseTimers.right) clearTimeout(this._pulseTimers.right)

    if (this.options.listenGlobalEvents) {
      globalThis.removeEventListener(
        'bb_audio_frequency',
        this._boundOnFreqEvent
      )
      globalThis.removeEventListener('bb_audio_state', this._boundOnStateEvent)
      globalThis.removeEventListener('bb_bounce', this._boundOnBounceEvent)
    }

    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el)
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioVisualizer }
}
if (typeof globalThis !== 'undefined') {
  globalThis.AudioVisualizer = AudioVisualizer
}
