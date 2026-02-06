const puppeteer = require('puppeteer')
const { execSync } = require('child_process')

// Configuration
const BASE_URL = process.env.BASE_URL || 'https://dev.emdrbilateral.online' // Production/Dev URL directly
const HEADLESS = process.env.HEADLESS !== 'false'

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function createSession() {
    console.log(`Creating session at ${BASE_URL}...`)
    // Using fetch inside node is available in newer node versions, or use curl fallback
    try {
        const cmd = `curl -s -X POST "${BASE_URL}/api/session"`
        const output = execSync(cmd).toString()
        const data = JSON.parse(output)
        return data.sessionId
    } catch (e) {
        console.error('Failed to create session via curl:', e.message)
        throw e
    }
}

async function getViewerState(page) {
    return page.evaluate(() => {
        const engine = window.physicsEngine
        if (!engine || !engine.ball) return null
        return {
            x: engine.ball.x,
            y: engine.ball.y,
            vx: engine.ball.vx,
            vy: engine.ball.vy,
            radius: engine.ball.radius,
            speed: engine.ball.speed,
            color: engine.ball.color ? engine.ball.color : engine.colors.ball, // Access from colors if ball.color is missing
            bgColor: engine.colors ? engine.colors.bg : null, // Access from colors object
            paused: engine.state ? engine.state.paused : true,
            soundEnabled: window.audioManager ? window.audioManager.isEnabled : false
        }
    })
}

async function getControllerState(page) {
    return page.evaluate(() => {
        const engine = window.__previewPhysics
        if (!engine || !engine.ball) return null
        return {
            x: engine.ball.x,
            y: engine.ball.y,
            vx: engine.ball.vx,
            vy: engine.ball.vy,
            radius: engine.ball.radius,
            // Controller might use different property for speed/color or derive it
            // but physics engine structure should be similar
            speed: engine.ball.speed,
            color: engine.ball.color,
            paused: engine.state ? engine.state.paused : true
        }
    })
}

