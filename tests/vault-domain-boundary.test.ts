import test from "node:test";
import assert from "node:assert/strict";
import { authorizeVaultBoundary, type VaultBoundaryRequest } from "../packages/security/vault-domain-boundary.js";

const base = (): VaultBoundaryRequest => ({
  plane: "ADMIN_CONTROL",
  vault: { id: "vault-admin", tenantId: "__platform__", organizationId: null, vaultClass: "super_admin", status: "active" },
  principal: { id: "privileged-1", kind: "privileged", active: true },
  session: { id: "admin-session-1", kind: "privileged", assurance: "hardware_key", expiresAt: "2026-11-10T13:00:00.000Z", revokedAt: null },
  requestedPermission: "read",
  grant: { vaultId: "vault-admin", actorId: "privileged-1", permission: "read", validFrom: "2026-11-10T12:00:00.000Z", validUntil: "2026-11-10T12:30:00.000Z", revokedAt: null },
  context: { tenantId: "__platform__", organizationId: null, userSessionId: null, privilegedSessionId: "admin-session-1", now: "2026-11-10T12:10:00.000Z" }
});

test("Admin Control Plane accepts only its own hardware-backed privileged session and platform vault", () => {
  assert.deepEqual(authorizeVaultBoundary(base()), {
    allowed: true, plane: "ADMIN_CONTROL", vaultId: "vault-admin", permission: "read"
  });
});

test("ordinary user session cannot be elevated into Super Admin by step-up assurance", () => {
  const request = base();
  request.principal.kind = "user";
  request.session.kind = "user";
  request.session.assurance = "hardware_key";
  request.context.userSessionId = request.session.id;
  request.context.privilegedSessionId = null;
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "ADMIN_PLANE_REQUIRES_PRIVILEGED_SESSION"
  });
});

test("Admin Control Plane rejects any inherited user-session context", () => {
  const request = base();
  request.context.userSessionId = "ordinary-user-session";
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "ADMIN_PLANE_USER_CONTEXT_FORBIDDEN"
  });
});

test("ordinary User Plane cannot read or decrypt the Super Admin vault", () => {
  const request = base();
  request.plane = "USER";
  request.principal.kind = "user";
  request.session.kind = "user";
  request.context.userSessionId = request.session.id;
  request.context.privilegedSessionId = null;
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "USER_PLANE_CANNOT_ACCESS_ADMIN_VAULT"
  });
});

test("organization vault access is bound to exact tenant and organization", () => {
  const request = base();
  request.plane = "ORGANIZATION";
  request.vault = { id: "org-vault", tenantId: "tenant-a", organizationId: "org-a", vaultClass: "finance", status: "active" };
  request.principal = { id: "actor-a", kind: "user", active: true };
  request.session = { id: "user-session-a", kind: "user", assurance: "standard", expiresAt: "2026-11-10T13:00:00.000Z", revokedAt: null };
  request.grant = { vaultId: "org-vault", actorId: "actor-a", permission: "read", validFrom: "2026-11-10T12:00:00.000Z", validUntil: null, revokedAt: null };
  request.context = { tenantId: "tenant-a", organizationId: "org-b", userSessionId: "user-session-a", privilegedSessionId: null, now: "2026-11-10T12:10:00.000Z" };
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "ORGANIZATION_SCOPE_MISMATCH"
  });
});

test("a parent vault grant is not inherited by a child vault", () => {
  const request = base();
  request.grant.vaultId = "parent-vault";
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "GRANT_SCOPE_MISMATCH"
  });
});

test("a read grant cannot authorize decryption", () => {
  const request = base();
  request.requestedPermission = "decrypt";
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "VAULT_PERMISSION_MISMATCH"
  });
});

test("expired and revoked privileged sessions fail closed", () => {
  const expired = base();
  expired.session.expiresAt = "2026-11-10T12:00:00.000Z";
  assert.deepEqual(authorizeVaultBoundary(expired), { allowed: false, reason: "SESSION_EXPIRED" });
  const revoked = base();
  revoked.session.revokedAt = "2026-11-10T12:05:00.000Z";
  assert.deepEqual(authorizeVaultBoundary(revoked), { allowed: false, reason: "SESSION_REVOKED" });
});

test("Admin Control Plane requires exact hardware assurance", () => {
  const request = base();
  request.session.assurance = "webauthn_uv";
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "ADMIN_PLANE_HARDWARE_ASSURANCE_REQUIRED"
  });
});
test("attested Service Plane cannot inherit an end-user session", () => {
  const request = base();
  request.plane = "SERVICE";
  request.vault = { id: "service-vault", tenantId: "tenant-a", organizationId: null, vaultClass: "ai", status: "active" };
  request.principal = { id: "workload-1", kind: "workload", active: true };
  request.session = { id: "workload-session-1", kind: "workload", assurance: "attested_workload", expiresAt: "2026-11-10T13:00:00.000Z", revokedAt: null };
  request.grant = { vaultId: "service-vault", actorId: "workload-1", permission: "read", validFrom: "2026-11-10T12:00:00.000Z", validUntil: null, revokedAt: null };
  request.context = { tenantId: "tenant-a", organizationId: null, userSessionId: "user-session-1", privilegedSessionId: null, now: "2026-11-10T12:10:00.000Z" };
  assert.deepEqual(authorizeVaultBoundary(request), {
    allowed: false, reason: "SERVICE_PLANE_USER_CONTEXT_FORBIDDEN"
  });
});
