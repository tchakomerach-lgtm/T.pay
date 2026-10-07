import { test, expect } from "@playwright/test";

test("visual contract: no horizontal overflow and stable core geometry", async ({ page }) => {
  await page.goto("/");
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyHeight: document.body.scrollHeight,
    mainWidth: document.querySelector("main")?.getBoundingClientRect().width ?? 0,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyHeight).toBeGreaterThan(400);
  expect(metrics.mainWidth).toBeGreaterThan(0);
});
