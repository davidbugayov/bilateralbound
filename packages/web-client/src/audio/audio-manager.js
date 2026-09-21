'use strict'
/**
 * AudioManager - Handles audio playback for the application.
 * Uses Web Audio API for both synthesized sounds and loaded audio files.
 * Supports multiple sound types with automatic fallback to synthesis.
 */
class AudioManager {
  constructor() {
    this.enabled = false
    this.volume = 0.5
    this.audioContext = null
    this.oscillatorType = 'sine' // sine, square, sawtooth, triangle
    this.frequency = 180 // Hz - low frequency for soft wooden sound
    this.duration = 0.12 // seconds - soft knock duration
    this.soundType = 'soft' // soft (EMDR default), tick, tone, click, bounce, beep
    this.audioBuffers = new Map()
    this.loadingPromises = new Map()
    this.soundFiles = {
      tick: '/sounds/tick.wav',
      click: '/sounds/click.wav',
      bounce: '/sounds/bounce.wav',
      tone: '/sounds/tone.wav',
      beep: '/sounds/beep.wav'
    }
    this.useAudioFiles = true
    this.filesLoaded = false
  }
  /**
   * Initializes the AudioContext. Must be called after a user gesture.
   * @param {boolean} preload - Whether to preload sounds immediately (default: false for lazy loading)
   */
  init(preload = false) {
    if (!this.audioContext) {
      const AudioContext =
        globalThis.AudioContext || globalThis.webkitAudioContext
      if (AudioContext) {
        this.audioContext = new AudioContext()
      } else {
        if (typeof logger !== 'undefined') {
          logger.warn('Web Audio API is not supported in this browser.')
        }
      }
    }
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume().catch((err) => {
        if (typeof logger !== 'undefined') {
          logger.warn('Failed to resume AudioContext:', err)
        }
      })
    }
    // Lazy loading: only preload when explicitly requested or when sound is enabled
    if (preload && this.useAudioFiles && !this.filesLoaded) {
      this.preloadSounds().catch((err) => {
        if (typeof logger !== 'undefined') {
          logger.warn(
            'Failed to load audio files, falling back to synthesis:',
            err
          )
        }
        this.useAudioFiles = false
      })
    }
  }
  /**
   * Загружает звуковой файл и декодирует его в AudioBuffer
   * @param {string} url - URL звукового файла
   * @returns {Promise<AudioBuffer>}
   */
  async loadSound(url) {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized')
    }
    if (this.audioBuffers.has(url)) {
      return this.audioBuffers.get(url)
    }
    if (this.loadingPromises.has(url)) {
      return await this.loadingPromises.get(url)
    }
    const loadPromise = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return response.arrayBuffer()
      })
      .then((arrayBuffer) => this.audioContext.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.audioBuffers.set(url, audioBuffer)
        this.loadingPromises.delete(url)
        return audioBuffer
      })
      .catch((err) => {
        this.loadingPromises.delete(url)
        throw err
      })
    this.loadingPromises.set(url, loadPromise)
    return await loadPromise
  }
  /**
   * Предзагружает все звуковые файлы
   * @returns {Promise<void>}
   */
  async preloadSounds() {
    if (!this.audioContext) {
      return
    }
    logger?.log('🔊 Starting audio files preload...')
    const loadPromises = Object.values(this.soundFiles).map((url) =>
      this.loadSound(url)
        .then(() => true)
        .catch(() => null)
    )
    const results = await Promise.all(loadPromises)
    const loadedCount = results.filter((r) => r === true).length
    this.filesLoaded = loadedCount > 0
    if (loadedCount === Object.keys(this.soundFiles).length) {
      logger?.log(
        `✅ Audio files preloaded: ${loadedCount}/${Object.keys(this.soundFiles).length}`
      )
    } else if (loadedCount > 0) {
      logger?.warn(
        `⚠️ Partially loaded: ${loadedCount}/${Object.keys(this.soundFiles).length} (using synthesis for missing)`
      )
    } else {
      logger?.warn('⚠️ No audio files loaded, using synthesis fallback')
      this.useAudioFiles = false
    }
  }
  setEnabled(enabled) {
    this.enabled = !!enabled
    // Lazy load sounds when user enables sound for the first time
    if (
      enabled &&
      this.useAudioFiles &&
      !this.filesLoaded &&
      this.audioContext
    ) {
      this.preloadSounds().catch((err) => {
        if (typeof logger !== 'undefined') {
          logger.warn('Failed to load audio files:', err)
        }
        this.useAudioFiles = false
      })
    }
    this._dispatchStateEvent()
  }
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume))
  }
  setSoundType(type) {
    this.soundType = type
    switch (type) {
      case 'tone':
        this.oscillatorType = 'sine'
        this.frequency = 440
        this.duration = 0.15
        break
      case 'click':
        this.oscillatorType = 'square'
        this.frequency = 800
        this.duration = 0.03
        break
      case 'bounce':
        this.oscillatorType = 'sine'
        this.frequency = 220
        this.duration = 0.08
        break
      case 'beep':
        this.oscillatorType = 'sine'
        this.frequency = 880
        this.duration = 0.06
        break
      case 'soft':
        this.oscillatorType = 'sine'
        this.frequency = 180
        this.duration = 0.12
        break
      case 'tick':
      default:
        this.oscillatorType = 'sine'
        this.frequency = 600
        this.duration = 0.05
        break
    }
    this._dispatchStateEvent()
  }
  getFrequency() {
    return this.frequency
  }
  _dispatchStateEvent() {
    if (typeof globalThis !== 'undefined' && globalThis.dispatchEvent) {
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_audio_state', {
            detail: {
              enabled: this.enabled,
              frequency: this.frequency,
              soundType: this.soundType,
              volume: this.volume
            }
          })
        )
      } catch (_) {
        /* noop */
      }
    }
  }
  _dispatchFrequencyEvent(side) {
    if (typeof globalThis !== 'undefined' && globalThis.dispatchEvent) {
      try {
        globalThis.dispatchEvent(
          new CustomEvent('bb_audio_frequency', {
            detail: {
              frequency: this.frequency,
              soundType: this.soundType,
              volume: this.volume,
              side: side || 'both',
              enabled: this.enabled,
              timestamp: Date.now()
            }
          })
        )
      } catch (_) {
        /* noop */
      }
    }
  }
  _connectOutput(gainNode, side) {
    if (!this.audioContext) return
    const target = this.audioContext.destination
    if (
      this.audioContext.createStereoPanner &&
      (side === 'left' || side === 'right')
    ) {
      try {
        const panner = this.audioContext.createStereoPanner()
        panner.pan.setValueAtTime(
          side === 'left' ? -0.85 : 0.85,
          this.audioContext.currentTime
        )
        gainNode.connect(panner)
        panner.connect(target)
        return
      } catch (_) {
        // Fallback to direct destination connection
      }
    }
    gainNode.connect(target)
  }
  /**
   * Plays a tick sound using current or override type, with bilateral side support.
   * @param {string} [overrideType] - Optional: override the current sound type
   * @param {string} [side] - Optional: 'left' or 'right' for bilateral panning & visualization
   */
  playTick(overrideType, side) {
    if (!this.enabled || !this.audioContext) {
      return
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
      return
    }
    const soundType = overrideType || this.soundType
    if (overrideType && overrideType !== this.soundType) {
      this.setSoundType(overrideType)
    }
    this._dispatchFrequencyEvent(side)
    if (this.useAudioFiles && this.filesLoaded) {
      const url = this.soundFiles[soundType]
      if (url && this.audioBuffers.has(url)) {
        this.playBufferedSound(url, side)
        return
      }
    }
    this.playSynthesizedSound(side)
  }
  /**
   * Воспроизводит загруженный звук из буфера с билатеральным панорамированием
   * @param {string} url - URL звукового файла
   * @param {string} [side] - 'left' или 'right'
   */
  playBufferedSound(url, side) {
    try {
      const buffer = this.audioBuffers.get(url)
      if (!buffer) {
        return
      }
      const source = this.audioContext.createBufferSource()
      const gainNode = this.audioContext.createGain()
      source.buffer = buffer
      gainNode.gain.value = this.volume
      source.connect(gainNode)
      this._connectOutput(gainNode, side)
      source.start()
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error('Error playing buffered sound:', error)
      }
      this.playSynthesizedSound(side)
    }
  }
  /**
   * Воспроизводит синтезированный звук с билатеральным панорамированием
   * @param {string} [side] - 'left' или 'right'
   */
  playSynthesizedSound(side) {
    try {
      if (this.soundType === 'soft') {
        this.playSoftWoodenSound(side)
        return
      }
      const oscillator = this.audioContext.createOscillator()
      const gainNode = this.audioContext.createGain()
      oscillator.type = this.oscillatorType
      oscillator.frequency.setValueAtTime(
        this.frequency,
        this.audioContext.currentTime
      )
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(
        this.volume,
        this.audioContext.currentTime + 0.005
      )
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        this.audioContext.currentTime + this.duration
      )
      oscillator.connect(gainNode)
      this._connectOutput(gainNode, side)
      oscillator.start()
      oscillator.stop(this.audioContext.currentTime + this.duration)
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error('Error playing synthesized sound:', error)
      }
    }
  }
  /**
   * Plays a soft low-frequency thud — default EMDR bilateral stimulation sound.
   * Pure sine sweep (120→60 Hz) with smooth decay and optional side panning.
   * @param {string} [side] - 'left' или 'right'
   */
  playSoftWoodenSound(side) {
    try {
      const now = this.audioContext.currentTime
      const duration = 0.16
      const osc = this.audioContext.createOscillator()
      const gain = this.audioContext.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, now)
      osc.frequency.exponentialRampToValueAtTime(60, now + duration)
      // Short linear attack to avoid click artifact, then smooth decay
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(this.volume * 0.8, now + 0.004)
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc.connect(gain)
      this._connectOutput(gain, side)
      osc.start(now)
      osc.stop(now + duration)
    } catch (error) {
      if (typeof logger !== 'undefined') {
        logger.error('Error playing soft wooden sound:', error)
      }
    }
  }
}
if (typeof globalThis !== 'undefined') {
  globalThis.AudioManager = AudioManager
}

module.exports = AudioManager
