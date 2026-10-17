import { test, expect } from "@playwright/test";

test("Super Admin console requires a real login before privileged step-up", async ({ page }) => {
  let overviewCalls = 0;
  await page.route("**/v1/admin/overview", async route => {
    overviewCalls += 1;
    if (overviewCalls === 1) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "SESSION_INVALID" } }) });
      return;
    }
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { message: "ADMIN_ACCESS_DENIED" } }) });
  });
  await page.route("**/v1/auth/login", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { csrfToken: "test-csrf-token", expiresAt: new Date(Date.now() + 60_000).toISOString() } }) });
  });
  await page.goto("/#admin/dashboard");
  await expect(page.getByRole("heading", { name: "Connexion sécurisée" })).toBeVisible();
  await page.getByLabel("Identifiant").fill("admin@example.test");
  await page.getByLabel("Mot de passe").fill("not-a-real-password");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: "Activer le step-up FIDO2 / passkey" })).toBeVisible();
  expect(overviewCalls).toBe(2);
});

test("Super Admin recovery screen renders read-only recovery and Root Trust evidence", async ({ page }) => {
  await page.route("**/v1/admin/overview", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { runtime: { mode: "normal", version: 4 }, privileged: [{ level: "L4_SUPER_ADMIN", assurance: "step_up", expiresAt: "2026-10-17T02:00:00.000Z" }], pendingRequests: 0 } })
  }));
  await page.route("**/v1/admin/security-posture", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: {
      activePrivilegedIdentities: 3,
      activePrivilegedSessions: 0,
      openHighFindings: 0,
      recoveryRuns: [],
      activeSessions: [],
      rootOperations: [],
      redTeamRuns: [],
      recoveryCheckpoints: []
    } })
  }));
  await page.goto("/#admin/recovery");
  await expect(page.getByRole("heading", { name: "Orchestrateur de récupération" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Journal Root Trust" })).toBeVisible();
  await expect(page.getByText("Aucun run de récupération enregistré.")).toBeVisible();
});

test("Super Admin runtime change requires a second distinct approver", async ({ page }) => {
  let status = "PENDING";
  await page.route("**/v1/admin/overview", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { runtime: { mode: "normal", version: 2 }, privileged: [{ level: "L4_SUPER_ADMIN", assurance: "step_up", expiresAt: "2026-10-17T02:00:00.000Z" }], pendingRequests: 1 } })
  }));
  await page.route("**/v1/admin/runtime/change-requests*", async route => {
    if (route.request().method() === "POST") {
      status = "APPLIED";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { status, approvals: 2 } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [{ id: "00000000-0000-4000-8000-000000000123", mode: "readonly", reason: "Containment drill", status, digestPrefix: "0123456789ab", createdAt: "2026-10-17T01:00:00.000Z", expiresAt: "2026-10-17T01:10:00.000Z", requiredApprovals: 2, approvalCount: status === "APPLIED" ? 2 : 1, approvedByMe: false, canApprove: status === "PENDING" }] } })
    });
  });
  await page.goto("/#admin/runtime");
  await expect(page.getByRole("heading", { name: "Demandes de changement" })).toBeVisible();
  await expect(page.getByText("PENDING · 1/2")).toBeVisible();
  await page.getByRole("button", { name: "Approuver" }).click();
  await expect(page.getByText("APPLIED · 2/2")).toBeVisible();
});
