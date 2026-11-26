import test from "node:test";
import assert from "node:assert/strict";
import type { Permission } from "../packages/security/src/policy.js";
import {
  resolveCommunityTontineIdentity,
  resolveOrganizationDomainIdentity,
  type IdentityRuntimeClient,
  type IdentityRuntimePool
} from "../packages/identity/src/postgres-runtime.js";

const now = new Date("2026-11-17T06:00:00.000Z");
const apiSession = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  actorId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  issuedAt: "2026-11-17T05:00:00.000Z",
  expiresAt: "2026-11-17T07:00:00.000Z"
};
const bootstrapRow = {
  id: "44444444-4444-4444-8444-444444444444",
  subject_id: "55555555-5555-4555-8555-555555555555",
  tenant_id: "tenant-alpha",
  organization_id: apiSession.organizationId,
  actor_link_id: "66666666-6666-4666-8666-666666666666",
  assurance: "step_up",
  issued_at: apiSession.issuedAt,
  expires_at: apiSession.expiresAt,
  revoked_at: null
};
const resolvedRow = {
  identity_session_id: bootstrapRow.id,
  subject_id: bootstrapRow.subject_id,
  tenant_id: bootstrapRow.tenant_id,
  organization_id: bootstrapRow.organization_id,
  assurance: "step_up",
  issued_at: apiSession.issuedAt,
  expires_at: apiSession.expiresAt,
  subject_status: "active",
  actor_id: apiSession.actorId,
  domain_code: "community_tontine",
  actor_link_status: "active",
  tenant_membership_status: "active",
  tenant_membership_valid_from: "2026-01-01T00:00:00.000Z",
  tenant_membership_valid_until: null,
  tenant_membership_revoked_at: null,
  membership_id: "77777777-7777-4777-8777-777777777777",
  organization_membership_status: "active",
  organization_membership_valid_from: "2026-01-01T00:00:00.000Z",
  organization_membership_valid_until: null,
  organization_membership_revoked_at: null,
  tenant_status: "active",
  organization_tenant_status: "active"
};

function fakePool(options: { noBootstrap?: boolean; grants?: Record<string, unknown>[] } = {}) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client: IdentityRuntimeClient = {
    async query(sql, values) {
      calls.push({ sql, ...(values === undefined ? {} : { values }) });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" || sql.includes("set_config")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, subject_id, tenant_id, organization_id, actor_link_id")) {
        return { rows: options.noBootstrap ? [] : [bootstrapRow] };
      }
      if (sql.includes("FROM identity_sessions s")) return { rows: [resolvedRow] };
      if (sql.includes("FROM identity_permission_grants")) {
        return { rows: options.grants ?? [{ permission: "community.tontine.read" }, { permission: "finance.read" }] };
      }
      throw new Error("UNEXPECTED_SQL");
    },
    release() { calls.push({ sql: "RELEASE" }); }
  };
  const pool: IdentityRuntimePool = { async connect() { return client; } };
  return { pool, calls };
}

test("Community Tontine identity is resolved inside transaction-local tenant and organization scope", async () => {
  const { pool, calls } = fakePool();
  const context = await resolveCommunityTontineIdentity(pool, apiSession, now);
  assert.equal(context.subjectId, bootstrapRow.subject_id);
  assert.equal(context.tenantId, "tenant-alpha");
  assert.equal(context.organizationId, apiSession.organizationId);
  assert.equal(context.membershipId, resolvedRow.membership_id);
  assert.deepEqual(context.permissions, ["community.tontine.read"]);
  assert.equal(context.assurance, "step_up");
  assert.ok(calls.findIndex(x => x.sql.includes("tpay.api_session_id")) <
    calls.findIndex(x => x.sql.includes("FROM identity_sessions") && x.sql.includes("api_session_id")));
  assert.ok(calls.some(x => x.sql.includes("tpay.tenant_id")));
  assert.ok(calls.some(x => x.sql.includes("tpay.organization_id")));
  assert.equal(calls.at(-2)?.sql, "COMMIT");
  assert.equal(calls.at(-1)?.sql, "RELEASE");
});

test("unprovisioned identity session fails closed and rolls back", async () => {
  const { pool, calls } = fakePool({ noBootstrap: true });
  await assert.rejects(
    resolveCommunityTontineIdentity(pool, apiSession, now),
    /IDENTITY_SESSION_NOT_PROVISIONED/
  );
  assert.ok(calls.some(x => x.sql === "ROLLBACK"));
  assert.equal(calls.at(-1)?.sql, "RELEASE");
});

test("identity resolver denies a session without a Community permission grant", async () => {
  const { pool, calls } = fakePool({ grants: [{ permission: "finance.read" }] });
  await assert.rejects(
    resolveCommunityTontineIdentity(pool, apiSession, now),
    /COMMUNITY_TONTINE_PERMISSIONS_EMPTY/
  );
  assert.ok(calls.some(x => x.sql === "ROLLBACK"));
});

test("domain identity resolver applies an explicit non-Education domain and permission allowlist", async () => {
  const { pool, calls } = fakePool({
    grants: [
      { permission: "health.record.read" },
      { permission: "community.tontine.read" },
      { permission: "finance.read" }
    ]
  });
  const context = await resolveOrganizationDomainIdentity(
    pool,
    apiSession,
    "health",
    new Set<Permission>(["health.record.read", "health.record.write"]),
    now
  );
  assert.deepEqual(context.permissions, ["health.record.read"]);
  const membershipQuery = calls.find(x => x.sql.includes("FROM identity_sessions s"));
  const grantQuery = calls.find(x => x.sql.includes("FROM identity_permission_grants"));
  assert.equal(membershipQuery?.values?.[3], "health");
  assert.equal(grantQuery?.values?.[3], "health");
});

test("domain identity resolver rejects an empty permission allowlist", async () => {
  const { pool } = fakePool();
  await assert.rejects(
    resolveOrganizationDomainIdentity(pool, apiSession, "health", new Set<Permission>(), now),
    /IDENTITY_DOMAIN_PERMISSION_ALLOWLIST_REQUIRED/
  );
});

test("domain identity resolver rejects malformed domain codes", async () => {
  const { pool } = fakePool();
  await assert.rejects(
    resolveOrganizationDomainIdentity(pool, apiSession, "../education", new Set<Permission>(["health.record.read"]), now),
    /IDENTITY_DOMAIN_CODE_INVALID/
  );
});
