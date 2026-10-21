import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { PostgresOpportunityLifecycleRepository } from "../packages/opportunity/src/postgres-lifecycle-repository.js";

function fingerprint(input: {
  tenantId: string; organizationId: string; opportunityId: string;
  actorId: string; actorClass: string; command: string; approvalId?: string; humanApproval?: boolean;
}): string {
  return createHash("sha256").update(JSON.stringify([
    input.tenantId, input.organizationId, input.opportunityId,
    input.actorId, input.actorClass, input.command, input.approvalId ?? null,
    input.humanApproval === true,
  ])).digest("hex");
}

function duplicateDb(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const db = {
    async begin() { calls.push("begin"); },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      return {
        rows: [{
          opportunity_id: "opp-123",
          to_state: "PUBLISHED",
          version: "2",
          command: "PUBLISH",
          actor_id: "user-123",
          actor_class: "OWNER",
          approval_id: null,
          request_fingerprint: fingerprint({
            tenantId: "tenant-a", organizationId: "org-a", opportunityId: "opp-123",
            actorId: "user-123", actorClass: "OWNER", command: "PUBLISH",
          }),
          ...overrides,
        }],
        rowCount: 1,
      };
    },
  };
  return { db, calls };
}

const request = {
  tenantId: "tenant-a",
  organizationId: "org-a",
  opportunityId: "opp-123",
  actorId: "user-123",
  actorClass: "OWNER" as const,
  command: "PUBLISH" as const,
  idempotencyKey: "request-key-123456789",
};

test("OP-1302 returns the original result only for an identical request", async () => {
  const { db, calls } = duplicateDb();
  const repository = new PostgresOpportunityLifecycleRepository(db as never);
  const result = await repository.transition(request);
  assert.equal(result.idempotent, true);
  assert.equal(result.opportunityId, "opp-123");
  assert.equal(result.state, "PUBLISHED");
  assert.equal(result.version, 2n);
  assert.equal(calls.includes("commit"), true);
  assert.equal(calls.includes("rollback"), false);
  assert.equal(calls.some(sql => sql.includes("pg_advisory_xact_lock")), true);
});

test("OP-1302 rejects a reused key for a different command context", async () => {
  const { db, calls } = duplicateDb();
  const repository = new PostgresOpportunityLifecycleRepository(db as never);
  await assert.rejects(
    repository.transition({ ...request, opportunityId: "opp-other" }),
    /OPPORTUNITY_IDEMPOTENCY_KEY_REUSED/,
  );
  assert.equal(calls.includes("rollback"), true);
  assert.equal(calls.includes("commit"), false);
});

test("OP-1302 legacy events without fingerprints are still checked against persisted fields", async () => {
  const { db, calls } = duplicateDb({ request_fingerprint: null });
  const repository = new PostgresOpportunityLifecycleRepository(db as never);
  const result = await repository.transition(request);
  assert.equal(result.idempotent, true);
  assert.equal(calls.includes("commit"), true);
});
