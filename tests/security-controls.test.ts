import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSecurityRequest,
  securityRequestDigest,
  type SecurityRequest,
} from "../apps/security/security-controls.js";

const base: SecurityRequest = {
  requestId: "req-1",
  actorId: "user-1",
  tenantId: "org-1",
  resource: "wallet:123",
  action: "view",
  occurredAt: "2026-10-05T10:00:00.000Z",
  source: "user",
  capability: {
    id: "cap-1",
    expiresAt: "2026-10-05T11:00:00.000Z",
    allowedActions: ["view"],
    allowedResources: ["wallet:123"],
  },
  permission: {
    actorId: "user-1",
    tenantId: "org-1",
    resource: "wallet:123",
    action: "view",
    startsAt: "2026-10-05T09:00:00.000Z",
    expiresAt: "2026-10-05T10:30:00.000Z",
    timezone: "Africa/Lome",
  },
};

test("allows an active, tenant-bound request", () => {
  assert.deepEqual(
    evaluateSecurityRequest(base, "2026-10-05T10:05:00.000Z"),
    { decision: "ALLOW", reason: "VALID" },
  );
});

test("fails closed on cross-tenant capability", () => {
  assert.deepEqual(
    evaluateSecurityRequest(
      { ...base, capability: { ...base.capability!, tenantId: "org-evil" } },
      "2026-10-05T10:05:00.000Z",
    ),
    { decision: "DENY", reason: "TENANT_MISMATCH" },
  );
});

test("fails closed after capability expiry", () => {
  assert.deepEqual(
    evaluateSecurityRequest(base, "2026-10-05T11:00:00.000Z"),
    { decision: "DENY", reason: "CAPABILITY_EXPIRED" },
  );
});

test("fails closed outside temporal permission window", () => {
  assert.deepEqual(
    evaluateSecurityRequest(base, "2026-10-05T08:59:59.000Z"),
    { decision: "DENY", reason: "PERMISSION_NOT_ACTIVE" },
  );
});

test("does not allow an emergency request without a reason and live expiry", () => {
  assert.deepEqual(
    evaluateSecurityRequest(
      { ...base, emergency: { enabled: true, reason: " ", expiresAt: "2026-10-05T10:20:00.000Z" } },
      "2026-10-05T10:05:00.000Z",
    ),
    { decision: "DENY", reason: "EMERGENCY_INVALID" },
  );
});

test("requires human approval for high-impact capability", () => {
  assert.deepEqual(
    evaluateSecurityRequest(
      { ...base, capability: { ...base.capability!, requiresHumanApproval: true } },
      "2026-10-05T10:05:00.000Z",
    ),
    { decision: "REQUIRE_HUMAN_APPROVAL", reason: "HUMAN_APPROVAL_REQUIRED" },
  );
});

test("request digest is deterministic and changes with security inputs", () => {
  const a = securityRequestDigest(base);
  const b = securityRequestDigest({ ...base });
  const c = securityRequestDigest({ ...base, action: "transfer" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});
