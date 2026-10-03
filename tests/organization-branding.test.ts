import test from "node:test";
import assert from "node:assert/strict";
import { registerOrganizationLogo } from "../packages/organization/src/branding.js";

test("organization logo is sanitized before activation and versioned", async () => {
  const calls: string[] = [];
  let active: any;
  let savedBranding: any;
  const logo = await registerOrganizationLogo({
    organizationId: "org-1" as never,
    source: "uploaded",
    assetRef: "upload://untrusted.svg",
    mimeType: "image/svg+xml",
    replaceActive: true
  }, {
    logos: {
      findActive: async () => active,
      archiveActive: async (_org, at) => { calls.push("archive:"+at); active = undefined; },
      insert: async x => { calls.push("insert:"+x.status); active = x; },
      activate: async (_org, id) => calls.push("activate:"+id)
    },
    branding: { save: async x => { savedBranding = x; calls.push("branding"); } },
    scanner: {
      sanitizeAndScan: async input => {
        calls.push("scan:"+input.assetRef);
        return { sanitizedAssetRef: "safe://logo-v1.svg", sha256: "a".repeat(64) };
      }
    },
    ids: { next: () => "logo-1" as never },
    clock: { now: () => "2026-10-03T12:00:00.000Z" }
  });
  assert.equal(logo.status, "active");
  assert.equal(logo.sanitizedAssetRef, "safe://logo-v1.svg");
  assert.equal(logo.version, 1);
  assert.equal(savedBranding.activeLogoId, logo.id);
  assert.deepEqual(calls.slice(0, 3), [
    "scan:upload://untrusted.svg",
    "insert:active",
    "activate:logo-1"
  ]);
});

test("an active logo cannot be replaced accidentally", async () => {
  await assert.rejects(() => registerOrganizationLogo({
    organizationId: "org-1" as never,
    source: "generated",
    assetRef: "generated://logo",
    mimeType: "image/svg+xml",
    replaceActive: false
  }, {
    logos: { findActive: async () => ({ version: 4 } as any), archiveActive: async () => {}, insert: async () => {}, activate: async () => {} },
    branding: { save: async () => {} },
    scanner: { sanitizeAndScan: async () => ({ sanitizedAssetRef: "safe", sha256: "b".repeat(64) }) },
    ids: { next: () => "logo-2" as never },
    clock: { now: () => "2026-10-03T12:00:00.000Z" }
  }), /ACTIVE_ORGANIZATION_LOGO_EXISTS/);
});

test("untrusted scanner output cannot activate without a content hash", async () => {
  await assert.rejects(() => registerOrganizationLogo({
    organizationId: "org-1" as never,
    source: "uploaded",
    assetRef: "upload://x",
    mimeType: "image/png",
    replaceActive: true
  }, {
    logos: { findActive: async () => undefined, archiveActive: async () => {}, insert: async () => {}, activate: async () => {} },
    branding: { save: async () => {} },
    scanner: { sanitizeAndScan: async () => ({ sanitizedAssetRef: "safe", sha256: "" }) },
    ids: { next: () => "logo-3" as never },
    clock: { now: () => "2026-10-03T12:00:00.000Z" }
  }), /LOGO_SANITIZATION_REQUIRED/);
});
