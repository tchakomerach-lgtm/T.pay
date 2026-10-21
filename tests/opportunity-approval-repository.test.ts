import test from "node:test";
import assert from "node:assert/strict";
import { PostgresOpportunityApprovalRepository } from "../packages/opportunity/src/approval-repository.js";

function transactionDb() {
  const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const state = { committed: false, rolledBack: false };
  const db = {
    async begin() {},
    async commit() { state.committed = true; },
    async rollback() { state.rolledBack = true; },
    async query(sql: string, values?: readonly unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("SELECT id FROM opportunity_approvals")) return { rows: [], rowCount: 0 };
      return { rows: [{ id: values?.[0] ?? "approval-1", approver_id: "approver-2" }], rowCount: 1 };
    },
  };
  return { db, calls, state };
}

const approval = {
  approvalId: "approval-1",
  tenantId: "tenant-a",
  organizationId: "org-a",
  opportunityId: "opp-123",
  command: "PUBLISH" as const,
  requesterId: "requester-1",
  approverId: "approver-2",
  reason: "Independent reviewer approved the publication.",
  evidenceRef: "evidence-123",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

test("OP-1304 refuses self-approval", async () => {
  const { db, calls } = transactionDb();
  const repository = new PostgresOpportunityApprovalRepository(db as never);
  await assert.rejects(
    repository.recordApproved({ ...approval, approverId: approval.requesterId }),
    /OPPORTUNITY_APPROVAL_SEPARATION_OF_DUTIES_REQUIRED/,
  );
  assert.equal(calls.length, 0);
});

test("OP-1304 persists an approval and immutable decision event atomically", async () => {
  const { db, calls, state } = transactionDb();
  const repository = new PostgresOpportunityApprovalRepository(db as never);
  const id = await repository.recordApproved(approval);
  assert.equal(id, "approval-1");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].sql.includes("INSERT INTO opportunity_approvals"), true);
  assert.equal(calls[0].sql.includes("WHERE EXISTS (SELECT 1 FROM opportunities"), true);
  assert.equal(calls[1].sql.includes("INSERT INTO opportunity_approval_events"), true);
  assert.equal(state.committed, true);
  assert.equal(state.rolledBack, false);
});

test("OP-1304 verifier scopes approval to tenant, organization, opportunity, command and requester", async () => {
  const { db, calls } = transactionDb();
  const repository = new PostgresOpportunityApprovalRepository(db as never);
  const valid = await repository.verify({
    approvalId: "approval-1", tenantId: "tenant-a", organizationId: "org-a",
    opportunityId: "opp-123", command: "PUBLISH", requesterId: "requester-1",
  });
  assert.equal(valid, false);
  assert.equal(calls[0].sql.includes("approver_id<>$6"), true);
  assert.deepEqual(calls[0].values, [
    "approval-1", "tenant-a", "org-a", "opp-123", "PUBLISH", "requester-1",
  ]);
});
