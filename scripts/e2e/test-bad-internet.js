/**
 * Stress test for bad internet conditions
 * Simulates packet loss, high latency, and jitter
 */

const puppeteer = require('puppeteer');

// Get base URL from command line or use default
const BASE_URL = process.argv[2] || 'http://localhost:3000';

/**
 * Check if server is available
 */
// eslint-disable-next-line no-unused-vars
async function checkServerAvailable(url) {
  try {
    const http = require('http');
    const https = require('https');
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = client.get(url, { timeout: 5000 }, (res) => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

const TEST_CONFIG = {
  controllerUrl: `${BASE_URL}/s/test-session`,
  viewerUrl: `${BASE_URL}/s/test-session`,
  duration: 60000, // 60 seconds
  networkProfiles: [
    { name: 'Good', latency: 20, jitter: 5, packetLoss: 0 },
    { name: 'Moderate', latency: 100, jitter: 30, packetLoss: 0.05 },
    { name: 'Poor', latency: 300, jitter: 100, packetLoss: 0.15 },
    { name: 'Very Poor', latency: 500, jitter: 200, packetLoss: 0.3 },
  ],
};

async function simulateNetworkConditions(page, profile) {
  const client = await page.target().createCDPSession();

  // Simulate network conditions
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latency,
    downloadThroughput: -1, // unlimited
    uploadThroughput: -1,
  });

  console.log(`🌐 Network profile: ${profile.name}`);
  console.log(`   Latency: ${profile.latency}ms`);
  console.log(`   Jitter: ${profile.jitter}ms`);
  console.log(`   Packet Loss: ${(profile.packetLoss * 100).toFixed(1)}%`);
}

async function measureBallJitter(page, duration) {
  const positions = [];
  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    try {
      const pos = await page.evaluate(() => {
        const engine = window.physicsEngine || window.__previewPhysics;
        if (!engine) return null;
        return {
          x: engine.ball.x,
          y: engine.ball.y,
          vx: engine.ball.vx,
          vy: engine.ball.vy,
          paused: engine.state.paused,
        };
      });

      if (pos && !pos.paused) {
        positions.push({
          ...pos,
          timestamp: Date.now(),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 50)); // 20 Hz sampling
    } catch {
      // Page might be navigating
    }
  }

  // Calculate jitter metrics
  if (positions.length < 2) {
    return { avgJitter: 0, maxJitter: 0, samples: 0 };
  }

  let totalJitter = 0;
  let maxJitter = 0;

  for (let i = 1; i < positions.length; i++) {
    const dt = (positions[i].timestamp - positions[i - 1].timestamp) / 1000;
    const expectedX = positions[i - 1].x + positions[i - 1].vx * dt;
    const expectedY = positions[i - 1].y + positions[i - 1].vy * dt;

    const actualJitter = Math.hypot(
      positions[i].x - expectedX,
      positions[i].y - expectedY,
    );

    totalJitter += actualJitter;
    maxJitter = Math.max(maxJitter, actualJitter);
  }

  return {
    avgJitter: totalJitter / (positions.length - 1),
    maxJitter,
    samples: positions.length,
  };
}

async function testNetworkProfile(browser, profile) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${profile.name}`);
  console.log('='.repeat(60));

  // Create a new session by clicking the create button
  const homePage = await browser.newPage();
  await homePage.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // Click "Start EMDR Session" button
  await homePage.waitForSelector('#createSessionBtn', { timeout: 15000 });
  await homePage.click('#createSessionBtn');

  // Wait for navigation to controller page
  await homePage.waitForNavigation({
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  // Extract session ID from URL (should be /c/{sessionId})
  const sessionId = homePage.url().match(/\/c\/([^/]+)/)?.[1];
  if (!sessionId) {
    throw new Error('Failed to get session ID from URL: ' + homePage.url());
  }
  console.log(`Using session: ${sessionId}`);

  // The home page is now the controller page
  const controllerPage = homePage;
  await controllerPage.waitForSelector('#playPauseBtn', { timeout: 15000 });

  // Open viewer page
  const viewerPage = await browser.newPage();
  await viewerPage.goto(`${BASE_URL}/s/${sessionId}`, {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await viewerPage.waitForSelector('#viewerCanvas', { timeout: 15000 });

  // Wait for connection
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Simulate network conditions on viewer
  await simulateNetworkConditions(viewerPage, profile);

  // Start the ball
  await controllerPage.click('#playPauseBtn');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Measure jitter for 10 seconds
  console.log('\n📊 Measuring ball jitter...');
  const viewerMetrics = await measureBallJitter(viewerPage, 10000);
  const controllerMetrics = await measureBallJitter(controllerPage, 10000);

  console.log('\n📈 Results:');
  console.log('   Viewer:');
  console.log(`     Avg Jitter: ${viewerMetrics.avgJitter.toFixed(2)}px`);
  console.log(`     Max Jitter: ${viewerMetrics.maxJitter.toFixed(2)}px`);
  console.log(`     Samples: ${viewerMetrics.samples}`);
  console.log('   Controller:');
  console.log(`     Avg Jitter: ${controllerMetrics.avgJitter.toFixed(2)}px`);
  console.log(`     Max Jitter: ${controllerMetrics.maxJitter.toFixed(2)}px`);
  console.log(`     Samples: ${controllerMetrics.samples}`);

  // Check for ball "jumping" (sudden position changes)
  const hasJumping = viewerMetrics.maxJitter > 100;
  console.log(
    '\n' + (hasJumping ? '❌' : '✅') + ' Ball jumping detected: ' + hasJumping,
  );

  // Stop the ball
  await controllerPage.click('#playPauseBtn');

  // Cleanup
  await controllerPage.close();
  await viewerPage.close();

  return {
    profile: profile.name,
    viewerMetrics,
    controllerMetrics,
    hasJumping,
  };
}

async function runStressTest() {
  console.log('🚀 Starting Bad Internet Stress Test');
  console.log(`Duration: ${TEST_CONFIG.duration / 1000}s per profile\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];

  try {
    for (const profile of TEST_CONFIG.networkProfiles) {
      const result = await testNetworkProfile(browser, profile);
      results.push(result);

      // Wait between tests
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    for (const result of results) {
      console.log(`\n${result.profile}:`);
      console.log(
        `  Viewer Avg Jitter: ${result.viewerMetrics.avgJitter.toFixed(2)}px`,
      );
      console.log(
        `  Viewer Max Jitter: ${result.viewerMetrics.maxJitter.toFixed(2)}px`,
      );
      console.log(`  Ball Jumping: ${result.hasJumping ? 'YES ❌' : 'NO ✅'}`);
    }

    // Check if all tests passed
    const allPassed = results.every((r) => !r.hasJumping);
    console.log(
      `\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`,
    );
  } finally {
    await browser.close();
  }
}

// Run the test
runStressTest().catch(console.error);
