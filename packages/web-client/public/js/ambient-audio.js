/* global globalThis */
/**
 * AmbientAudio - Synthesized ambient sound generator for EMDR sessions.
 * Uses Web Audio API to generate relaxing background sounds without audio files.
 * Sounds: rain, ocean waves, forest, white noise, binaural beats.
 */
(function () {
  'use strict'

  class AmbientAudio {
    constructor() {
      this.audioContext = null
      this.masterGain = null
      this.currentType = null
      this.nodes = []
      this.volume = 0.3
      this.isPlaying = false
      this._resumeTimer = null
    }

    _ensureContext() {
      if (!this.audioContext) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext
        if (!AC) return false
        this.audioContext = new AC()
        this.masterGain = this.audioContext.createGain()
        this.masterGain.gain.value = this.volume
        this.masterGain.connect(this.audioContext.destination)
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }
      return true
    }

    _stopAll() {
      this.nodes.forEach((n) => {
        try {
          if (n.stop) n.stop()
          if (n.disconnect) n.disconnect()
        } catch (_) {}
      })
      this.nodes = []
      this.isPlaying = false
    }

    // Create a noise buffer (white noise basis)
    _createNoiseBuffer(channels = 1) {
      const ctx = this.audioContext
      const bufferSize = ctx.sampleRate * 3
      const buffer = ctx.createBuffer(channels, bufferSize, ctx.sampleRate)
      for (let c = 0; c < channels; c++) {
        const data = buffer.getChannelData(c)
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1
        }
      }
      return buffer
    }

    // Rain sound: filtered white noise with light tremolo
    _startRain() {
      const ctx = this.audioContext
      const buf = this._createNoiseBuffer()

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      noise.loop = true

      // Bandpass filter for "rain" texture
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2500
      bp.Q.value = 0.8

      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 800

      const gain = ctx.createGain()
      gain.gain.value = 1.2

      noise.connect(bp)
      bp.connect(hp)
      hp.connect(gain)
      gain.connect(this.masterGain)
      noise.start()

      // Light rainfall tremolo via LFO
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      lfo.frequency.value = 6
      lfoGain.gain.value = 0.15
      lfo.connect(lfoGain)
      lfoGain.connect(gain.gain)
      lfo.start()

      this.nodes.push(noise, lfo)
    }

    // Ocean waves: very slow LFO modulated noise with low-pass
    _startOcean() {
      const ctx = this.audioContext
      const buf = this._createNoiseBuffer()

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      noise.loop = true

      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 600
      lp.Q.value = 0.5

      const gain = ctx.createGain()
      gain.gain.value = 0.9

      noise.connect(lp)
      lp.connect(gain)
      gain.connect(this.masterGain)
      noise.start()

      // Slow wave oscillation: ~0.1 Hz (one "wave" every 10 seconds)
      const waveOsc = ctx.createOscillator()
      const waveGain = ctx.createGain()
      waveOsc.frequency.value = 0.1
      waveGain.gain.value = 0.4
      waveOsc.connect(waveGain)
      waveGain.connect(gain.gain)
      waveOsc.start()

      // Medium wave overlay
      const waveOsc2 = ctx.createOscillator()
      const waveGain2 = ctx.createGain()
      waveOsc2.frequency.value = 0.05
      waveGain2.gain.value = 0.25
      waveOsc2.connect(waveGain2)
      waveGain2.connect(gain.gain)
      waveOsc2.start()

      this.nodes.push(noise, waveOsc, waveOsc2)
    }

    // Forest: layered tones simulating birds, wind
    _startForest() {
      const ctx = this.audioContext
      // Wind base
      const buf = this._createNoiseBuffer()
      const wind = ctx.createBufferSource()
      wind.buffer = buf
      wind.loop = true

      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 300
      lp.Q.value = 0.3

      const windGain = ctx.createGain()
      windGain.gain.value = 0.25

      wind.connect(lp)
      lp.connect(windGain)
      windGain.connect(this.masterGain)
      wind.start()

      // Bird chirps: random high-freq oscillator pulses
      const chirpFreqs = [1800, 2200, 1600, 2600, 3000]
      chirpFreqs.forEach((freq, i) => {
        const scheduleChirp = () => {
          const t = ctx.currentTime + Math.random() * 4 + 1
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.frequency.value = freq
          osc.type = 'sine'
          g.gain.setValueAtTime(0, t)
          g.gain.linearRampToValueAtTime(0.12, t + 0.04)
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
          osc.connect(g)
          g.connect(this.masterGain)
          osc.start(t)
          osc.stop(t + 0.3)
          osc.onended = () => {
            if (this.isPlaying && this.currentType === 'forest') scheduleChirp()
          }
        }
        setTimeout(() => scheduleChirp(), i * 800)
      })

      this.nodes.push(wind)
    }

    // White noise: pure
    _startWhiteNoise() {
      const ctx = this.audioContext
      const buf = this._createNoiseBuffer()

      const noise = ctx.createBufferSource()
      noise.buffer = buf
      noise.loop = true

      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 4000

      const gain = ctx.createGain()
      gain.gain.value = 0.7

      noise.connect(lp)
      lp.connect(gain)
      gain.connect(this.masterGain)
      noise.start()

      this.nodes.push(noise)
    }

    // Binaural beats: 10 Hz alpha-range difference between ears
    _startBinaural() {
      const ctx = this.audioContext
      const baseFreq = 200
      const beatFreq = 10 // alpha range

      const leftOsc = ctx.createOscillator()
      leftOsc.frequency.value = baseFreq
      leftOsc.type = 'sine'

      const rightOsc = ctx.createOscillator()
      rightOsc.frequency.value = baseFreq + beatFreq
      rightOsc.type = 'sine'

      const leftGain = ctx.createGain()
      leftGain.gain.value = 0.4
      const rightGain = ctx.createGain()
      rightGain.gain.value = 0.4

      // Stereo pan
      if (ctx.createStereoPanner) {
        const leftPan = ctx.createStereoPanner()
        leftPan.pan.value = -1
        const rightPan = ctx.createStereoPanner()
        rightPan.pan.value = 1

        leftOsc.connect(leftGain)
        leftGain.connect(leftPan)
        leftPan.connect(this.masterGain)

        rightOsc.connect(rightGain)
        rightGain.connect(rightPan)
        rightPan.connect(this.masterGain)
      } else {
        leftOsc.connect(leftGain)
        leftGain.connect(this.masterGain)
        rightOsc.connect(rightGain)
        rightGain.connect(this.masterGain)
      }

      leftOsc.start()
      rightOsc.start()

      this.nodes.push(leftOsc, rightOsc)
    }

    play(type) {
      if (!this._ensureContext()) return

      this._stopAll()

      if (!type || type === 'none') {
        this.currentType = null
        return
      }

      this.currentType = type
      this.isPlaying = true

      switch (type) {
        case 'rain':
          this._startRain()
          break
        case 'ocean':
          this._startOcean()
          break
        case 'forest':
          this._startForest()
          break
        case 'whitenoise':
          this._startWhiteNoise()
          break
        case 'binaural':
          this._startBinaural()
          break
        default:
          this.isPlaying = false
          this.currentType = null
      }
    }

    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol))
      if (this.masterGain) {
        this.masterGain.gain.value = this.volume
      }
    }

    stop() {
      this._stopAll()
      this.currentType = null
    }
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.AmbientAudio = AmbientAudio
    globalThis.ambientAudio = new AmbientAudio()
  }
})()
