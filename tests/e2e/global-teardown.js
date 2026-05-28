// @ts-nocheck
// Global Teardown: Cleanup after E2E tests
async function globalTeardown(config) {
    console.log("🧹 E2E Global Teardown");
    const apiProcess = global.__API_PROCESS__;
    if (apiProcess) {
        console.log("🛑 Stopping API server...");
        process.kill(-apiProcess.pid);
        console.log("✅ API server stopped");
    }
}
export default globalTeardown;
//# sourceMappingURL=global-teardown.js.map