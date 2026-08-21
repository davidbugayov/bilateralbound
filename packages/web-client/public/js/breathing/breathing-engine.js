'use strict';

/**
 * BreathingEngine — Coherent Breathing (Когерентное дыхание)
 * Протокол: вдох 5с / выдох 5с (6 циклов/мин)
 * Оптимальная частота для стимуляции блуждающего нерва (вагуса)
 * и достижения HRV когерентности.
 *
 * Vibration API:
 *   - Вдох: длинная вибрация (2000ms)
 *   - Выдох: короткая вибрация (500ms)
 *   - iOS fallback: только аудио
 */

class BreathingEngine {
  constructor(options = {}) {
    this.inhaleSec = options.inhaleSec || 5;
    this.exhaleSec = options.exhaleSec || 5;
    this.holdAfterInhale = options.holdAfterInhale || 0;
    this.holdAfterExhale = options.holdAfterExhale || 0;
    this.totalCycleSec =
      this.inhaleSec +
      this.holdAfterInhale +
      this.exhaleSec +
      this.holdAfterExhale;

    this.phase = 'idle';
    this.running = false;
    this.elapsed = 0;
    this.cycleCount = 0;
    this.targetCycles = 0;
    this.startTimestamp = 0;
    this.breathProgress = 0;

    this.onPhaseChange = null;
    this.onCycleComplete = null;
    this.onComplete = null;

    // Audio
    this.audioEnabled = false;
    this.audioContext = null;
    this._leftGain = null;
    this._rightGain = null;
    this._leftOsc = null;
    this._rightOsc = null;
    this.toneFreqL = 180;
    this.toneFreqR = 220;
    this.toneVolume = 0.3;
    this.bpm = options.bpm || 30;
    this._tickInterval = null;
    this._side = false;
    this.muted = false;
  }

  start(minutes = 5) {
    if (this.running) return;
    this.running = true;
    this.phase = 'inhale';
    this.elapsed = 0;
    this.cycleCount = 0;
    this.breathProgress = 0;
    this.startTimestamp = performance.now();
    this.targetCycles =
      minutes > 0 ? Math.round((minutes * 60) / this.totalCycleSec) : 0;
    this._initAudio();
    this._startTickTones();
    if (this.onPhaseChange) this.onPhaseChange('inhale');
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.phase = 'idle';
    this.breathProgress = 0;
    this.elapsed = 0;
    this._stopTickTones();
    this._stopAudio();
    if (this.onPhaseChange) this.onPhaseChange('idle');
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(0);
    }
  }

  update(deltaMs) {
    if (!this.running) return;
    this.elapsed += deltaMs;
    const totalMs = this.totalCycleSec * 1000;

    if (this.elapsed >= totalMs) {
      this.elapsed = this.elapsed % totalMs;
      this.cycleCount++;
      if (this.onCycleComplete) this.onCycleComplete(this.cycleCount);
      if (this.targetCycles > 0 && this.cycleCount >= this.targetCycles) {
        this.stop();
        if (this.onComplete) this.onComplete();
        return;
      }
    }
    this._updatePhase();
  }

  _updatePhase() {
    const es = this.elapsed / 1000;
    const iSec = this.inhaleSec;
    const hiSec = this.holdAfterInhale;
    const eSec = this.exhaleSec;

    let newPhase, progress;

    if (es < iSec) {
      newPhase = 'inhale';
      progress = es / iSec;
      this._doVibration(2000);
    } else if (es < iSec + hiSec) {
      newPhase = 'hold_in';
      progress = 1;
    } else if (es < iSec + hiSec + eSec) {
      newPhase = 'exhale';
      progress = 1 - (es - iSec - hiSec) / eSec;
      this._doVibration(500);
    } else {
      newPhase = 'hold_out';
      progress = 0;
    }

    if (newPhase !== this.phase) {
      this.phase = newPhase;
      if (this.onPhaseChange) this.onPhaseChange(newPhase);
    }

    this.breathProgress += (progress - this.breathProgress) * 0.3;
  }

  getCircleRadius() {
    const t = Math.max(0, Math.min(1, this.breathProgress));
    return t * t * (3 - 2 * t);
  }

  getPhaseLabel(lang) {
    const L = lang === 'ru' ? 'ru' : 'en';
    const labels = {
      idle: { ru: 'Готов', en: 'Ready' },
      inhale: { ru: 'Вдох', en: 'Inhale' },
      hold_in: { ru: 'Задержка', en: 'Hold' },
      exhale: { ru: 'Выдох', en: 'Exhale' },
      hold_out: { ru: 'Задержка', en: 'Hold' },
    };
    return labels[this.phase]?.[L] || labels.idle[L];
  }

  _doVibration(durationMs) {
    if (this.muted) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(durationMs);
    }
  }

  _initAudio() {
    if (this.audioContext) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try {
      this.audioContext = new AC();
      this._leftGain = this.audioContext.createGain();
      this._leftGain.gain.value = 0;
      this._leftOsc = this.audioContext.createOscillator();
      this._leftOsc.type = 'sine';
      this._leftOsc.frequency.value = this.toneFreqL;
      this._leftOsc.connect(this._leftGain);

      this._rightGain = this.audioContext.createGain();
      this._rightGain.gain.value = 0;
      this._rightOsc = this.audioContext.createOscillator();
      this._rightOsc.type = 'sine';
      this._rightOsc.frequency.value = this.toneFreqR;
      this._rightOsc.connect(this._rightGain);

      const merger = this.audioContext.createChannelMerger(2);
      this._leftGain.connect(merger, 0, 0);
      this._rightGain.connect(merger, 0, 1);
      merger.connect(this.audioContext.destination);

      this._leftOsc.start();
      this._rightOsc.start();
      this.audioEnabled = true;
    } catch (e) {
      console.warn('BreathingEngine: Audio init failed', e);
    }
  }

  _startTickTones() {
    if (this._tickInterval) return;
    const half = 60000 / this.bpm / 2;
    this._side = false;
    this._tickInterval = setInterval(() => {
      this._side = !this._side;
      this._playBilateralTick(this._side);
    }, half);
  }

  _stopTickTones() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  _playBilateralTick(isLeft) {
    if (this.muted || !this.audioContext || !this.audioEnabled) return;
    try {
      const gain = isLeft ? this._leftGain : this._rightGain;
      const now = this.audioContext.currentTime;
      gain.gain.setValueAtTime(this.toneVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } catch (e) {
      /* ignore */
    }
  }

  _stopAudio() {
    if (this._leftOsc) {
      try {
        this._leftOsc.stop();
      } catch (e) {
        /* ignore */
      }
      this._leftOsc = null;
    }
    if (this._rightOsc) {
      try {
        this._rightOsc.stop();
      } catch (e) {
        /* ignore */
      }
      this._rightOsc = null;
    }
    this._leftGain = null;
    this._rightGain = null;
    this.audioContext = null;
    this.audioEnabled = false;
  }

  setMuted(muted) {
    this.muted = !!muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(0);
    }
    return this.muted;
  }

  getStats() {
    const es = this.running
      ? (performance.now() - this.startTimestamp) / 1000
      : 0;
    return {
      running: this.running,
      phase: this.phase,
      cycleCount: this.cycleCount,
      elapsedSec: Math.round(es),
      targetCycles: this.targetCycles,
    };
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.BreathingEngine = BreathingEngine;
}
