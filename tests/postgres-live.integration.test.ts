import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresDurableTontineSettlementRepository } from "../packages/finance/src/postgres-settlement-uow.js";
import { executeDurableTontineSettlement } from "../packages/microfinance/src/tontine-settlement-uow.js";

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

test("S-03.4 live PostgreSQL atomically settles Ledger, fees, contribution, payment, receipt and outbox", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const cashAccount = randomUUID();
  const tontineAccount = randomUUID();
  const microfinanceFeeAccount = randomUUID();
  const tpayFeeAccount = randomUUID();
  const contributionId = randomUUID();
  const paymentId = randomUUID();
  const ledgerId = randomUUID();
  const receiptId = randomUUID();
  const outboxId = randomUUID();
  const idempotencyKey = "live-s03.4-" + randomUUID();
  const providerEventId = "evt-" + randomUUID();
  const now = "2026-10-03T21:00:00.000Z";
  try {
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)", [organizationId, "S-03.4 live", now]);
    await client.query(
      "INSERT INTO financial_accounts (id,organization_id,code,name,kind,currency,status,created_at) VALUES " +
      "($1,$2,'CASH','Cash','asset','XOF','active',$5),($3,$2,'TONTINE','Tontine liability','liability','XOF','active',$5),($4,$2,'MF-FEE','Microfinance fees payable','liability','XOF','active',$5),($6,$2,'TPAY-FEE','T.Pay fee income','income','XOF','active',$5)",
      [cashAccount, organizationId, tontineAccount, microfinanceFeeAccount, now, tpayFeeAccount]
    );
    await client.query(
      "INSERT INTO tontine_contributions (id,organization_id,group_id,membership_id,amount_minor,currency,idempotency_key,status,channel,scheduled_for,updated_at) VALUES ($1,$2,$3,$4,1000,'XOF',$5,'pending','mobile_money',$6,$6)",
      [contributionId, organizationId, randomUUID(), randomUUID(), idempotencyKey, now]
    );
    await client.query(
      "INSERT INTO tontine_payment_intents (id,organization_id,contribution_id,idempotency_key,amount_minor,currency,provider,provider_reference,status,created_at,updated_at) VALUES ($1,$2,$3,$4,1000,'XOF','tmoney','TM-LIVE','provider_confirmed',$5,$5)",
      [paymentId, organizationId, contributionId, idempotencyKey, now]
    );

    const repository = new PostgresDurableTontineSettlementRepository(client);
    const base = {
      organizationId: organizationId as never,
      paymentIntent: {
        id: paymentId as never, organizationId: organizationId as never, contributionId: contributionId as never,
        idempotencyKey, amountMinor: 1000n, currency: "XOF", provider: "tmoney", providerReference: "TM-LIVE",
        status: "provider_confirmed" as const, createdAt: now, updatedAt: now
      },
      contribution: {
        id: contributionId as never, groupId: randomUUID() as never, membershipId: randomUUID() as never,
        scheduledFor: now, amountMinor: 1000n, currency: "XOF", status: "pending" as const,
        channel: "mobile_money" as const, idempotencyKey
      },
      providerEvent: {
        provider: "tmoney", eventId: providerEventId, paymentId: paymentId as never,
        providerReference: "TM-LIVE", amountMinor: 1000n, currency: "XOF", status: "accepted" as const, occurredAt: now
      },
      feeSnapshot: {
        contributionId: contributionId as never, microfinanceFeeMinor: 10n, tpayFeeMinor: 50n,
        totalFeeMinor: 60n, currency: "XOF", ruleVersion: "v1", calculatedAt: now
      },
      ledgerTransaction: {
        id: ledgerId, organizationId: organizationId as never, idempotencyKey, occurredAt: now, postedAt: now,
        lines: [
          { accountId: cashAccount, amount: { currency: "XOF", minor: 1000n }, direction: "debit" as const },
          { accountId: tontineAccount, amount: { currency: "XOF", minor: 940n }, direction: "credit" as const },
          { accountId: microfinanceFeeAccount, amount: { currency: "XOF", minor: 10n }, direction: "credit" as const },
          { accountId: tpayFeeAccount, amount: { currency: "XOF", minor: 50n }, direction: "credit" as const }
        ]
      },
      receipt: {
        receiptId: receiptId as never, contributionId: contributionId as never, paymentIntentId: paymentId as never,
        providerReference: "TM-LIVE", amountMinor: 1000n, currency: "XOF", issuedAt: now, ledgerTransactionId: ledgerId
      },
      outboxEvent: { id: outboxId, eventType: "tontine.contribution_settled", payload: JSON.stringify({ contributionId }) },
      now
    };

    const first = await executeDurableTontineSettlement(base, repository);
    assert.equal(first.replay, false);
    const counts = await client.query(
      "SELECT " +
      "(SELECT count(*) FROM ledger_transactions WHERE id=$1)::int AS ledger, " +
      "(SELECT count(*) FROM ledger_lines WHERE transaction_id=$1)::int AS lines, " +
      "(SELECT count(*) FROM tontine_fee_snapshots WHERE contribution_id=$2)::int AS fee, " +
      "(SELECT count(*) FROM tontine_receipts WHERE receipt_id=$3)::int AS receipt, " +
      "(SELECT count(*) FROM outbox_events WHERE id=$4)::int AS outbox, " +
      "(SELECT status FROM tontine_contributions WHERE id=$2) AS contribution_status, " +
      "(SELECT status FROM tontine_payment_intents WHERE id=$5) AS payment_status",
      [ledgerId, contributionId, receiptId, outboxId, paymentId]
    );
    assert.deepEqual(counts.rows[0], { ledger: 1, lines: 4, fee: 1, receipt: 1, outbox: 1, contribution_status: "confirmed", payment_status: "settled" });

    const replay = await executeDurableTontineSettlement(base, repository);
    assert.equal(replay.replay, true);
    const ledgerCount = await client.query("SELECT count(*)::int AS count FROM ledger_transactions WHERE idempotency_key=$1", [idempotencyKey]);
    assert.equal(ledgerCount.rows[0]?.count, 1);

    const rollbackContribution = randomUUID();
    const rollbackPayment = randomUUID();
    const rollbackLedger = randomUUID();
    const rollbackReceipt = randomUUID();
    const rollbackOutbox = randomUUID();
    const rollbackEventId = "evt-" + randomUUID();
    const rollbackKey = "live-s03.4-rollback-" + randomUUID();
    await client.query(
      "INSERT INTO tontine_contributions (id,organization_id,group_id,membership_id,amount_minor,currency,idempotency_key,status,scheduled_for,updated_at) VALUES ($1,$2,$3,$4,1000,'XOF',$5,'pending',$6,$6)",
      [rollbackContribution, organizationId, randomUUID(), randomUUID(), rollbackKey, now]
    );
    await client.query(
      "INSERT INTO tontine_payment_intents (id,organization_id,contribution_id,idempotency_key,amount_minor,currency,provider,provider_reference,status,created_at,updated_at) VALUES ($1,$2,$3,$4,1000,'XOF','tmoney','TM-ROLLBACK','provider_confirmed',$5,$5)",
      [rollbackPayment, organizationId, rollbackContribution, rollbackKey, now]
    );
    await assert.rejects(
      executeDurableTontineSettlement({
        ...base,
        paymentIntent: { ...base.paymentIntent, id: rollbackPayment as never, contributionId: rollbackContribution as never, idempotencyKey: rollbackKey, providerReference: "TM-ROLLBACK" },
        contribution: { ...base.contribution, id: rollbackContribution as never, idempotencyKey: rollbackKey },
        providerEvent: { ...base.providerEvent, eventId: rollbackEventId, paymentId: rollbackPayment as never, providerReference: "TM-ROLLBACK" },
        feeSnapshot: { ...base.feeSnapshot, contributionId: rollbackContribution as never },
        ledgerTransaction: { ...base.ledgerTransaction, id: rollbackLedger, idempotencyKey: rollbackKey },
        receipt: { ...base.receipt, receiptId: rollbackReceipt as never, contributionId: rollbackContribution as never, paymentIntentId: rollbackPayment as never, ledgerTransactionId: rollbackLedger },
        outboxEvent: { id: rollbackOutbox, eventType: "tontine.contribution_settled", payload: "{invalid-json" }
      }, repository),
      /Unexpected token|invalid input syntax|JSON/
    );
    const rolled = await client.query(
      "SELECT " +
      "(SELECT count(*) FROM ledger_transactions WHERE id=$1)::int AS ledger, " +
      "(SELECT count(*) FROM provider_events WHERE event_id=$2)::int AS event, " +
      "(SELECT count(*) FROM tontine_fee_snapshots WHERE contribution_id=$3)::int AS fee, " +
      "(SELECT count(*) FROM tontine_receipts WHERE receipt_id=$4)::int AS receipt, " +
      "(SELECT count(*) FROM outbox_events WHERE id=$5)::int AS outbox, " +
      "(SELECT status FROM tontine_contributions WHERE id=$3) AS contribution_status, " +
      "(SELECT status FROM tontine_payment_intents WHERE id=$6) AS payment_status",
      [rollbackLedger, rollbackEventId, rollbackContribution, rollbackReceipt, rollbackOutbox, rollbackPayment]
    );
    assert.deepEqual(rolled.rows[0], { ledger: 0, event: 0, fee: 0, receipt: 0, outbox: 0, contribution_status: "pending", payment_status: "provider_confirmed" });
  } finally {
    await client.query("DELETE FROM outbox_events WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM tontine_receipts WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM tontine_fee_snapshots WHERE contribution_id IN (SELECT id FROM tontine_contributions WHERE organization_id=$1)", [organizationId]);
    await client.query("DELETE FROM ledger_lines WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM ledger_transactions WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM tontine_payment_intents WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM tontine_contributions WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM financial_accounts WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM organizations WHERE id=$1", [organizationId]);
    await client.end();
  }
});
