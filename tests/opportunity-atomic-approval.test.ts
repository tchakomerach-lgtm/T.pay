import test from "node:test";
import assert from "node:assert/strict";
import { PostgresOpportunityLifecycleRepository } from "../packages/opportunity/src/postgres-lifecycle-repository.js";

function transitionDb(options: { approvalValid?: boolean; updateRowCount?: number } = {}) {
  const calls: string[] = [];
  const state = { committed: false, rolledBack: false };
  const db = {
    async begin() {},
    async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; },
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM opportunity_state_events WHERE")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM opportunities WHERE") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "opp-123", state: "DRAFT", version: "0" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE opportunity_approvals")) {
        return options.approvalValid === false
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: "approval-1", approver_id: "reviewer-1" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE opportunities")) return { rows: [], rowCount: options.updateRowCount ?? 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  return { db, calls, state };
}

const command = {
  tenantId: "tenant-a",
  organizationId: "org-a",
  opportunityId: "opp-123",
  actorId: "owner-1",
  actorClass: "OWNER" as const,
  command: "PUBLISH" as const,
  idempotencyKey: "request-key-123456789",
};

test("OP-1304 consumes a scoped approval and audits it in the lifecycle transaction", async () => {
  const { db, calls, state } = transitionDb();
  const repository = new PostgresOpportunityLifecycleRepository(db as never);
  const result = await repository.transition({ ...command, approvalId: "approval-1" });
  assert.equal(result.state, "PUBLISHED");
  assert.equal(result.version, 1n);
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
  const consumeIndex = calls.findIndex(sql => sql.includes("UPDATE opportunity_approvals"));
  const approvalAuditIndex = calls.findIndex(sql => sql.includes("INSERT INTO opportunity_approval_events"));
  const opportunityUpdateIndex = calls.findIndex(sql => sql.includes("UPDATE opportunities SET state"));
  assert.ok(consumeIndex >= 0);
  assert.ok(approvalAuditIndex > consumeIndex);
  assert.ok(opportunityUpdateIndex > approvalAuditIndex);
});

test("OP-1304 rejects a caller-supplied humanApproval boolean without a stored approval", async () => {
  const { db, state } = transitionDb();
  const repository = new PostgresOpportunityLifecycleRepository(db as never);
  await assert.rejects(
    repository.transition({ ...command, humanApproval: true }),
    /OPPORTUNITY_HUMAN_APPROVAL_REQUIRED/,
  );
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, true);
});

test("OP-1304 rolls the transaction back if approval consumption fails", async () => {
  const { db, state } = transitionDb({ approvalValid: false });
  const repository = new PostgresOpportunityLifecycleRepository(db as never);
  await assert.rejects(
    repository.transition({ ...command, approvalId: "approval-1" }),
    /OPPORTUNITY_APPROVAL_INVALID_OR_CONSUMED/,
  );
  assert.equal(state.committed, false);
  assert.equal(state.rolledBack, true);
});
