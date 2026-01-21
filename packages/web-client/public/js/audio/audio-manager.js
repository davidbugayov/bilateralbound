'use strict'

// Uses global logger from common.js
/* global logger */

/**
 * AudioManager - Handles audio playback for the application.
 * Uses Web Audio API for both synthesized sounds and loaded audio files.
 * Supports multiple sound types with automatic fallback to synthesis.
 */
class AudioManager {
  // Статические/начальные значения как поля класса (уменьшают предупреждения линтера)
  enabled = false
  volume = 0.5
  audioContext = null
  oscillatorType = 'sine' // sine, square, sawtooth, triangle
  frequency = 180 // Hz - low frequency for soft wooden sound
  duration = 0.12 // seconds - soft knock duration
  soundType = 'soft' // soft (EMDR default), tick, tone, click, bounce, beep

  // Буфер для загруженных звуков
  audioBuffers = new Map()
  loadingPromises = new Map()

  // Определяем звуковые файлы для разных типов
  soundFiles = {
    tick: '/sounds/tick.wav',
    click: '/sounds/click.wav',
    bounce: '/sounds/bounce.wav',
    tone: '/sounds/tone.wav',
    beep: '/sounds/beep.wav'
  }

  // Флаг для определения режима (файлы или синтез)
  useAudioFiles = true
  filesLoaded = false

  /**
   * Initializes the AudioContext. Must be called after a user gesture.
   */
  init() {
    if (!this.audioContext) {
      const AudioContext =
        globalThis.AudioContext || globalThis.webkitAudioContext
      if (AudioContext) {
        this.audioContext = new AudioContext()
      } else {
        logger.warn('Web Audio API is not supported in this browser.')
      }
    }

    if (this.audioContext?.state === 'suspended') {
      this.audioContext
        .resume()
        .catch((err) => logger.warn('Failed to resume AudioContext:', err))
    }

    // Начинаем загрузку звуковых файлов
    if (this.useAudioFiles && !this.filesLoaded) {
      this.preloadSounds().catch((err) => {
        logger.warn(
          'Failed to load audio files, falling back to synthesis:',
          err
        )
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

    // Проверяем кэш
    if (this.audioBuffers.has(url)) {
      return this.audioBuffers.get(url)
    }

    // Проверяем, не загружается ли уже
    if (this.loadingPromises.has(url)) {
      return await this.loadingPromises.get(url)
    }

    // Загружаем файл
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
    if (!this.audioContext) return

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
    if (this.enabled) {
      this.init()
    }
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
        // Soft wooden knock - typical EMDR sound
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
  }

  /**
   * Plays a tick sound using current or override type.
   * @param {string} [overrideType] - Optional: override the current sound type
   */
  playTick(overrideType) {
    if (!this.enabled || !this.audioContext) return

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
      return
    }

    const soundType = overrideType || this.soundType

    // Обновляем параметры синтеза если тип изменился
    if (overrideType && overrideType !== this.soundType) {
      this.setSoundType(overrideType)
    }

    if (this.useAudioFiles && this.filesLoaded) {
      const url = this.soundFiles[soundType]
      if (url && this.audioBuffers.has(url)) {
        this.playBufferedSound(url)
        return
      }
    }

    this.playSynthesizedSound()
  }

  /**
   * Воспроизводит загруженный звук из буфера
   * @param {string} url - URL звукового файла
   */
  playBufferedSound(url) {
    try {
      const buffer = this.audioBuffers.get(url)
      if (!buffer) return

      const source = this.audioContext.createBufferSource()
      const gainNode = this.audioContext.createGain()

      source.buffer = buffer
      gainNode.gain.value = this.volume

      source.connect(gainNode)
      gainNode.connect(this.audioContext.destination)

      source.start()
    } catch (error) {
      logger.error('Error playing buffered sound:', error)
      this.playSynthesizedSound()
    }
  }

  /**
   * Воспроизводит синтезированный звук (оригинальный метод)
   */
  playSynthesizedSound() {
    try {
      // Use special synthesis for soft/wooden sounds
      if (this.soundType === 'soft') {
        this.playSoftWoodenSound()
        return
      }

      const oscillator = this.audioContext.createOscillator()
      const gainNode = this.audioContext.createGain()

      oscillator.type = this.oscillatorType
      oscillator.frequency.setValueAtTime(
        this.frequency,
        this.audioContext.currentTime
      )

      // Envelope for a short tick
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
      gainNode.connect(this.audioContext.destination)

      oscillator.start()
      oscillator.stop(this.audioContext.currentTime + this.duration)
    } catch (error) {
      logger.error('Error playing synthesized sound:', error)
    }
  }

  /**
   * Plays a soft wooden knock sound - typical EMDR bilateral stimulation sound
   * Creates a warmer, more natural "thud" like a ball hitting a padded wall
   */
  playSoftWoodenSound() {
    try {
      const now = this.audioContext.currentTime
      const duration = 0.15

      // Main body - low frequency thud
      const osc1 = this.audioContext.createOscillator()
      const gain1 = this.audioContext.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(120, now)
      osc1.frequency.exponentialRampToValueAtTime(60, now + duration)
      gain1.gain.setValueAtTime(this.volume * 0.8, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + duration)
      osc1.connect(gain1)
      gain1.connect(this.audioContext.destination)
      osc1.start(now)
      osc1.stop(now + duration)

      // Attack transient - higher frequency click
      const osc2 = this.audioContext.createOscillator()
      const gain2 = this.audioContext.createGain()
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(800, now)
      osc2.frequency.exponentialRampToValueAtTime(200, now + 0.02)
      gain2.gain.setValueAtTime(this.volume * 0.4, now)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
      osc2.connect(gain2)
      gain2.connect(this.audioContext.destination)
      osc2.start(now)
      osc2.stop(now + 0.03)

      // Add subtle noise for realism
      const bufferSize = this.audioContext.sampleRate * 0.05
      const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1
      }
      const noise = this.audioContext.createBufferSource()
      noise.buffer = noiseBuffer
      const noiseGain = this.audioContext.createGain()
      const noiseFilter = this.audioContext.createBiquadFilter()
      noiseFilter.type = 'lowpass'
      noiseFilter.frequency.value = 500
      noiseGain.gain.setValueAtTime(this.volume * 0.15, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
      noise.connect(noiseFilter)
      noiseFilter.connect(noiseGain)
      noiseGain.connect(this.audioContext.destination)
      noise.start(now)
    } catch (error) {
      logger.error('Error playing soft wooden sound:', error)
    }
  }
}

// Export for use in other files
if (typeof globalThis !== 'undefined') {
  globalThis.AudioManager = AudioManager
}
