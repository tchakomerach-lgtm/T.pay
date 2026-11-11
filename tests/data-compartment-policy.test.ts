import test from "node:test";
import assert from "node:assert/strict";
import { authorizeDataCompartment, type DataCompartmentRequest } from "../packages/security/data-compartment-policy.js";

const base: DataCompartmentRequest = {
  plane: "ORGANIZATION",
  now: "2026-11-11T10:00:00.000Z",
  tenantId: "tenant-1",
  organizationId: "school-1",
  subjectRef: "opaque-student-subject",
  moduleCode: "school",
  requestedPermission: "read",
  compartment: {
    id: "student-academic", tenantId: "tenant-1", organizationId: "school-1",
    subjectRef: "opaque-student-subject", moduleCode: "school",
    vaultId: "vault-academic", dataClass: "academic"
  },
  compartmentId: "student-academic",
  vaultId: "vault-academic",
  dataClass: "academic",
  recordId: "grade-record-1",
  recordState: "active",
  actor: { id: "teacher-1", kind: "user", active: true },
  session: {
    id: "session-1", kind: "user", expiresAt: "2026-11-11T10:10:00.000Z",
    revokedAt: null, userSessionId: "session-1", privilegedSessionId: null,
    assurance: "standard"
  },
  grant: {
    tenantId: "tenant-1", recordId: "grade-record-1",
    compartmentId: "student-academic", actorId: "teacher-1",
    actorKind: "user", permission: "read", purposeCode: "grade-entry-review",
    validFrom: "2026-11-11T09:00:00.000Z",
    validUntil: "2026-11-11T10:05:00.000Z",
    revokedAt: null, maxUses: 5, usesCount: 1
  }
};

test("exact scoped record grant allows the matching actor", () => {
  assert.equal(authorizeDataCompartment(base).allowed, true);
});

test("a compromised session alone has no access without exact grant", () => {
  assert.deepEqual(
    authorizeDataCompartment({ ...base, grant: { ...base.grant, actorId: "another-user" } }),
    { allowed: false, reason: "GRANT_SCOPE_MISMATCH" }
  );
});

test("permission and compartment metadata must match exactly", () => {
  assert.deepEqual(
    authorizeDataCompartment({ ...base, requestedPermission: "decrypt" }),
    { allowed: false, reason: "GRANT_PERMISSION_MISMATCH" }
  );
  assert.deepEqual(
    authorizeDataCompartment({ ...base, compartment: { ...base.compartment, tenantId: "tenant-other" } }),
    { allowed: false, reason: "TENANT_MISMATCH" }
  );
  assert.deepEqual(
    authorizeDataCompartment({ ...base, compartment: { ...base.compartment, organizationId: "other-school" } }),
    { allowed: false, reason: "ORGANIZATION_MISMATCH" }
  );
});


test("USER plane cannot silently enter an organization-owned compartment", () => {
  assert.deepEqual(
    authorizeDataCompartment({ ...base, plane: "USER", organizationId: null }),
    { allowed: false, reason: "ORGANIZATION_MISMATCH" }
  );
});

test("a grant for one student record cannot open another record or compartment", () => {
  assert.deepEqual(
    authorizeDataCompartment({ ...base, recordId: "different-student-record" }),
    { allowed: false, reason: "GRANT_SCOPE_MISMATCH" }
  );
  assert.deepEqual(
    authorizeDataCompartment({
      ...base,
      compartmentId: "student-health",
      compartment: { ...base.compartment, id: "student-health" }
    }),
    { allowed: false, reason: "GRANT_SCOPE_MISMATCH" }
  );
});

test("expired, revoked, exhausted and sealed data fail closed", () => {
  assert.deepEqual(
    authorizeDataCompartment({ ...base, grant: { ...base.grant, validUntil: "2026-11-11T09:59:59.000Z" } }),
    { allowed: false, reason: "GRANT_EXPIRED" }
  );
  assert.deepEqual(
    authorizeDataCompartment({ ...base, grant: { ...base.grant, revokedAt: base.now } }),
    { allowed: false, reason: "GRANT_REVOKED" }
  );
  assert.deepEqual(
    authorizeDataCompartment({ ...base, grant: { ...base.grant, maxUses: 1 } }),
    { allowed: false, reason: "GRANT_EXHAUSTED" }
  );
  assert.deepEqual(
    authorizeDataCompartment({ ...base, recordState: "sealed" }),
    { allowed: false, reason: "RECORD_NOT_ACTIVE" }
  );
});

test("Super Admin requires break-glass and cannot use its session as a data key", () => {
  const admin = {
    ...base,
    plane: "ADMIN_CONTROL" as const,
    actor: { id: "root", kind: "privileged" as const, active: true },
    session: {
      ...base.session, id: "admin-session", kind: "privileged" as const,
      userSessionId: null, privilegedSessionId: "admin-session",
      assurance: "hardware_key" as const
    }
  };
  assert.deepEqual(authorizeDataCompartment(admin), { allowed: false, reason: "ADMIN_BREAKGLASS_REQUIRED" });
});

test("workload identity must be attested and cannot impersonate a user", () => {
  const service = {
    ...base,
    plane: "SERVICE" as const,
    actor: { id: "school-service", kind: "workload" as const, active: true },
    session: { ...base.session, kind: "workload" as const, userSessionId: null, assurance: "attested_workload" as const }
  };
  assert.equal(authorizeDataCompartment(service).allowed, true);
  assert.deepEqual(
    authorizeDataCompartment({ ...service, session: { ...service.session, userSessionId: "session-1" } }),
    { allowed: false, reason: "SERVICE_ATTESTATION_REQUIRED" }
  );
});
