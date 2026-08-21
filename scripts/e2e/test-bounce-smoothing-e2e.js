#!/usr/bin/env node
'use strict';

/**
 * E2E Test for Bounce Smoothing Fix
 * Tests that ball moves smoothly from wall bounces without jitter
 *
 * Usage:
 *   node scripts/e2e/test-bounce-smoothing.js http://localhost:3000
 *   node scripts/e2e/test-bounce-smoothing.js https://dev.emdrbilateral.online
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:3000';

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Calculate velocity from position deltas
 */
function calculateVelocity(samples) {
  const velocities = [];
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].x - samples[i - 1].x;
    const dy = samples[i].y - samples[i - 1].y;
    velocities.push({ dx, dy, magnitude: Math.hypot(dx, dy) });
  }
  return velocities;
}

/**
 * Detect sudden velocity changes (jitter indicator)
 */
function detectJitter(velocities, threshold = 50) {
  const jitterEvents = [];
  for (let i = 1; i < velocities.length; i++) {
    const currentMag = velocities[i].magnitude;
    const prevMag = velocities[i - 1].magnitude;
    const change = Math.abs(currentMag - prevMag);
    if (change > threshold) {
      jitterEvents.push({
        index: i,
        prevMag: prevMag.toFixed(2),
        currentMag: currentMag.toFixed(2),
        change: change.toFixed(2),
      });
    }
  }
  return jitterEvents;
}

/**
 * Detect bounces (position reaching wall and reversing direction)
 */
function detectBounces(samples, worldWidth, worldHeight, ballRadius = 20) {
  const bounces = [];
  const wallMargin = ballRadius + 2; // As per new physics engine setting

  for (let i = 1; i < samples.length; i++) {
    const curr = samples[i];
    const prev = samples[i - 1];

    // Right wall bounce
    if (prev.x >= worldWidth - wallMargin && curr.x < prev.x) {
      bounces.push({
        index: i,
        type: 'right',
        x: curr.x.toFixed(1),
        prevX: prev.x.toFixed(1),
        dx: (curr.x - prev.x).toFixed(2),
      });
    }

    // Left wall bounce
    if (prev.x <= wallMargin && curr.x > prev.x) {
      bounces.push({
        index: i,
        type: 'left',
        x: curr.x.toFixed(1),
        prevX: prev.x.toFixed(1),
        dx: (curr.x - prev.x).toFixed(2),
      });
    }

    // Top wall bounce
    if (prev.y <= wallMargin && curr.y > prev.y) {
      bounces.push({
        index: i,
        type: 'top',
        y: curr.y.toFixed(1),
        prevY: prev.y.toFixed(1),
        dy: (curr.y - prev.y).toFixed(2),
      });
    }

    // Bottom wall bounce
    if (prev.y >= worldHeight - wallMargin && curr.y < prev.y) {
      bounces.push({
        index: i,
        type: 'bottom',
        y: curr.y.toFixed(1),
        prevY: prev.y.toFixed(1),
        dy: (curr.y - prev.y).toFixed(2),
      });
    }
  }

  return bounces;
}

/**
 * Analyze smoothness after bounce
 * Check that velocity doesn't drop to near-zero after bounce
 */
function analyzePostBounceSmoothing(samples, bounceIndices, velocities) {
  const results = [];

  for (const bounceIdx of bounceIndices) {
    if (bounceIdx + 1 < velocities.length) {
      const postBounceVel = velocities[bounceIdx + 1].magnitude;
      const isSmooth = postBounceVel > 10; // Should keep moving, not freeze

      results.push({
        bounceIdx,
        postBounceVelocity: postBounceVel.toFixed(2),
        isSmooth,
        status: isSmooth ? '✓' : '✗',
      });
    }
  }

  return results;
}

