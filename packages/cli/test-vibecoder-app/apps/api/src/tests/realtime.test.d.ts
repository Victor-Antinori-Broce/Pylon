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
declare const WS_URL: string;
declare const API_URL: string;
interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
}
declare const results: TestResult[];
//# sourceMappingURL=realtime.test.d.ts.map