/**
 * GremiusCMS — Real-time Test Script
 * 
 * Run with: bun run src/tests/realtime.test.ts
 * 
 * Tests:
 *   1. WebSocket connection upgrade
 *   2. Channel subscription
 *   3. Ping/Pong heartbeat
 *   4. Presence system
 *   5. Error handling
 */

const WS_URL = process.env.WS_URL || "ws://localhost:3001/api/realtime";
const API_URL = process.env.API_URL || "http://localhost:3001/api";

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
    console.log(`  ${msg}`);
}

function success(name: string, duration: number) {
    results.push({ name, passed: true, duration });
    console.log(`✅ ${name} (${duration}ms)`);
}

function fail(name: string, error: string, duration: number) {
    results.push({ name, passed: false, duration, error });
    console.log(`❌ ${name}: ${error}`);
}

// ═══════════════════════════════════════════════════════════════
// Test 1: WebSocket Connection
// ═══════════════════════════════════════════════════════════════

async function testConnection(): Promise<void> {
    const start = Date.now();
    const name = "WebSocket Connection";

    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        const timeout = setTimeout(() => {
            ws.close();
            fail(name, "Connection timeout", Date.now() - start);
            resolve();
        }, 5000);

        ws.onopen = () => {
            log("Connected to WebSocket server");
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data as string);
                if (msg.type === "connected" && msg.clientId) {
                    clearTimeout(timeout);
                    ws.close();
                    success(name, Date.now() - start);
                    resolve();
                }
            } catch (e) {
                clearTimeout(timeout);
                ws.close();
                fail(name, "Invalid message format", Date.now() - start);
                resolve();
            }
        };

        ws.onerror = (e) => {
            clearTimeout(timeout);
            fail(name, "Connection error", Date.now() - start);
            resolve();
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// Test 2: Channel Subscription
// ═══════════════════════════════════════════════════════════════

async function testSubscription(): Promise<void> {
    const start = Date.now();
    const name = "Channel Subscription";

    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            fail(name, "Subscription timeout", Date.now() - start);
            resolve();
        }, 5000);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data as string);
            
            if (msg.type === "connected") {
                connected = true;
                ws.send(JSON.stringify({ type: "subscribe", channel: "table:test-dataset" }));
            }
            
            if (msg.type === "subscribed" && msg.channel === "table:test-dataset") {
                clearTimeout(timeout);
                ws.close();
                success(name, Date.now() - start);
                resolve();
            }
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            fail(name, "Connection error", Date.now() - start);
            resolve();
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// Test 3: Ping/Pong Heartbeat
// ═══════════════════════════════════════════════════════════════

async function testPingPong(): Promise<void> {
    const start = Date.now();
    const name = "Ping/Pong Heartbeat";

    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            fail(name, "Pong timeout", Date.now() - start);
            resolve();
        }, 5000);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data as string);
            
            if (msg.type === "connected") {
                connected = true;
                ws.send(JSON.stringify({ type: "ping" }));
            }
            
            if (msg.type === "pong" && msg.timestamp) {
                clearTimeout(timeout);
                ws.close();
                success(name, Date.now() - start);
                resolve();
            }
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            fail(name, "Connection error", Date.now() - start);
            resolve();
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// Test 4: Presence System
// ═══════════════════════════════════════════════════════════════

async function testPresence(): Promise<void> {
    const start = Date.now();
    const name = "Presence System";

    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            fail(name, "Presence timeout", Date.now() - start);
            resolve();
        }, 5000);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data as string);
            
            if (msg.type === "connected") {
                connected = true;
                ws.send(JSON.stringify({ type: "presence:join", room: "test-room" }));
            }
            
            if (msg.type === "presence" && msg.room === "test-room") {
                if (msg.count >= 1 && Array.isArray(msg.users)) {
                    clearTimeout(timeout);
                    ws.close();
                    success(name, Date.now() - start);
                    resolve();
                }
            }
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            fail(name, "Connection error", Date.now() - start);
            resolve();
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// Test 5: Error Handling (Invalid JSON)
// ═══════════════════════════════════════════════════════════════

async function testErrorHandling(): Promise<void> {
    const start = Date.now();
    const name = "Error Handling";

    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let connected = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            fail(name, "Error response timeout", Date.now() - start);
            resolve();
        }, 5000);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data as string);
            
            if (msg.type === "connected") {
                connected = true;
                // Send invalid JSON
                ws.send("not valid json {{{");
            }
            
            if (msg.type === "error") {
                clearTimeout(timeout);
                ws.close();
                success(name, Date.now() - start);
                resolve();
            }
        };

        ws.onerror = () => {
            clearTimeout(timeout);
            fail(name, "Connection error", Date.now() - start);
            resolve();
        };
    });
}

// ═══════════════════════════════════════════════════════════════
// Run All Tests
// ═══════════════════════════════════════════════════════════════

async function runTests() {
    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║  GremiusCMS Real-time Test Suite           ║");
    console.log("╚══════════════════════════════════════════╝\n");
    
    console.log(`Target: ${WS_URL}\n`);

    await testConnection();
    await testSubscription();
    await testPingPong();
    await testPresence();
    await testErrorHandling();

    // Summary
    console.log("\n────────────────────────────────────────────");
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const allPassed = passed === total;
    
    console.log(`\nResults: ${passed}/${total} tests passed`);
    
    if (allPassed) {
        console.log("\n🎉 All tests passed!\n");
        process.exit(0);
    } else {
        console.log("\n❌ Some tests failed:\n");
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   - ${r.name}: ${r.error}`);
        });
        console.log("");
        process.exit(1);
    }
}

runTests().catch(console.error);
