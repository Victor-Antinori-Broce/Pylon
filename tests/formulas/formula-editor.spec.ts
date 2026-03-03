// spec: specs/gremius-full-coverage.md — Section 8: Fórmulas KPI
// seed: tests/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";

const ADMIN = "http://localhost:5173";

async function loginAsAdmin(page: Page): Promise<boolean> {
  await page.goto(ADMIN);
  await page.waitForURL(/\/(login|setup)/, { timeout: 15_000 });
  if (page.url().includes("/setup")) return false;

  await page.locator('input[type="email"]').fill("admin@gremius.gg");
  await page.locator('input[type="password"]').fill("gremius123");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
  await expect(page.locator("text=Welcome back")).toBeVisible({ timeout: 10_000 });
  return true;
}

test.describe("Fórmulas KPI", () => {
  test("8.1 Formula list page loads", async ({ page }) => {
    const ok = await loginAsAdmin(page);
    if (!ok) { test.skip(true, "Fresh install"); return; }

    // Navigate directly — module might not be in sidebar if disabled
    await page.goto(`${ADMIN}/formulas`);
    await page.waitForLoadState("networkidle");

    // Should show the formulas page (list or empty state)
    await expect(page).toHaveURL(/\/formulas/);
  });

  test("8.2 Formula editor has all fields", async ({ page }) => {
    const ok = await loginAsAdmin(page);
    if (!ok) { test.skip(true, "Fresh install"); return; }

    await page.goto(`${ADMIN}/formulas/new`);
    await page.waitForLoadState("networkidle");

    // KPI select
    const selects = page.locator("select");
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(1);

    // Expression textarea
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();

    // Threshold input (number)
    const numberInput = page.locator('input[type="number"]');
    await expect(numberInput).toBeVisible();

    // Save button
    await expect(page.locator("text=Guardar").first()).toBeVisible();
  });

  test("8.3 Validation blocks empty expression", async ({ page }) => {
    const ok = await loginAsAdmin(page);
    if (!ok) { test.skip(true, "Fresh install"); return; }

    await page.goto(`${ADMIN}/formulas/new`);
    await page.waitForLoadState("networkidle");

    // Click the last "Guardar" button (the simple save, not "Guardar y añadir otro")
    const saveButtons = page.locator("button").filter({ hasText: "Guardar" });
    await saveButtons.first().click();

    // Error message should appear
    await expect(page.locator("text=obligatoria")).toBeVisible({ timeout: 3_000 });
  });

  test("8.4 Threshold updates preview", async ({ page }) => {
    const ok = await loginAsAdmin(page);
    if (!ok) { test.skip(true, "Fresh install"); return; }

    await page.goto(`${ADMIN}/formulas/new`);
    await page.waitForLoadState("networkidle");

    // Set threshold
    const thresholdInput = page.locator('input[type="number"]');
    await thresholdInput.fill("95");

    // Preview should reflect the value
    await expect(page.locator("text=95")).toBeVisible();
  });
});
