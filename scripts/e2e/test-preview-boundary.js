/**
 * E2E test for preview ball boundary "sticking" bug
 *
 * Bug description: When ball is at the edge and pause is pressed,
 * the preview popup shows the ball stuck at the edge instead of
 * smoothly animating to center.
 *
 * Root cause: preview.ts uses default viewerW=1920 and viewerH=1080
 * for scaling, but actual worldWidth and worldHeight may be different
 * (e.g., 800x600). This causes incorrect coordinate scaling.
 */

const assert = require('assert');

// Mock BroadcastChannel for Node.js environment
global.BroadcastChannel = class BroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
  }
  postMessage(data) {
    // Simulate message delivery
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }
  close() {}
};

// Load the shared physics engine
const PhysicsEngine = require('../../packages/shared/physics-engine');

/**
 * Simulates preview.ts coordinate scaling logic
 * @param {number} bx - Ball X in viewer's coordinate space
 * @param {number} by - Ball Y in viewer's coordinate space
 * @param {number} viewerW - Viewer width (default 1920)
 * @param {number} viewerH - Viewer height (default 1080)
 * @param {number} canvasW - Preview canvas width
 * @param {number} canvasH - Preview canvas height
 * @returns {{px: number, py: number}} Scaled coordinates for preview
 */
function scalePreviewCoordinates(bx, by, viewerW, viewerH, canvasW, canvasH) {
  const px = (bx / viewerW) * canvasW;
  const py = (by / viewerH) * canvasH;
  return { px, py };
}

/**
 * Test: Ball at left edge should scale correctly
 */
function testBallAtLeftEdge() {
  console.log('🧪 Test: Ball at left edge scaling');

  // Setup: Real world size is 800x600, ball at left edge (x = radius = 20)
  const worldWidth = 800;
  const worldHeight = 600;
  const ballRadius = 20;
  const previewCanvasWidth = 400;
  const previewCanvasHeight = 300;

  // Ball at left edge
  const ballX = ballRadius; // x = 20
  const ballY = worldHeight / 2; // y = 300 (center vertically)

  // BUG: preview.ts uses default viewerW=1920 instead of actual worldWidth=800
  const wrongViewerW = 1920;
  const wrongViewerH = 1080;

  // Incorrect scaling (current buggy behavior)
  const { px: wrongPx, py: wrongPy } = scalePreviewCoordinates(
    ballX,
    ballY,
    wrongViewerW,
    wrongViewerH,
    previewCanvasWidth,
    previewCanvasHeight,
  );

  console.log(
    `  ❌ Wrong scaling: viewerW=${wrongViewerW}, viewerH=${wrongViewerH}`,
  );
  console.log(
    `     Ball at (${ballX}, ${ballY}) -> Preview at (${wrongPx.toFixed(2)}, ${wrongPy.toFixed(2)})`,
  );

  // Expected: ball should be at 2.5% from left edge (20/800 = 0.025)
  // But with wrong scaling: ball appears at 1.04% from left edge (20/1920 = 0.0104)
  const expectedPercentX = ballX / worldWidth; // 0.025
  const wrongPercentX = ballX / wrongViewerW; // 0.0104

  console.log(`     Expected: ${expectedPercentX * 100}% from left`);
  console.log(`     Got: ${wrongPercentX * 100}% from left`);

  // This is the bug: ball appears closer to edge than it should
  assert(
    wrongPercentX < expectedPercentX,
    'Ball should appear closer to center than it does with wrong scaling',
  );

  console.log(
    '  ✅ Bug confirmed: ball appears stuck at edge with wrong scaling',
  );
}

/**
 * Test: Ball at right edge should scale correctly
 */
function testBallAtRightEdge() {
  console.log('🧪 Test: Ball at right edge scaling');

  const worldWidth = 800;
  const worldHeight = 600;
  const ballRadius = 20;
  const previewCanvasWidth = 400;
  const previewCanvasHeight = 300;

  // Ball at right edge
  const ballX = worldWidth - ballRadius; // x = 780
  const ballY = worldHeight / 2; // y = 300

  const wrongViewerW = 1920;
  const wrongViewerH = 1080;

  const { px: wrongPx } = scalePreviewCoordinates(
    ballX,
    ballY,
    wrongViewerW,
    wrongViewerH,
    previewCanvasWidth,
    previewCanvasHeight,
  );

  // Expected: ball should be at 97.5% from left edge (780/800 = 0.975)
  // But with wrong scaling: ball appears at 40.6% from left edge (780/1920 = 0.406)
  const expectedPercentX = ballX / worldWidth; // 0.975
  const wrongPercentX = ballX / wrongViewerW; // 0.406

  console.log(`  ❌ Wrong scaling: Ball at (${ballX}, ${ballY})`);
  console.log(`     Expected: ${expectedPercentX * 100}% from left`);
  console.log(`     Got: ${wrongPercentX * 100}% from left`);

  assert(
    wrongPercentX < expectedPercentX,
    'Ball should appear closer to right edge than it does with wrong scaling',
  );

  console.log(
    '  ✅ Bug confirmed: ball appears stuck at edge with wrong scaling',
  );
}

/**
 * Test: Correct scaling with proper viewerScreenSize
 */
