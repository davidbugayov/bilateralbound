'use strict';
/**
 * Unit tests for ui-sync module — brainspotting direction preservation
 * Run: node packages/web-client/test/ui-sync.test.js
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

// ============================================
console.log('\n🔗 UI-Sync Brainspotting Tests\n');
// ============================================

const UISync = require('../src/application/controller/ui-sync');

function createDeps(overrides = {}) {
  let _mode = overrides.initialMode || 'brainspotting';
  let _dirState = { dx: 0, dy: 0 };
  return {
    getCurrentDirectionMode: () => _mode,
    setCurrentDirectionMode: (m) => {
      _mode = m;
    },
    setDirectionState: (dx, dy) => {
      _dirState = { dx, dy };
    },
    getDirectionState: () => _dirState,
    updateDirectionButtons: () => {},
    updateDirectionDisplay: () => {},
    updatePreviewSize: () => {},
    updateViewerStatusUI: () => {},
    updatePlayPauseButton: () => {},
    syncFsPlayPauseButton: () => {},
    setIsPlaying: () => {},
    getIgnorePausedUntilTs: () => 0,
    getIgnoreDirectionUntilTs: () => 0,
    getLastServerState: () => null,
    getPreviewPhysicsEngine: () => null,
    ...overrides,
  };
}

test('syncDirection does not override brainspotting mode with horizontal dirX/dirY', () => {
  const deps = createDeps({ initialMode: 'brainspotting' });
  UISync.init({}, deps);

  UISync.syncDirection({ dirX: 1, dirY: 0 });

  assert.strictEqual(
    deps.getCurrentDirectionMode(),
    'brainspotting',
    'Mode should remain brainspotting, not switch to horizontal',
  );
});

test('syncDirection does not override brainspotting mode with vertical dirX/dirY', () => {
  const deps = createDeps({ initialMode: 'brainspotting' });
  UISync.init({}, deps);

  UISync.syncDirection({ dirX: 0, dirY: 1 });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'brainspotting');
});

test('syncDirection does override horizontal mode (normal behavior preserved)', () => {
  const deps = createDeps({ initialMode: 'horizontal' });
  UISync.init({}, deps);

  UISync.syncDirection({ dirX: 0, dirY: 1 });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'vertical');
});

test('syncDirection does not override infinity mode', () => {
  const deps = createDeps({ initialMode: 'infinity' });
  UISync.init({}, deps);

  UISync.syncDirection({ dirX: 1, dirY: 0 });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'infinity');
});

test('syncBrainspotting sets mode to brainspotting when server sends brainspotting: true', () => {
  const deps = createDeps({ initialMode: 'horizontal' });
  UISync.init({}, deps);

  UISync.syncBrainspotting({ brainspotting: true });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'brainspotting');
});

test('syncBrainspotting does not change mode when server sends brainspotting: false', () => {
  const deps = createDeps({ initialMode: 'horizontal' });
  UISync.init({}, deps);

  UISync.syncBrainspotting({ brainspotting: false });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'horizontal');
});

test('syncDirection respects ignoreDirection timestamp (brainspotting stays)', () => {
  const deps = createDeps({
    initialMode: 'brainspotting',
    getIgnoreDirectionUntilTs: () => performance.now() + 5000,
  });
  UISync.init({}, deps);

  UISync.syncDirection({ dirX: 1, dirY: 0 });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'brainspotting');
});

test('syncAll with dirX/dirY does not override brainspotting mode', () => {
  globalThis.__current = {
    viewerConnected: false,
    viewerScreenSize: { width: 0, height: 0 },
  };
  const deps = createDeps({ initialMode: 'brainspotting' });
  UISync.init({}, deps);

  // Simulate a state_update delta from server with stale dirX/dirY
  UISync.syncAll({
    dirX: 1,
    dirY: 0,
    speed: 30,
    paused: false,
    viewerConnected: true,
    viewerScreenSize: { width: 800, height: 600 },
  });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'brainspotting');
  delete globalThis.__current;
});

// ============================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Пройдено: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
