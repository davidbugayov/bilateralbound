#!/usr/bin/env node
'use strict'

/**
 * Generates soft, therapeutic WAV files for EMDR bilateral stimulation.
 * All sounds designed to be neutral and non-startling.
 */

const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100
const MASTER_VOLUME = 0.72

function writeWav(filename, samples) {
  const numSamples = samples.length
  const dataSize = numSamples * 2
  const buf = Buffer.alloc(44 + dataSize)

  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }

  fs.writeFileSync(filename, buf)
  const ms = ((numSamples / SAMPLE_RATE) * 1000).toFixed(0)
  console.log(`  ${path.basename(filename)} — ${ms}ms`)
}

// Phase-accurate frequency sweep: integral of f(t) = f0*e^(-k*t) + fEnd
// phase(t) = 2π * [ f0/k*(1 - e^(-k*t)) + fEnd*t ]
function sweepPhase(t, f0, fEnd, k) {
  return 2 * Math.PI * ((f0 / k) * (1 - Math.exp(-k * t)) + fEnd * t)
}

// Simple envelope: linear attack → exponential decay
function env(t, attackSec, decaySec) {
  if (t < attackSec) return t / attackSec
  return Math.exp(-(t - attackSec) / decaySec)
}

function makeSamples(durationSec, fn) {
  const n = Math.floor(SAMPLE_RATE * durationSec)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = fn(i / SAMPLE_RATE)
  return out
}

const dir = path.join(__dirname, '../packages/web-client/public/sounds')
const distDir = path.join(__dirname, '../packages/web-client/dist/sounds')

console.log('Generating therapeutic EMDR sounds...')

// ── TICK ─────────────────────────────────────────────────────────────────────
// Soft sine metronome tick at 280 Hz. Gentle, neutral.
{
  const samples = makeSamples(0.1, (t) => {
    const phase = 2 * Math.PI * 280 * t
    const e = env(t, 0.003, 0.022)
    return Math.sin(phase) * e * MASTER_VOLUME
  })
  writeWav(path.join(dir, 'tick.wav'), samples)
}

// ── CLICK ─────────────────────────────────────────────────────────────────────
// Soft tap: frequency falls from 360→180 Hz. Sounds like a quiet wooden tap.
{
  const samples = makeSamples(0.09, (t) => {
    const phase = sweepPhase(t, 180, 180, 10)
    const e = env(t, 0.002, 0.02)
    return Math.sin(phase) * e * MASTER_VOLUME
  })
  writeWav(path.join(dir, 'click.wav'), samples)
}

// ── BOUNCE ────────────────────────────────────────────────────────────────────
// Gentle low thud: 130→75 Hz sweep. Warm, non-jarring.
{
  const samples = makeSamples(0.14, (t) => {
    const phase = sweepPhase(t, 55, 75, 6)
    const e = env(t, 0.003, 0.035)
    return Math.sin(phase) * e * MASTER_VOLUME
  })
  writeWav(path.join(dir, 'bounce.wav'), samples)
}

// ── TONE ──────────────────────────────────────────────────────────────────────
// Soft bell at 432 Hz with gentle harmonics. Pleasant, musical.
{
  const f = 432
  const samples = makeSamples(0.32, (t) => {
    const e = env(t, 0.006, 0.085)
    const sig =
      Math.sin(2 * Math.PI * f * t) * 0.72 +
      Math.sin(2 * Math.PI * f * 2 * t) * 0.2 +
      Math.sin(2 * Math.PI * f * 3 * t) * 0.08
    return sig * e * MASTER_VOLUME
  })
  writeWav(path.join(dir, 'tone.wav'), samples)
}

// ── BEEP ──────────────────────────────────────────────────────────────────────
// Gentle chime at 528 Hz (calm, clear). Smooth envelope.
{
  const f = 528
  const samples = makeSamples(0.22, (t) => {
    const e = env(t, 0.008, 0.065)
    const sig =
      Math.sin(2 * Math.PI * f * t) * 0.78 +
      Math.sin(2 * Math.PI * f * 2 * t) * 0.22
    return sig * e * MASTER_VOLUME
  })
  writeWav(path.join(dir, 'beep.wav'), samples)
}

// Copy to dist if it exists
if (fs.existsSync(distDir)) {
  for (const file of ['tick.wav', 'click.wav', 'bounce.wav', 'tone.wav', 'beep.wav']) {
    fs.copyFileSync(path.join(dir, file), path.join(distDir, file))
  }
  console.log('  Copied to dist/sounds/')
}

console.log('Done.')
