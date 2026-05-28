/**
 * GremiusCMS — Playwright E2E Configuration
 *
 * Setup:
 *   pnpm add -Dw @playwright/test
 *   npx playwright install chromium
 *   npx playwright init-agents --loop=vscode
 *
 * Run:
 *   npx playwright test
 *   npx playwright test --ui
 *
 * Requires: pnpm dev running (API :3001, Admin :5173)
 */
declare const _default: import("@playwright/test").PlaywrightTestConfig<{}, {}>;
export default _default;
//# sourceMappingURL=playwright.config.d.ts.map