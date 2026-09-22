/* global require, console */

const { test, expect } = require('@playwright/test');

test.describe('Bilateral Bound E2E Tests', () => {
  let sessionId;

  test('Presets apply correctly to both Controller and Viewer', async ({ browser }) => {
    // Open Controller
    const controllerContext = await browser.newContext();
    const controllerPage = await controllerContext.newPage();
    await controllerPage.goto('/');
    controllerPage.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    await controllerPage.click('#createSessionBtn');

    // Wait for session creation and redirection to controller
    await controllerPage.waitForURL(/\/c\/\w+/);
    const controllerUrl = controllerPage.url();
    sessionId = controllerUrl.split('/').pop();

    console.log(`Created session: ${sessionId}`);

    // Log WS messages on controller
    controllerPage.on('websocket', ws => {
      ws.on('framesent', event => console.log('WS_SEND Controller:', event.payload));
      ws.on('framereceived', event => console.log('WS_RECV Controller:', event.payload));
    });

    await controllerPage.goto(controllerUrl);

    // Create Viewer FIRST so it is connected
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    viewerPage.on('console', msg => console.log('VIEWER CONSOLE:', msg.text()));

    // Wait for the controller WS to connect completely before proceeding
    await controllerPage.waitForTimeout(500);
    viewerPage.on('websocket', ws => {
      ws.on('framereceived', event => console.log('WS_RECV Viewer:', event.payload));
    });

    const viewerUrl = controllerUrl.replace('/c/', '/s/');
    await viewerPage.goto(viewerUrl);

    // Give it a moment to connect via websocket
    await viewerPage.waitForTimeout(2000);

    // Wait for the controller to know the viewer is connected
    await controllerPage.waitForFunction(() => globalThis.__current && globalThis.__current.viewerConnected, { timeout: 10000 });

    // The fastIntensive preset sets color to yellow/orange (#f59e0b)
    await controllerPage.click('.preset-pill[data-preset-id="fastIntensive"]', { timeout: 5000, force: true });
    await controllerPage.waitForTimeout(1000); // Wait for WS broadcast

    // In the viewer, check if the color has been updated.
    await viewerPage.waitForFunction(() => typeof globalThis.physicsEngine !== 'undefined', { timeout: 10000 });
    const viewerColor = await viewerPage.evaluate(() => {
      return globalThis.physicsEngine.colors.ball;
    });

    expect(viewerColor).toBe('#f59e0b');

    // Also verify speed was applied
    const viewerSpeed = await viewerPage.evaluate(() => {
      return globalThis.physicsEngine.ball.speed;
    });
    expect(viewerSpeed).toBe(78);
  });
});
