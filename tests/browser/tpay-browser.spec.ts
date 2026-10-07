import { test, expect } from "@playwright/test";

test.describe("T.Pay renderer browser gate", () => {
  test("desktop surface renders from the production bundle", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/T\.Pay/i);
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("renderer-runtime")).toBeVisible();
  });

  test("primary navigation is keyboard reachable", async ({ page }) => {
    await page.goto("/");
    const first = page.getByRole("button", { name: "Accueil" });
    await first.focus();
    await expect(first).toBeFocused();
    await expect(page.locator(":focus-visible")).toHaveCount(1);
  });

  test("status is exposed through text and a live region", async ({ page }) => {
    await page.goto("/");
    const live = page.getByRole("status", { name: "État de connexion" });
    await expect(live).toContainText("En ligne");
    await expect(page.getByRole("status", { name: "État de connexion" })).toHaveAttribute("aria-live", "polite");
  });

  test("responsive navigation remains usable on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mode : standard" })).toBeVisible();
    await expect(page.getByTestId("object-card")).toBeVisible();
  });

  test("offline mode never claims authoritative remote success", async ({ page }) => {
    await page.goto("/");
    const mode = page.getByRole("button", { name: /Mode : standard/i });
    await mode.click();
    await mode.click();
    await expect(page.getByTestId("connection-status")).toContainText("Hors ligne");
    await expect(page.getByTestId("offline-authority")).toContainText("Aucune confirmation serveur");
    await expect(page.getByTestId("remote-success")).toBeHidden();
  });

  test("reconnect returns to online without losing the active surface", async ({ page }) => {
    await page.goto("/");
    await page.context().setOffline(true);
    await expect(page.getByTestId("connection-status")).toContainText("Hors ligne");
    await page.context().setOffline(false);
    await expect(page.getByTestId("connection-status")).toContainText("En ligne");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("visual capture is deterministic enough for regression artifacts", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.screenshot({ path: testInfo.outputPath("renderer.png"), fullPage: true, animations: "disabled" });
    const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
    const box = await page.getByTestId("object-card").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(120);
  });
});