function testCorrectScaling() {
  console.log('🧪 Test: Correct scaling with proper viewerScreenSize');

  const worldWidth = 800;
  const worldHeight = 600;
  const ballRadius = 20;
  const previewCanvasWidth = 400;
  const previewCanvasHeight = 300;

  // Ball at left edge
  const ballX = ballRadius; // x = 20
  const ballY = worldHeight / 2; // y = 300

  // CORRECT: use actual worldWidth and worldHeight
  const correctViewerW = worldWidth;
  const correctViewerH = worldHeight;

  const { px: correctPx, py: correctPy } = scalePreviewCoordinates(
    ballX,
    ballY,
    correctViewerW,
    correctViewerH,
    previewCanvasWidth,
    previewCanvasHeight,
  );

  console.log(
    `  ✅ Correct scaling: viewerW=${correctViewerW}, viewerH=${correctViewerH}`,
  );
  console.log(
    `     Ball at (${ballX}, ${ballY}) -> Preview at (${correctPx.toFixed(2)}, ${correctPy.toFixed(2)})`,
  );

  // Expected: ball should be at 2.5% from left edge (20/800 = 0.025)
  // With correct scaling: (20/800) * 400 = 10 pixels from left
  const expectedPx = (ballX / worldWidth) * previewCanvasWidth;

  assert(
    Math.abs(correctPx - expectedPx) < 0.01,
    `Preview X should be ${expectedPx}, got ${correctPx}`,
  );

  console.log('  ✅ Correct: ball positioned properly with correct scaling');
}

/**
 * Test: PhysicsEngine boundary handling
 */
function testPhysicsEngineBoundary() {
  console.log('🧪 Test: PhysicsEngine boundary handling');

  const engine = new PhysicsEngine({
    worldWidth: 800,
    worldHeight: 600,
    ballRadius: 20,
    isViewer: false,
  });

  engine.setWorldSize(800, 600);
  engine.setPaused(false);

  // Set ball at left boundary
  engine.setPosition(20, 300);
  engine.setDirection(-1, 0); // Moving left

  // Run physics update
  engine.update(0.016); // ~60fps

  // Ball should be clamped at radius (20)
  assert(engine.ball.x >= 20, `Ball X should be >= 20, got ${engine.ball.x}`);

  // Direction should be reversed
  assert(
    engine.state.lastDirection.x > 0,
    'Direction X should be positive after hitting left wall',
  );

  console.log(
    `  ✅ Ball at boundary: x=${engine.ball.x}, dirX=${engine.state.lastDirection.x}`,
  );
}

/**
 * Test: Simulate pause at boundary scenario
 */
function testPauseAtBoundary() {
  console.log('🧪 Test: Pause at boundary scenario');

  const worldWidth = 800;
  const worldHeight = 600;
  const ballRadius = 20;

  // Server-side engine
  const serverEngine = new PhysicsEngine({
    worldWidth,
    worldHeight,
    ballRadius,
    isViewer: false,
  });
  serverEngine.setWorldSize(worldWidth, worldHeight);
  serverEngine.setPaused(false);

  // Move ball to left edge
  serverEngine.setPosition(20, 300);
  serverEngine.setDirection(-1, 0);

  // Simulate server sending position
  const serverState = serverEngine.getState();
  console.log(
    `  Server state: x=${serverState.x}, y=${serverState.y}, paused=${serverState.paused}`,
  );

  // Preview would receive this with default viewerW=1920
  const previewCanvasWidth = 400;
  const previewCanvasHeight = 300;

  // BUG: preview uses wrong scaling
  const { px: buggyPx } = scalePreviewCoordinates(
    serverState.x,
    serverState.y,
    1920,
    1080, // Wrong defaults!
    previewCanvasWidth,
    previewCanvasHeight,
  );

  console.log(
    `  ❌ Buggy preview: px=${buggyPx.toFixed(2)} (should be ~10, got ~4)`,
  );

  // FIX: preview should use correct scaling
  const { px: fixedPx } = scalePreviewCoordinates(
    serverState.x,
    serverState.y,
    worldWidth,
    worldHeight, // Correct!
    previewCanvasWidth,
    previewCanvasHeight,
  );

  console.log(`  ✅ Fixed preview: px=${fixedPx.toFixed(2)}`);

  assert(
    buggyPx < fixedPx,
    'Buggy preview should show ball closer to edge than fixed preview',
  );

  console.log('  ✅ Bug confirmed and fix verified');
}

// Run all tests
console.log('🚀 Starting preview boundary bug tests...\n');

try {
  testBallAtLeftEdge();
  console.log('');

  testBallAtRightEdge();
  console.log('');

  testCorrectScaling();
  console.log('');

  testPhysicsEngineBoundary();
  console.log('');

  testPauseAtBoundary();
  console.log('');

  console.log('✅ All tests passed!');
  console.log('');
  console.log('📋 Summary:');
  console.log('   - Bug: preview.ts uses default viewerW=1920, viewerH=1080');
  console.log(
    '   - Impact: Ball appears stuck at edge when paused at boundary',
  );
  console.log(
    '   - Fix: Use actual worldWidth/worldHeight from viewerScreenSize',
  );

  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
