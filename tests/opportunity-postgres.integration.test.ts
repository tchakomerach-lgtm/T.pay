import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresOpportunityAssuranceRepository } from "../packages/opportunity/src/postgres-repository.js";
import { createActionReceipt } from "../packages/opportunity/src/assurance.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("OP-1293 PostgreSQL assurance repository is tenant/org isolated", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const tenantA = randomUUID(), tenantB = randomUUID(), orgA = randomUUID(), orgB = randomUUID(), claimId = randomUUID();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const repo = new PostgresOpportunityAssuranceRepository(client);
    await repo.saveClaim({ id: claimId, tenantId: tenantA, organizationId: orgA, subjectId: "worker-1", issuerId: "issuer-1", type: "skill", value: "masonry", issuedAt: "2026-10-08T12:00:00.000Z", status: "VERIFIED", confidence: 90, evidenceIds: [], provenance: "field-assessment" });
    assert.ok(await repo.getClaim(tenantA, orgA, claimId));
    assert.equal(await repo.getClaim(tenantB, orgA, claimId), undefined);
    assert.equal(await repo.getClaim(tenantA, orgB, claimId), undefined);
  } finally {
    await client.query("DELETE FROM opportunity_claims WHERE id=$1", [claimId]);
    await client.end();
  }
});

test("OP-1294 PostgreSQL action receipts are append-only", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const tenantId = randomUUID(), organizationId = randomUUID();
  const receipt = createActionReceipt({ tenantId, actorId: "actor-1", organizationId, intent: "opportunity.match", action: "opportunity.read", policyDecision: "ALLOW", expectedEffect: "read candidate", dataClass: "CONFIDENTIAL", createdAt: new Date("2026-10-08T12:00:00.000Z") });
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await new PostgresOpportunityAssuranceRepository(client).appendActionReceipt(receipt);
    await assert.rejects(client.query("UPDATE opportunity_action_receipts SET action='tampered' WHERE id=$1", [receipt.id]), /OPPORTUNITY_ACTION_RECEIPT_IMMUTABLE/);
    await assert.rejects(client.query("DELETE FROM opportunity_action_receipts WHERE id=$1", [receipt.id]), /OPPORTUNITY_ACTION_RECEIPT_IMMUTABLE/);
  } finally {
    await client.query("DELETE FROM opportunity_action_receipts WHERE id=$1", [receipt.id]).catch(() => undefined);
    await client.end();
  }
});

test("OP-1295 PostgreSQL assurance transaction rolls back all writes", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const tenantId = randomUUID(), organizationId = randomUUID(), claimId = randomUUID(), receiptId = randomUUID();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const repo = new PostgresOpportunityAssuranceRepository({
      query: client.query.bind(client),
      begin: async () => { await client.query("BEGIN"); },
      commit: async () => { await client.query("COMMIT"); },
      rollback: async () => { await client.query("ROLLBACK"); },
    });
    const receipt = createActionReceipt({ tenantId, actorId: "actor-1", organizationId, intent: "create", action: "opportunity.create", policyDecision: "ALLOW", expectedEffect: "create opportunity", dataClass: "INTERNAL", createdAt: new Date("2026-10-08T12:00:00.000Z") });
    const originalId = receipt.id;
    Object.defineProperty(receipt, "id", { value: receiptId });
    await assert.rejects(repo.runAtomic(async tx => {
      await tx.saveClaim({ id: claimId, tenantId, organizationId, subjectId: "worker-1", issuerId: "issuer-1", type: "experience", value: "5 years", issuedAt: "2026-10-08T12:00:00.000Z", status: "VERIFIED", confidence: 90, evidenceIds: [], provenance: "verified-employer" });
      await tx.appendActionReceipt(receipt);
      throw new Error("OPPORTUNITY_FORCED_ROLLBACK");
    }), /OPPORTUNITY_FORCED_ROLLBACK/);
    const claim = await client.query("SELECT count(*)::int AS count FROM opportunity_claims WHERE id=$1", [claimId]);
    const persistedReceipt = await client.query("SELECT count(*)::int AS count FROM opportunity_action_receipts WHERE id=$1", [receiptId]);
    assert.equal(claim.rows[0]?.count, 0);
    assert.equal(persistedReceipt.rows[0]?.count, 0);
    void originalId;
  } finally {
    await client.query("DELETE FROM opportunity_claims WHERE id=$1", [claimId]);
    await client.end();
  }
});
