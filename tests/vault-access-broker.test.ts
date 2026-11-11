import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { VaultAccessBroker, type CompartmentCryptoProvider } from "../packages/security/vault-access-broker.js";
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


function digest(value: string | Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

function brokerFixture(options?: { auditFails?: boolean }) {
  const events: string[] = [];
  const audit: Array<{ decision: unknown; reason: unknown }> = [];
  const aad = Buffer.from(JSON.stringify({
    tenantId: "tenant-1",
    organizationId: "school-1",
    moduleCode: "school",
    subjectRef: "opaque-student-1",
    compartmentId: "academic-vault",
    recordId: "grade-1",
    recordType: "grade",
    schemaVersion: 1,
    keyVersion: 1
  }), "utf8");
  const plaintext = Buffer.from("verified-grade-payload");
  const row = {
    tenant_id: "tenant-1", organization_id: "school-1",
    compartment_id: "academic-vault", id: "grade-1",
    record_type: "grade", schema_version: 1, key_version: 1,
    kms_key_ref: "kms://test/key/1", wrapped_data_key: Buffer.from("wrapped"),
    algorithm: "AES-256-GCM" as const, nonce: Buffer.alloc(12, 1),
    ciphertext: Buffer.from("ciphertext"), auth_tag: Buffer.alloc(16, 2),
    aad_sha256: digest(aad), payload_sha256: digest(plaintext)
  };
  const client = {
    async query(sql: string, params: unknown[] = []) {
      if (sql === "BEGIN") { events.push("begin"); return { rows: [], rowCount: 0 }; }
      if (sql === "COMMIT") { events.push("commit"); return { rows: [], rowCount: 0 }; }
      if (sql === "ROLLBACK") { events.push("rollback"); return { rows: [], rowCount: 0 }; }
      if (sql.includes("SELECT id FROM tpay_data_record_grants")) {
        events.push("grant-select");
        return { rows: [{ id: "grant-1" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE tpay_data_record_grants")) {
        events.push("grant-consume");
        return { rows: [{ grant_id: "grant-1" }], rowCount: 1 };
      }
      if (sql.includes("FROM tpay_data_records r")) {
        events.push("record-load");
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO tpay_data_access_audit")) {
        events.push("audit");
        audit.push({ decision: params[9], reason: params[10] });
        if (options?.auditFails) throw new Error("AUDIT_WRITE_FAILED");
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { events.push("release"); }
  };
  const pool = {
    async connect() { return client; }
  } as unknown as Pool;
  return { pool, events, audit, plaintext, row };
}

test("broker records allowed only after KMS decryption and payload verification", async () => {
  const fixture = brokerFixture();
  const crypto: CompartmentCryptoProvider = {
    async decryptRecord() {
      fixture.events.push("crypto-success");
      return Buffer.from(fixture.plaintext);
    }
  };
  const broker = new VaultAccessBroker(fixture.pool, crypto);
  const result = await broker.readRecord({
    authorization: base, purposeCode: "grade-review", correlationId: "corr-success"
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(fixture.audit, [{
    decision: "allowed", reason: "EXACT_GRANT_DECRYPTED_AND_VERIFIED"
  }]);
  assert.ok(fixture.events.indexOf("crypto-success") < fixture.events.indexOf("audit"));
  assert.ok(fixture.events.indexOf("audit") < fixture.events.indexOf("commit"));
});

test("broker records cryptographic failure as denied and never as allowed", async () => {
  const fixture = brokerFixture();
  const crypto: CompartmentCryptoProvider = {
    async decryptRecord() {
      fixture.events.push("crypto-failure");
      throw new Error("KMS_UNAVAILABLE");
    }
  };
  const broker = new VaultAccessBroker(fixture.pool, crypto);
  const result = await broker.readRecord({
    authorization: base, purposeCode: "grade-review", correlationId: "corr-kms-failure"
  });
  assert.deepEqual(result, { allowed: false, reason: "CRYPTOGRAPHIC_DECRYPTION_FAILED" });
  assert.equal(fixture.audit[0]?.decision, "denied");
  assert.equal(fixture.audit[0]?.reason, "CRYPTOGRAPHIC_DECRYPTION_FAILED");
  assert.ok(fixture.events.indexOf("crypto-failure") < fixture.events.indexOf("audit"));
  assert.ok(fixture.events.includes("commit"));
});

test("broker rolls back consumed grant and withholds plaintext when audit persistence fails", async () => {
  const fixture = brokerFixture({ auditFails: true });
  const crypto: CompartmentCryptoProvider = {
    async decryptRecord() {
      fixture.events.push("crypto-success");
      return Buffer.from(fixture.plaintext);
    }
  };
  const broker = new VaultAccessBroker(fixture.pool, crypto);
  await assert.rejects(
    broker.readRecord({
      authorization: base, purposeCode: "grade-review", correlationId: "corr-audit-failure"
    }),
    /AUDIT_WRITE_FAILED/
  );
  assert.ok(fixture.events.includes("rollback"));
  assert.ok(!fixture.events.includes("commit"));
});


test("broker bounds a stalled KMS/HSM request and audits timeout as denied", async () => {
  const fixture = brokerFixture();
  const crypto: CompartmentCryptoProvider = {
    async decryptRecord() {
      fixture.events.push("crypto-started");
      return new Promise<Buffer>(() => undefined);
    }
  };
  const broker = new VaultAccessBroker(fixture.pool, crypto, 10);
  const result = await broker.readRecord({
    authorization: base, purposeCode: "grade-review", correlationId: "corr-timeout"
  });
  assert.deepEqual(result, { allowed: false, reason: "CRYPTOGRAPHIC_TIMEOUT" });
  assert.equal(fixture.audit[0]?.decision, "denied");
  assert.equal(fixture.audit[0]?.reason, "CRYPTOGRAPHIC_TIMEOUT");
  assert.ok(fixture.events.includes("commit"));
});

test("broker rejects plaintext whose authenticated payload hash does not match", async () => {
  const fixture = brokerFixture();
  const crypto: CompartmentCryptoProvider = {
    async decryptRecord() {
      return Buffer.from("tampered-payload");
    }
  };
  const broker = new VaultAccessBroker(fixture.pool, crypto);
  const result = await broker.readRecord({
    authorization: base, purposeCode: "grade-review", correlationId: "corr-hash-mismatch"
  });
  assert.deepEqual(result, { allowed: false, reason: "PAYLOAD_HASH_MISMATCH" });
  assert.equal(fixture.audit[0]?.decision, "denied");
  assert.equal(fixture.audit[0]?.reason, "PAYLOAD_HASH_MISMATCH");
});
