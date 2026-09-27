'use strict';
/**
 * Unit tests for Visual Session Timer component
 * Run: node packages/web-client/test/session-timer.test.js
 */

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\n⏱️ Session Timer Unit Tests\n');

// Mock localStorage
const mockStorage = new Map();
global.localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

// Import SessionTimer class
const { SessionTimer } = require('../src/ui/session-timer');

test('initializes with default 50-minute therapy target and 0 elapsed', () => {
  const timer = new SessionTimer();
  assert.strictEqual(timer.targetMinutes, 50);
  assert.strictEqual(timer.elapsedMs, 0);
  assert.strictEqual(timer.isRunning, false);
  assert.strictEqual(timer.displayMode, 'elapsed');
  assert.strictEqual(timer.autoStart, true);
  assert.strictEqual(timer.soundAlerts, true);
});

test('formatTime formats seconds, minutes and hours accurately', () => {
  const timer = new SessionTimer();
  assert.strictEqual(timer.formatTime(0), '00:00');
  assert.strictEqual(timer.formatTime(9000), '00:09');
  assert.strictEqual(timer.formatTime(65000), '01:05');
  assert.strictEqual(timer.formatTime(599000), '09:59');
  assert.strictEqual(timer.formatTime(3000000), '50:00');
  assert.strictEqual(timer.formatTime(3600000), '1:00:00');
  assert.strictEqual(timer.formatTime(3665000), '1:01:05');
});

test('starts and pauses timer accumulating elapsed time', () => {
  const timer = new SessionTimer();
  timer.init('test_session_1');

  assert.strictEqual(timer.isRunning, false);
  timer.start();
  assert.strictEqual(timer.isRunning, true);

  // Simulate tick
  timer._accumulateTick(1500);

  assert.ok(timer.elapsedMs >= 1500, `Expected elapsed >= 1500, got ${timer.elapsedMs}`);

  timer.pause();
  assert.strictEqual(timer.isRunning, false);
  const pausedElapsed = timer.elapsedMs;

  // Additional ticks while paused do not increase elapsed
  timer._accumulateTick(500);
  assert.strictEqual(timer.elapsedMs, pausedElapsed);
});

test('toggle switches between running and paused', () => {
  const timer = new SessionTimer();
  timer.init('test_session_toggle');

  assert.strictEqual(timer.isRunning, false);
  timer.toggle();
  assert.strictEqual(timer.isRunning, true);
  timer.toggle();
  assert.strictEqual(timer.isRunning, false);
});

test('resets elapsed time and warning flags', () => {
  const timer = new SessionTimer();
  timer.init('test_session_reset');
  timer.elapsedMs = 45000;
  timer.activeBilateralMs = 20000;
  timer.fiveMinWarningFired = true;
  timer.targetReachedFired = true;

  timer.reset();

  assert.strictEqual(timer.elapsedMs, 0);
  assert.strictEqual(timer.activeBilateralMs, 0);
  assert.strictEqual(timer.isRunning, false);
  assert.strictEqual(timer.fiveMinWarningFired, false);
  assert.strictEqual(timer.targetReachedFired, false);
});

test('updates target duration presets and adds minutes', () => {
  const timer = new SessionTimer();
  timer.init('test_session_targets');

  timer.setTargetMinutes(45);
  assert.strictEqual(timer.targetMinutes, 45);

  timer.setTargetMinutes(60);
  assert.strictEqual(timer.targetMinutes, 60);

  timer.setTargetMinutes(0); // Free mode / Count up
  assert.strictEqual(timer.targetMinutes, 0);

  timer.addMinutes(5); // from 0 defaults to 30 or adds
  assert.strictEqual(timer.targetMinutes, 30);

  timer.addMinutes(5);
  assert.strictEqual(timer.targetMinutes, 35);
});

test('toggles display mode between elapsed and countdown', () => {
  const timer = new SessionTimer();
  assert.strictEqual(timer.displayMode, 'elapsed');

  timer.toggleDisplayMode();
  assert.strictEqual(timer.displayMode, 'countdown');

  timer.toggleDisplayMode();
  assert.strictEqual(timer.displayMode, 'elapsed');
});

test('persists state in localStorage and reloads accurately', () => {
  mockStorage.clear();
  const sid = 'clinical_case_42';
  const timer1 = new SessionTimer();
  timer1.init(sid);
  timer1.targetMinutes = 45;
  timer1.elapsedMs = 120000; // 2 minutes
  timer1.activeBilateralMs = 45000;
  timer1.displayMode = 'countdown';
  timer1.autoStart = false;
  timer1._saveState();

  const storedRaw = localStorage.getItem(`bb_session_timer_${sid}`);
  assert.ok(storedRaw, 'Storage key must exist');

  const timer2 = new SessionTimer();
  timer2.init(sid);

  assert.strictEqual(timer2.targetMinutes, 45);
  assert.strictEqual(timer2.elapsedMs, 120000);
  assert.strictEqual(timer2.activeBilateralMs, 45000);
  assert.strictEqual(timer2.displayMode, 'countdown');
  assert.strictEqual(timer2.autoStart, false);
});

test('triggers 5-minute warning and target reached milestones', () => {
  const timer = new SessionTimer();
  timer.init('test_session_milestones');
  timer.targetMinutes = 50; // 50m = 3000s = 3,000,000 ms

  let warningFiredCount = 0;
  let targetFiredCount = 0;

  timer._onFiveMinWarning = () => { warningFiredCount++; };
  timer._onTargetReached = () => { targetFiredCount++; };

  // Before 45 minutes: no milestone
  timer.elapsedMs = 44 * 60 * 1000;
  timer._checkMilestones();
  assert.strictEqual(warningFiredCount, 0);
  assert.strictEqual(targetFiredCount, 0);

  // At 45 minutes (5 min before 50m end): 5-min warning fires once
  timer.elapsedMs = 45 * 60 * 1000;
  timer._checkMilestones();
  assert.strictEqual(warningFiredCount, 1);
  assert.strictEqual(targetFiredCount, 0);

  // Re-check does not duplicate
  timer.elapsedMs = 46 * 60 * 1000;
  timer._checkMilestones();
  assert.strictEqual(warningFiredCount, 1);

  // At 50 minutes: target reached fires
  timer.elapsedMs = 50 * 60 * 1000;
  timer._checkMilestones();
  assert.strictEqual(targetFiredCount, 1);

  // Re-check does not duplicate
  timer.elapsedMs = 51 * 60 * 1000;
  timer._checkMilestones();
  assert.strictEqual(targetFiredCount, 1);
});

test('auto-starts when stimulation begins if autoStart is true', () => {
  const timer = new SessionTimer();
  timer.init('test_session_autostart');
  timer.autoStart = true;
  timer.elapsedMs = 0;
  timer.isRunning = false;

  timer.onStimulationStarted();
  assert.strictEqual(timer.isRunning, true);

  timer.pause();
  // If timer was already running and paused, subsequent stimulation starts do not override pause
  timer.onStimulationStarted();
  assert.strictEqual(timer.isRunning, false);
});

console.log('='.repeat(40));
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
