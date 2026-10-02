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

test('syncDirection does not override customPath modes', () => {
  for (const mode of ['zigzag', 'spiral', 'wave', 'custom']) {
    const deps = createDeps({ initialMode: mode });
    UISync.init({}, deps);

    UISync.syncDirection({ dirX: 1, dirY: 0 });

    assert.strictEqual(deps.getCurrentDirectionMode(), mode, `Mode ${mode} should not be overridden`);
  }
});

test('syncCustomPath sets mode and calls customPathUI.syncFromState', () => {
  let syncedType = null;
  let syncedConfig = null;
  globalThis.customPathUI = {
    syncFromState: (type, cfg) => {
      syncedType = type;
      syncedConfig = cfg;
    }
  };

  const deps = createDeps({ initialMode: 'horizontal' });
  UISync.init({}, deps);

  UISync.syncCustomPath({
    customPath: 'spiral',
    customPathConfig: { frequency: 5, amplitude: 75 }
  });

  assert.strictEqual(deps.getCurrentDirectionMode(), 'spiral');
  assert.strictEqual(syncedType, 'spiral');
  assert.strictEqual(syncedConfig.frequency, 5);
  assert.strictEqual(syncedConfig.amplitude, 75);

  delete globalThis.customPathUI;
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

test('syncBrainspotting calls disableBrainspottingDrag when brainspotting: false and mode is brainspotting', () => {
  let disableCalled = false;
  const deps = createDeps({
    initialMode: 'brainspotting',
    disableBrainspottingDrag: () => {
      disableCalled = true;
    },
  });
  UISync.init({}, deps);

  UISync.syncBrainspotting({ brainspotting: false });

  assert.strictEqual(
    disableCalled,
    true,
    'disableBrainspottingDrag should be called',
  );
});

test('syncBrainspotting does not call disableBrainspottingDrag when brainspotting: false but mode is horizontal', () => {
  let disableCalled = false;
  const deps = createDeps({
    initialMode: 'horizontal',
    disableBrainspottingDrag: () => {
      disableCalled = true;
    },
  });
  UISync.init({}, deps);

  UISync.syncBrainspotting({ brainspotting: false });

  assert.strictEqual(
    disableCalled,
    false,
    'disableBrainspottingDrag should NOT be called',
  );
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

test('syncOpacity updates components.ballOpacity and physics engine with normalized opacity', () => {
  let updatedOpacity = null;
  let engineOpacity = null;
  const components = {
    ballOpacity: {
      setOpacity: (val) => {
        updatedOpacity = val;
      }
    }
  };
  const deps = createDeps({
    getPreviewPhysicsEngine: () => ({
      setBallOpacity: (norm) => {
        engineOpacity = norm;
      }
    })
  });
  UISync.init(components, deps);

  // Test normalized input (0.5 -> 50%)
  UISync.syncOpacity({ opacity: 0.5 });
  assert.strictEqual(updatedOpacity, 50);
  assert.strictEqual(engineOpacity, 0.5);

  // Test percentage input (80 -> 80%)
  UISync.syncOpacity({ ballOpacity: 80 });
  assert.strictEqual(updatedOpacity, 80);
  assert.strictEqual(engineOpacity, 0.8);

  // Test clamping low (0.01 -> 5%)
  UISync.syncOpacity({ opacity: 0.01 });
  assert.strictEqual(updatedOpacity, 5);
  assert.strictEqual(engineOpacity, 0.05);

  // Test clamping high (150 -> 100%)
  UISync.syncOpacity({ opacity: 150 });
  assert.strictEqual(updatedOpacity, 100);
  assert.strictEqual(engineOpacity, 1.0);
});

// ============================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Пройдено: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