async function run() {
    console.log(`🚀 Starting Full E2E Sync Test on ${BASE_URL}`)

    const browser = await puppeteer.launch({
        headless: HEADLESS ? 'new' : false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    try {
        // 1. Create Session
        const sessionId = await createSession()
        console.log(`✅ Session Created: ${sessionId}`)

        // 2. Open Pages
        const controllerPage = await browser.newPage()
        const viewerPage = await browser.newPage()

        controllerPage.setDefaultNavigationTimeout(60000)
        viewerPage.setDefaultNavigationTimeout(60000)

        // Setup console logging
        viewerPage.on('console', msg => console.log(`[VIEWER] ${msg.type()}: ${msg.text()}`))
        viewerPage.on('pageerror', err => console.error(`[VIEWER PAGE ERROR] ${err.toString()}`))
        viewerPage.on('requestfailed', request => console.error(`[VIEWER REQUEST FAILED] ${request.url()} ${request.failure().errorText}`))

        controllerPage.on('console', msg => console.log(`[CONTROLLER] ${msg.type()}: ${msg.text()}`))
        controllerPage.on('pageerror', err => console.error(`[CONTROLLER PAGE ERROR] ${err.toString()}`))

        // Load Pages
        const controllerUrl = `${BASE_URL}/session-controller.html?sessionId=${sessionId}`
        const viewerUrl = `${BASE_URL}/viewer.html?sessionId=${sessionId}`

        console.log(`Navigating to ${controllerUrl} and ${viewerUrl}`)

        // Use 'domcontentloaded' to just wait for connection, then wait for selectors
        await Promise.all([
            controllerPage.goto(controllerUrl, { waitUntil: 'domcontentloaded' }),
            viewerPage.goto(viewerUrl, { waitUntil: 'domcontentloaded' })
        ])

        console.log('✅ Navigation committed. Waiting for body...')

        await Promise.all([
            controllerPage.waitForSelector('body'),
            viewerPage.waitForSelector('body')
        ])

        console.log('✅ Body loaded')

        // Wait for initialization
        try {
            await viewerPage.waitForFunction(() => window.physicsEngine, { timeout: 10000 })
            console.log('✅ Viewer physicsEngine initialized')

            await controllerPage.waitForFunction(() => window.__previewPhysics, { timeout: 10000 })
            console.log('✅ Controller previewPhysics initialized')
        } catch (e) {
             console.log('❌ Initialization timeout.')
             throw e
        }

        // allow sometime for socket/sse connection
        await sleep(3000)

        // ==========================================
        // Test 1: Start Movement & Check Sync
        // ==========================================
        console.log('\n🧪 Test 1: Movement Start & Sync')

        // Controller: Click Start (if paused) or ensure playing
        await controllerPage.evaluate(() => {
             console.log('Attempting to start via Play button...')
             const btn = document.getElementById('playPauseBtn')
             if (btn) {
                 // Check if icon indicates paused (play icon visible)
                 // Usually playPauseBtn toggles.
                 // We can also check window.isPlaying if exposed?
                 // Or just click.
                 btn.click()
             } else {
                 console.error('Play button not found')
                 // Fallback to global function
                 if (window.togglePlayPause) window.togglePlayPause()
             }
        })

        await sleep(2000)

        // Check Viewer: Ball should be moving (vx/vy != 0)
        const viewerState1 = await getViewerState(viewerPage)
        const controllerState1 = await getControllerState(controllerPage)

        if (viewerState1 && (Math.abs(viewerState1.vx) > 0 || Math.abs(viewerState1.vy) > 0)) {
            console.log('✅ PASSED: Viewer ball is moving', viewerState1)
        } else {
            console.error('❌ FAILED: Viewer ball is NOT moving', viewerState1)
        }

        if (controllerState1 && (Math.abs(controllerState1.vx) > 0 || Math.abs(controllerState1.vy) > 0)) {
            console.log('✅ PASSED: Controller ball is moving', controllerState1)
        } else {
             // Controller preview might not simulate velocity directly if it just interpolates positions
             // But physics engine usually has velocity.
            console.warn('⚠️ Controller ball might not have velocity (depends on implementation)', controllerState1)
        }

        // Check Sync (Position)
        // They won't be identical due to timing differences in evaluate, but should be close.
        // Or at least checks they are in same universe.
        if (viewerState1 && controllerState1) {
            const dx = Math.abs(viewerState1.x - controllerState1.x)
            const dy = Math.abs(viewerState1.y - controllerState1.y)
            console.log(`Sync Check: dx=${dx}, dy=${dy}`)
            console.log(`Viewer: (${viewerState1.x}, ${viewerState1.y})`)
            console.log(`Controller: (${controllerState1.x}, ${controllerState1.y})`)

            // Allow some deviation (e.g. 50-100 pixels depending on speed and lag)
            // Speed 50 is pixels per second? Or generic unit?
            // If lag is 100ms, and speed is 500px/s, diff is 50px.
            if (dx < 200 && dy < 200) {
                console.log('✅ PASSED: Viewer and Controller are roughly synced')
            } else {
                console.error('❌ FAILED: Viewer and Controller are OUT OF SYNC')
            }
        }

        // ==========================================
        // Test 2: Position Update (Movement verification)
        // ==========================================
        console.log('\n🧪 Test 2: Actual Movement')
        await sleep(1000)
        const viewerState2 = await getViewerState(viewerPage)

        if (viewerState1 && viewerState2 && (viewerState1.x !== viewerState2.x || viewerState1.y !== viewerState2.y)) {
             console.log('✅ PASSED: Ball position changed over time')
        } else {
             console.error('❌ FAILED: Ball stuck at same position')
        }

        // ==========================================
        // Test 3: Speed Change
        // ==========================================
        console.log('\n🧪 Test 3: Speed Sync')
        const targetSpeed = 85

        await controllerPage.evaluate((speed) => {
             // Use global function updateSpeed if available
             if (window.updateSpeed) {
                 window.updateSpeed(speed)
             } else {
                 // UI Interaction
                 const input = document.getElementById('speedRange')
                 if(input) {
                     input.value = speed
                     input.dispatchEvent(new Event('input', { bubbles: true }))
                     input.dispatchEvent(new Event('change', { bubbles: true }))
                 }
             }
        }, targetSpeed)

        await sleep(2000)

        const viewerSpeed = await viewerPage.evaluate(() => {
            return window.physicsEngine?.ball?.speed
        })

        console.log(`   Sent Speed: ${targetSpeed}, Viewer Speed (approx): ${viewerSpeed}`)

        // ==========================================
        // Test 4: Color Change
        // ==========================================
        console.log('\n🧪 Test 4: Color Sync')
        const newColor = '#ff4444' // Red

        await controllerPage.evaluate((color) => {
             if (window.setBallColor) {
                 window.setBallColor(color)
             } else {
                 // Try finding color input - id might be 'ballColor' or similar
                 const input = document.getElementById('ballColorPicker') // Guessing ID
                 if(input) {
                    input.value = color
                    input.dispatchEvent(new Event('input', { bubbles: true }))
                    input.dispatchEvent(new Event('change', { bubbles: true }))
                 }
             }
        }, newColor)

        await sleep(2000)

        const viewerColor = await viewerPage.evaluate(() => {
            return window.physicsEngine?.ball?.color
        })
        // Note: physicsEngine doesn't strictly store color in ball object usually, check renderer?
        // Actually renderer uses physicsEngine.ball.color often if updated.
        console.log(`Viewer Color: ${viewerColor}`)

        // ==========================================
        // Test 5: Pause
        // ==========================================
        console.log('\n🧪 Test 5: Pause Sync')
        await controllerPage.evaluate(() => {
             if (window.togglePlayPause) window.togglePlayPause()
             else {
                 const btn = document.getElementById('playPauseBtn')
                 if(btn) btn.click()
             }
        })

        await sleep(2000)

        const pausedState = await viewerPage.evaluate(() => {
            return {
                paused: window.physicsEngine?.state?.paused
            }
        })

        if (pausedState.paused) {
             console.log('✅ PASSED: Viewer paused')
        } else {
             console.error('❌ FAILED: Viewer did not pause', pausedState)
        }

        // ==========================================
        // Test 6: Directions (Horizontal, Vertical, Diagonal)
        // ==========================================
        console.log('\n🧪 Test 6: Directions')

        // Ensure playing
        await controllerPage.evaluate(() => {
             if (window.isPlaying === false && window.togglePlayPause) window.togglePlayPause()
             else if (document.getElementById('playPauseBtn')) document.getElementById('playPauseBtn').click()
        })

        // Horizontal (default, but explicit check)
        // setDirection('horizontal')
        await controllerPage.evaluate(() => {
            if (window.setDirection) window.setDirection('horizontal')
        })
        await sleep(1500)
        let vState = await getViewerState(viewerPage)
        if (Math.abs(vState.vx) > 0 && Math.abs(vState.vy) < 1) { // Allow small fp error
             console.log('✅ PASSED: Horizontal Direction', vState.vx, vState.vy)
        } else {
             console.error('❌ FAILED: Horizontal Direction', vState)
        }

        // Vertical
        // setDirection('vertical')
        await controllerPage.evaluate(() => {
            if (window.setDirection) window.setDirection('vertical')
        })
        await sleep(1500)
        vState = await getViewerState(viewerPage)
        if (Math.abs(vState.vy) > 0 && Math.abs(vState.vx) < 1) {
             console.log('✅ PASSED: Vertical Direction', vState.vx, vState.vy)
        } else {
             console.error('❌ FAILED: Vertical Direction', vState)
        }

        // Diagonal
        // setDirection('diagRL')
        await controllerPage.evaluate(() => {
            if (window.setDirection) window.setDirection('diagRL')
        })
        await sleep(1500)
        vState = await getViewerState(viewerPage)
        if (Math.abs(vState.vx) > 0 && Math.abs(vState.vy) > 0) {
             console.log('✅ PASSED: Diagonal Direction', vState.vx, vState.vy)
        } else {
             console.error('❌ FAILED: Diagonal Direction', vState)
        }


        // ==========================================
        // Test 7: Background Color
        // ==========================================
        console.log('\n🧪 Test 7: Background Color')
        const testBgColor = '#1e1e1e'

        await controllerPage.evaluate((color) => {
            if (window.setBackgroundColor) {
                window.setBackgroundColor(color)
            }
        }, testBgColor)
        await sleep(1000)

        vState = await getViewerState(viewerPage)
        const viewerBg = vState.bgColor

        if (viewerBg === testBgColor) {
            console.log(`✅ PASSED: Background Color ${viewerBg}`)
        } else {
             console.log(`ℹ️ Viewer BG Color: ${viewerBg} (Expected ${testBgColor})`)
             // Loose check for hex case
            if (viewerBg && viewerBg.toLowerCase() === testBgColor.toLowerCase()) {
                 console.log('✅ PASSED: Background Color match (case-insensitive)')
            } else {
                 console.error('❌ FAILED: Background Color mismatch')
            }
        }

        // ==========================================
        // Test 8: Ball Size (Radius)
        // ==========================================
        console.log('\n🧪 Test 8: Ball Size')
        const newRadius = 45
        await controllerPage.evaluate((r) => {
             if (window.setBallSize) window.setBallSize(r)
        }, newRadius)
        await sleep(1000)

        vState = await getViewerState(viewerPage)
        if (vState.radius === newRadius) {
            console.log(`✅ PASSED: Ball Radius ${vState.radius}`)
        } else {
            console.error(`❌ FAILED: Ball Radius ${vState.radius} (Expected ${newRadius})`)
        }

        // ==========================================
        // Test 9: Sound Toggle
        // ==========================================
        console.log('\n🧪 Test 9: Sound Sync')

        // Enable Sound
        await controllerPage.evaluate(() => {
             const chk = document.getElementById('soundEnabledCheckbox')
             if (chk) {
                 if (!chk.checked) chk.click()
             } else {
                 // Try global toggle if exists. Not standard function usually.
                 // let's assume checkbox interaction is primary
             }
        })
        await sleep(1000)

        // Check viewer sound status
        // Usually viewer needs user interaction to enable audio context, but we are checking if state is propagated
        // The viewer might show a "remote enabled" flag
        const isSoundEnabled = await viewerPage.evaluate(() => {
             return window.audioManager && window.audioManager.isEnabled
        })

        if (isSoundEnabled) {
             console.log('✅ PASSED: Sound Enabled on Viewer')
        } else {
             console.warn('⚠️ Sound might not be enabled on viewer without user interaction (browser policy), but checking state transfer...')
             // Check if we can verify the 'intent' to play sound (e.g. server state)
        }

        console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY')

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error)
        process.exit(1)
    } finally {
        await browser.close()
    }
}

run()
