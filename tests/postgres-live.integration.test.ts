import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresDurableTontineSettlementRepository } from "../packages/finance/src/postgres-settlement-uow.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("S-02.5 live PostgreSQL migration is idempotent and enforces financial invariants", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const accountA = randomUUID();
  const accountB = randomUUID();
  const transactionId = randomUUID();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const migrationCount = await client.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version = $1", ["001"]);
    assert.equal(migrationCount.rows[0]?.count, 1);

    await client.query("INSERT INTO organizations (id, name, status, created_at) VALUES ($1, $2, $3, now())", [organizationId, "S-02.5 test", "active"]);
    await client.query("INSERT INTO financial_accounts (id, organization_id, code, name, kind, currency, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()),($8,$2,$9,$10,$11,$6,$7,now())", [accountA, organizationId, "TEST-CASH", "Test cash", "asset", "XOF", "active", accountB, "TEST-CLEARING", "Test clearing", "liability"]);

    const repository = new PostgresDurableTontineSettlementRepository(client);
    const result = await repository.runAtomic({ organizationId: organizationId as never, idempotencyKey: "live-s02.5", isolation: "serializable" }, async tx => {
      await tx.ledger.append({
        id: transactionId as never,
        organizationId: organizationId as never,
        idempotencyKey: "live-s02.5",
        occurredAt: new Date().toISOString(),
        postedAt: new Date().toISOString(),
        lines: [
          { accountId: accountA, amount: { currency: "XOF", minor: 1000n }, direction: "debit" },
          { accountId: accountB, amount: { currency: "XOF", minor: 1000n }, direction: "credit" }
        ]
      });
      return tx.transactionId;
    });
    assert.ok(result.length > 0);

    const persisted = await client.query("SELECT count(*)::int AS count FROM ledger_transactions WHERE id = $1", [transactionId]);
    assert.equal(persisted.rows[0]?.count, 1);

    const rollbackId = randomUUID();
    await assert.rejects(repository.runAtomic({ organizationId: organizationId as never, idempotencyKey: "live-rollback", isolation: "serializable" }, async tx => {
      await tx.ledger.append({ id: rollbackId as never, organizationId: organizationId as never, idempotencyKey: "live-rollback", occurredAt: new Date().toISOString(), postedAt: new Date().toISOString(), lines: [
        { accountId: accountA, amount: { currency: "XOF", minor: 500n }, direction: "debit" },
        { accountId: accountB, amount: { currency: "XOF", minor: 500n }, direction: "credit" }
      ] });
      throw new Error("FORCED_ATOMIC_ROLLBACK");
    }), /FORCED_ATOMIC_ROLLBACK/);
    const rolledBack = await client.query("SELECT count(*)::int AS count FROM ledger_transactions WHERE id = $1", [rollbackId]);
    assert.equal(rolledBack.rows[0]?.count, 0);
  } finally {
    await client.query("DELETE FROM ledger_lines WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE organization_id = $1)", [organizationId]);
    await client.query("DELETE FROM ledger_transactions WHERE organization_id = $1", [organizationId]);
    await client.query("DELETE FROM financial_accounts WHERE organization_id = $1", [organizationId]);
    await client.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    await client.end();
  }
});