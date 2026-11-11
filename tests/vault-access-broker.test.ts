import test from "node:test";
import assert from "node:assert/strict";
import { authorizeDataCompartment, type DataCompartmentRequest } from "../packages/security/data-compartment-policy.js";

const base: DataCompartmentRequest = {
  plane: "ORGANIZATION", now: "2026-11-11T10:00:00.000Z",
  tenantId: "tenant-1", organizationId: "school-1",
  subjectRef: "opaque-student-1", moduleCode: "school",
  requestedPermission: "decrypt",
  compartment: {
    id: "academic-vault", tenantId: "tenant-1", organizationId: "school-1",
    subjectRef: "opaque-student-1", moduleCode: "school",
    vaultId: "vault-academic", dataClass: "academic"
  },
  compartmentId: "academic-vault", vaultId: "vault-academic",
  dataClass: "academic", recordId: "grade-1", recordState: "active",
  actor: { id: "teacher-1", kind: "user", active: true },
  session: {
    id: "user-session-1", kind: "user", expiresAt: "2026-11-11T10:05:00.000Z",
    revokedAt: null, userSessionId: "user-session-1",
    privilegedSessionId: null, assurance: "standard"
  },
  grant: {
    tenantId: "tenant-1", recordId: "grade-1", compartmentId: "academic-vault",
    actorId: "teacher-1", actorKind: "user", permission: "decrypt",
    purposeCode: "grade-review", validFrom: "2026-11-11T09:00:00.000Z",
    validUntil: "2026-11-11T10:03:00.000Z", revokedAt: null,
    maxUses: 1, usesCount: 0
  }
};

test("decrypt requires a matching exact record grant", () => {
  assert.equal(authorizeDataCompartment(base).allowed, true);
  assert.deepEqual(
    authorizeDataCompartment({ ...base, grant: { ...base.grant, recordId: "other-record" } }),
    { allowed: false, reason: "GRANT_SCOPE_MISMATCH" }
  );
});

test("a read-only grant cannot authorize plaintext decryption", () => {
  assert.deepEqual(
    authorizeDataCompartment({
      ...base, requestedPermission: "decrypt",
      grant: { ...base.grant, permission: "read" }
    }),
    { allowed: false, reason: "GRANT_PERMISSION_MISMATCH" }
  );
});

test("Super Admin governance identity cannot enter the data broker", () => {
  const admin: DataCompartmentRequest = {
    ...base, plane: "ADMIN_CONTROL",
    actor: { id: "root-admin", kind: "privileged", active: true },
    session: {
      ...base.session, id: "admin-session", kind: "privileged",
      userSessionId: null, privilegedSessionId: "admin-session",
      assurance: "hardware_key"
    },
    grant: { ...base.grant, actorId: "root-admin", actorKind: "privileged" }
  };
  assert.deepEqual(authorizeDataCompartment(admin), {
    allowed: false, reason: "ADMIN_BREAKGLASS_REQUIRED"
  });
});

test("cross-tenant and sibling-compartment substitution fail closed", () => {
  assert.deepEqual(
    authorizeDataCompartment({ ...base, tenantId: "tenant-2" }),
    { allowed: false, reason: "TENANT_MISMATCH" }
  );
  assert.deepEqual(
    authorizeDataCompartment({
      ...base,
      compartmentId: "health-vault",
      compartment: { ...base.compartment, id: "health-vault", dataClass: "health" }
    }),
    { allowed: false, reason: "COMPARTMENT_MISMATCH" }
  );
});
