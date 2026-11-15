import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOrganizationPermission,
  resolveOrganizationContext,
  type IdentitySession,
  type OrganizationMembership,
  type TemporalPermissionGrant
} from "../packages/identity/src/organization-context.js";

const now = 1_800_000_000_000;
const session: IdentitySession = {
  id: "session-1", subjectId: "subject-1", tenantId: "tenant-a",
  activeOrganizationId: "org-a", createdAt: now - 1_000, expiresAt: now + 60_000
};
const membership: OrganizationMembership = {
  id: "membership-1", subjectId: "subject-1", tenantId: "tenant-a",
  organizationId: "org-a", status: "active"
};
const grant: TemporalPermissionGrant = {
  id: "grant-1", membershipId: "membership-1", tenantId: "tenant-a",
  organizationId: "org-a", permission: "finance.read",
  validFrom: now - 1_000, expiresAt: now + 10_000
};

test("identity context resolves only active session, tenant and organization membership", () => {
  const context = resolveOrganizationContext({ session, membership, grants: [grant], now });
  assert.equal(context.subjectId, "subject-1");
  assert.equal(context.tenantId, "tenant-a");
  assert.equal(context.organizationId, "org-a");
  assert.deepEqual(context.permissions, ["finance.read"]);
  assertOrganizationPermission(context, "finance.read");
});

test("identity context denies revoked or expired sessions", () => {
  assert.throws(() => resolveOrganizationContext({
    session: { ...session, revokedAt: now - 1 }, membership, grants: [grant], now
  }), /IDENTITY_SESSION_REVOKED/);
  assert.throws(() => resolveOrganizationContext({
    session: { ...session, expiresAt: now }, membership, grants: [grant], now
  }), /IDENTITY_SESSION_EXPIRED/);
});

test("identity context denies cross-subject and cross-tenant memberships", () => {
  assert.throws(() => resolveOrganizationContext({
    session, membership: { ...membership, subjectId: "other-subject" }, grants: [grant], now
  }), /ORGANIZATION_MEMBERSHIP_SUBJECT_MISMATCH/);
  assert.throws(() => resolveOrganizationContext({
    session, membership: { ...membership, tenantId: "tenant-b" }, grants: [grant], now
  }), /ORGANIZATION_MEMBERSHIP_TENANT_MISMATCH/);
});

test("identity context ignores expired, revoked and foreign-scope grants", () => {
  const context = resolveOrganizationContext({
    session, membership,
    grants: [
      grant,
      { ...grant, id: "expired", permission: "finance.approve", expiresAt: now },
      { ...grant, id: "revoked", permission: "ledger.post", revokedAt: now - 1 },
      { ...grant, id: "foreign", permission: "security.manage", organizationId: "org-b" }
    ],
    now
  });
  assert.deepEqual(context.permissions, ["finance.read"]);
  assert.throws(() => assertOrganizationPermission(context, "finance.approve"), /IDENTITY_PERMISSION_DENIED/);
});