async function runBounceSmoothingTest() {
  console.log('\n🧪 E2E Bounce Smoothing Test\n');
  console.log(`📍 Server: ${BASE_URL}\n`);

  try {
    // 1. Create session
    console.log('1️⃣ Creating session...');
    const createRes = await makeRequest('/api/session', 'POST', {});
    if (createRes.status !== 200) {
      console.error('❌ Failed to create session:', createRes);
      process.exit(1);
    }
    const sessionId = createRes.data.sessionId;
    console.log(`✅ Session created: ${sessionId}\n`);

    // 2. Connect controller
    console.log('2️⃣ Connecting controller...');
    await makeRequest(
      `/api/session/${sessionId}/controller/connect`,
      'POST',
      {},
    );
    console.log('✅ Controller connected\n');

    // 3. Connect viewer
    console.log('3️⃣ Connecting viewer with screen size 1920x1080...');
    await makeRequest(`/api/session/${sessionId}/viewer/connect`, 'POST', {
      screenSize: { width: 1920, height: 1080 },
    });
    console.log('✅ Viewer connected\n');

    // 4. Start horizontal movement (to trigger left/right bounces)
    console.log('4️⃣ Starting rightward movement (50% speed)...');
    await makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
      paused: false,
      dirX: 1,
      dirY: 0,
      speed: 50,
    });
    console.log('✅ Movement started\n');

    // 5. Collect state samples during ~5 seconds of bouncing
    console.log('5️⃣ Collecting state samples for 5 seconds...');
    const samples = [];
    const sampleInterval = 50; // ms
    const sampleDuration = 5000; // 5 seconds
    const sampleCount = sampleDuration / sampleInterval;

    let lastFetchTime = Date.now();
    for (let i = 0; i < sampleCount; i++) {
      const stateRes = await makeRequest(
        `/api/session/${sessionId}/state`,
        'GET',
      );
      if (stateRes.status === 200 && stateRes.data) {
        samples.push({
          timestamp: Date.now(),
          x: stateRes.data.x || 0,
          y: stateRes.data.y || 0,
          vx: stateRes.data.vx || 0,
          vy: stateRes.data.vy || 0,
          paused: stateRes.data.paused,
        });
      }

      const elapsed = Date.now() - lastFetchTime;
      const remaining = sampleInterval - elapsed;
      if (remaining > 0) {
        await sleep(remaining);
      }
      lastFetchTime = Date.now();

      if (i % 10 === 0) {
        process.stdout.write('.');
      }
    }
    console.log(` collected ${samples.length} samples\n`);

    // 6. Stop movement
    console.log('6️⃣ Stopping ball...');
    await makeRequest(`/api/session/${sessionId}/controller/update`, 'POST', {
      paused: true,
    });
    console.log('✅ Ball stopped\n');

    // 7. Analyze results
    console.log('7️⃣ Analyzing smoothness...\n');

    const velocities = calculateVelocity(samples);
    const bounces = detectBounces(samples, 1920, 1080, 20);
    const jitter = detectJitter(velocities, 80);
    const postBounceSmoothing = analyzePostBounceSmoothing(
      samples,
      bounces.map((b) => b.index),
      velocities,
    );

    // Print results
    console.log('📊 RESULTS:\n');

    console.log(`Total samples: ${samples.length}`);
    console.log(
      `Movement duration: ${(samples[samples.length - 1].timestamp - samples[0].timestamp) / 1000}s`,
    );
    console.log(`Bounces detected: ${bounces.length}`);
    console.log(`Jitter events (velocity change > 80px): ${jitter.length}\n`);

    if (bounces.length > 0) {
      console.log('🔄 Bounces detected:');
      bounces.forEach((bounce) => {
        console.log(
          `  [${bounce.index}] ${bounce.type.toUpperCase()} wall | ` +
            `pos: ${bounce.x || bounce.y}, Δ: ${bounce.dx || bounce.dy}`,
        );
      });
      console.log();
    }

    if (jitter.length > 0 && jitter.length <= 5) {
      console.log('⚠️  Jitter events (velocity change > 80px):');
      jitter.slice(0, 5).forEach((event) => {
        console.log(
          `  [${event.index}] ${event.prevMag} → ${event.currentMag} (Δ ${event.change}px)`,
        );
      });
      if (jitter.length > 5) console.log(`  ... and ${jitter.length - 5} more`);
      console.log();
    } else if (jitter.length > 5) {
      console.log(`⚠️  Too many jitter events: ${jitter.length}`);
      console.log();
    }

    if (postBounceSmoothing.length > 0) {
      console.log('✅ Post-bounce smoothness check:');
      postBounceSmoothing.forEach((result) => {
        console.log(
          `  Bounce@${result.bounceIdx}: velocity=${result.postBounceVelocity}px ${result.status}`,
        );
      });
      console.log();
    }

    // Final verdict
    console.log('✅ TEST COMPLETED\n');
    const smoothBounces = postBounceSmoothing.filter((r) => r.isSmooth).length;
    const totalBounces = postBounceSmoothing.length;

    if (totalBounces === 0) {
      console.log('⚠️  No bounces detected (ball may not have hit walls)');
    } else if (smoothBounces === totalBounces) {
      console.log(
        `✅ EXCELLENT: All ${totalBounces} bounces show smooth post-bounce movement`,
      );
      console.log('   → Ball maintains velocity after hitting walls');
      console.log('   → No jitter or stalling detected\n');
    } else {
      console.log(
        `⚠️  PARTIAL: ${smoothBounces}/${totalBounces} bounces are smooth`,
      );
      console.log(
        `   ${totalBounces - smoothBounces} bounces show velocity drop after impact\n`,
      );
    }

    if (jitter.length > 2) {
      console.log(`🔴 WARNING: High jitter detected (${jitter.length} events)`);
    } else if (jitter.length === 0) {
      console.log('🟢 EXCELLENT: No jitter detected');
    } else {
      console.log(`🟡 OK: Minor jitter (${jitter.length} events)`);
    }

    console.log();
    process.exit(smoothBounces === totalBounces && jitter.length <= 2 ? 0 : 1);
  } catch (error) {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  }
}

runBounceSmoothingTest();
