import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresDurableTontineSettlementRepository } from "../packages/finance/src/postgres-settlement-uow.js";
import { executeDurableTontineSettlement } from "../packages/microfinance/src/tontine-settlement-uow.js";
import { PostgresCommunityTontineMfSettlementRepository } from "../packages/microfinance/src/community-tontine-mf-settlement-repository.js";

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
      "INSERT INTO tontine_contributions (id,organization_id,group_id,membership_id,amount_minor,currency,idempotency_key,status,channel,scheduled_for,updated_at) VALUES ($1,$2,$3,$4,1000,'XOF',$5,'pending','mobile_money',$6,$6)",
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
        receipt: { ...base.receipt, receiptId: rollbackReceipt as never, contributionId: rollbackContribution as never, paymentIntentId: rollbackPayment as never, providerReference: "TM-ROLLBACK", ledgerTransactionId: rollbackLedger },
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
    await client.query("DELETE FROM provider_events WHERE organization_id=$1", [organizationId]);
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


test("S-03.6 live PostgreSQL claims outbox exactly once per lease and enforces worker ownership", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const outboxId = randomUUID();
  const aggregateId = randomUUID();
  const occurredAt = "2026-10-03T22:10:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)", [organizationId, "S-03.6 live", occurredAt]);
    await client.query(
      "INSERT INTO outbox_events (id,organization_id,event_type,aggregate_id,occurred_at,payload) VALUES ($1,$2,$3,$4,$5::timestamptz,$6::jsonb)",
      [outboxId, organizationId, "tontine.contribution_settled", aggregateId, occurredAt, JSON.stringify({ aggregateId })]
    );

    const { TransactionalPostgresOutboxStore } = await import("../packages/finance/src/postgres-settlement-uow.js");
    const store = new TransactionalPostgresOutboxStore(client);
    const claimed = await store.claimNext("worker-a", occurredAt, "2026-10-03T22:20:00.000Z");
    assert.equal(claimed?.id, outboxId);
    assert.equal(claimed?.attempts, 1);

    await assert.rejects(
      () => store.markPublished(outboxId, "worker-b", "2026-10-03T22:11:00.000Z"),
      /OUTBOX_MARK_PUBLISHED_REJECTED/
    );

    await store.markAttemptFailed(outboxId, "worker-a", "2026-10-03T22:12:00.000Z");
    const reclaimed = await store.claimNext("worker-b", "2026-10-03T22:13:00.000Z", "2026-10-03T22:23:00.000Z");
    assert.equal(reclaimed?.id, outboxId);
    assert.equal(reclaimed?.attempts, 2);

    await store.markPublished(outboxId, "worker-b", "2026-10-03T22:14:00.000Z");
    const after = await client.query("SELECT published_at, claimed_by, claimed_at, attempts FROM outbox_events WHERE id=$1", [outboxId]);
    assert.equal(after.rows[0]?.published_at?.toISOString?.() ?? String(after.rows[0]?.published_at), "2026-10-03T22:14:00.000Z");
    assert.equal(after.rows[0]?.claimed_by, null);
    assert.equal(after.rows[0]?.claimed_at, null);
    assert.equal(after.rows[0]?.attempts, 2);
  } finally {
    await client.query("DELETE FROM outbox_events WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM organizations WHERE id=$1", [organizationId]);
    await client.end();
  }
});


test("S-03.7 live PostgreSQL persists notification intent with tenant-scoped idempotency and claim ownership", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const eventId = randomUUID();
  const userId = randomUUID();
  const notificationId = randomUUID();
  const createdAt = "2026-10-03T22:35:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)", [organizationId, "S-03.7 live", createdAt]);
    await client.query(
      "INSERT INTO notification_intents (id,organization_id,recipient_user_id,channel,template,event_id,event_type,sensitivity,created_at) VALUES ($1,$2,$3,'in_app','payment_completed',$4,'payment.completed','generic',$5::timestamptz)",
      [notificationId, organizationId, userId, eventId, createdAt]
    );
    await assert.rejects(
      () => client.query(
        "INSERT INTO notification_intents (id,organization_id,recipient_user_id,channel,template,event_id,event_type,sensitivity,created_at) VALUES ($1,$2,$3,'in_app','payment_completed',$4,'payment.completed','generic',$5::timestamptz)",
        [randomUUID(), organizationId, userId, eventId, createdAt]
      )
    );
    await client.query(
      "UPDATE notification_intents SET claimed_by='worker-a',claimed_at=$2::timestamptz,attempts=attempts+1 WHERE id=$1",
      [notificationId, createdAt]
    );
    const wrongWorker = await client.query(
      "UPDATE notification_intents SET sent_at=$3::timestamptz,claimed_by=NULL,claimed_at=NULL WHERE id=$1 AND claimed_by=$2 AND sent_at IS NULL",
      [notificationId, "worker-b", "2026-10-03T22:36:00.000Z"]
    );
    assert.equal(wrongWorker.rowCount, 0);
    const rightWorker = await client.query(
      "UPDATE notification_intents SET sent_at=$3::timestamptz,claimed_by=NULL,claimed_at=NULL WHERE id=$1 AND claimed_by=$2 AND sent_at IS NULL",
      [notificationId, "worker-a", "2026-10-03T22:37:00.000Z"]
    );
    assert.equal(rightWorker.rowCount, 1);
  } finally {
    await client.query("DELETE FROM notification_intents WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM organizations WHERE id=$1", [organizationId]);
    await client.end();
  }
});


test("S-03.8 live PostgreSQL deduplicates exceptions and isolates organizations", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const exceptionId = randomUUID();
  const evidenceHash = "b".repeat(64);
  const detectedAt = "2026-10-03T22:45:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3),($4,$5,'active',$3)", [organizationId,"S-03.8 A",detectedAt,otherOrganizationId,"S-03.8 B"]);
    await client.query(
      "INSERT INTO reconciliation_exceptions (id,organization_id,kind,severity,status,evidence_hash,detected_at) VALUES ($1,$2,'amount_mismatch','critical','open',$3,$4::timestamptz)",
      [exceptionId,organizationId,evidenceHash,detectedAt]
    );
    await assert.rejects(() => client.query(
      "INSERT INTO reconciliation_exceptions (id,organization_id,kind,severity,status,evidence_hash,detected_at) VALUES ($1,$2,'amount_mismatch','critical','open',$3,$4::timestamptz)",
      [randomUUID(),organizationId,evidenceHash,detectedAt]
    ));
    await client.query(
      "INSERT INTO reconciliation_exceptions (id,organization_id,kind,severity,status,evidence_hash,detected_at) VALUES ($1,$2,'amount_mismatch','critical','open',$3,$4::timestamptz)",
      [randomUUID(),otherOrganizationId,evidenceHash,detectedAt]
    );
    const scoped = await client.query("SELECT count(*)::int AS count FROM reconciliation_exceptions WHERE organization_id=$1", [organizationId]);
    assert.equal(scoped.rows[0]?.count, 1);
  } finally {
    await client.query("DELETE FROM reconciliation_exceptions WHERE organization_id IN ($1,$2)", [organizationId,otherOrganizationId]);
    await client.query("DELETE FROM organizations WHERE id IN ($1,$2)", [organizationId,otherOrganizationId]);
    await client.end();
  }
});


test("S-03.9 live PostgreSQL scopes provider events by organization", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const provider = "tmoney";
  const eventId = "evt-cross-org-" + randomUUID();
  const now = "2026-10-03T22:55:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query(
      "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3),($4,$5,'active',$3)",
      [organizationId, "S-03.9 A", now, otherOrganizationId, "S-03.9 B"]
    );
    await client.query(
      "INSERT INTO provider_events (provider,event_id,organization_id,received_at) VALUES ($1,$2,$3,$4::timestamptz)",
      [provider, eventId, organizationId, now]
    );
    const second = await client.query(
      "INSERT INTO provider_events (provider,event_id,organization_id,received_at) VALUES ($1,$2,$3,$4::timestamptz) ON CONFLICT (organization_id,provider,event_id) DO NOTHING RETURNING event_id",
      [provider, eventId, otherOrganizationId, now]
    );
    assert.equal(second.rowCount, 1);
    const owners = await client.query("SELECT organization_id FROM provider_events WHERE provider=$1 AND event_id=$2 ORDER BY organization_id", [provider, eventId]);
    assert.deepEqual(owners.rows.map(row => row.organization_id).sort(), [organizationId, otherOrganizationId].sort());
  } finally {
    await client.query("DELETE FROM provider_events WHERE provider=$1 AND event_id=$2", [provider, eventId]);
    await client.query("DELETE FROM organizations WHERE id IN ($1,$2)", [organizationId, otherOrganizationId]);
    await client.end();
  }
});

test("S-03.9 live PostgreSQL enforces organization-scoped Ledger idempotency under duplicate writes", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const accountA = randomUUID();
  const accountB = randomUUID();
  const transactionA = randomUUID();
  const transactionB = randomUUID();
  const key = "s03.9-" + randomUUID();
  const now = "2026-10-03T22:56:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query(
      "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3),($4,$5,'active',$3)",
      [organizationId, "S-03.9 Ledger A", now, otherOrganizationId, "S-03.9 Ledger B"]
    );
    await client.query(
      "INSERT INTO financial_accounts (id,organization_id,code,name,kind,currency,status,created_at) VALUES " +
      "($1,$3,'A-CASH','Cash','asset','XOF','active',$5),($2,$3,'A-CLEAR','Clearing','liability','XOF','active',$5), " +
      "($6,$4,'B-CASH','Cash','asset','XOF','active',$5),($7,$4,'B-CLEAR','Clearing','liability','XOF','active',$5)",
      [accountA, accountB, organizationId, otherOrganizationId, now, randomUUID(), randomUUID()]
    );

    await client.query(
      "INSERT INTO ledger_transactions (id,organization_id,idempotency_key,occurred_at,posted_at) VALUES ($1,$2,$3,$4::timestamptz,$4::timestamptz)",
      [transactionA, organizationId, key, now]
    );
    await assert.rejects(() => client.query(
      "INSERT INTO ledger_transactions (id,organization_id,idempotency_key,occurred_at,posted_at) VALUES ($1,$2,$3,$4::timestamptz,$4::timestamptz)",
      [transactionB, organizationId, key, now]
    ));
    await client.query(
      "INSERT INTO ledger_transactions (id,organization_id,idempotency_key,occurred_at,posted_at) VALUES ($1,$2,$3,$4::timestamptz,$4::timestamptz)",
      [transactionB, otherOrganizationId, key, now]
    );
    const counts = await client.query(
      "SELECT organization_id, count(*)::int AS count FROM ledger_transactions WHERE idempotency_key=$1 GROUP BY organization_id ORDER BY organization_id",
      [key]
    );
    assert.equal(counts.rows.length, 2);
    assert.deepEqual(counts.rows.map(row => row.count), [1,1]);
  } finally {
    await client.query("DELETE FROM ledger_lines WHERE transaction_id IN ($1,$2)", [transactionA, transactionB]);
    await client.query("DELETE FROM ledger_transactions WHERE id IN ($1,$2)", [transactionA, transactionB]);
    await client.query("DELETE FROM financial_accounts WHERE organization_id IN ($1,$2)", [organizationId, otherOrganizationId]);
    await client.query("DELETE FROM organizations WHERE id IN ($1,$2)", [organizationId, otherOrganizationId]);
    await client.end();
  }
});


test("L6.2 live PostgreSQL atomically claims offline envelope and advances device sequence", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const deviceId = "device-" + randomUUID();
  const keyId = "key-" + randomUUID();
  const envelopeId = randomUUID();
  const now = "2026-10-04T00:10:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query(
      "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)",
      [organizationId, "L6.2 device org", now]
    );
    await client.query(
      "INSERT INTO field_devices (organization_id,device_id,status,max_offline_seconds,last_accepted_sequence,created_at) VALUES ($1,$2,'active',3600,0,$3)",
      [organizationId, deviceId, now]
    );
    await client.query(
      "INSERT INTO field_device_keys (organization_id,device_id,key_id,public_key_pem,status,created_at) VALUES ($1,$2,$3,$4,'active',$5)",
      [organizationId, deviceId, keyId, "-----BEGIN PUBLIC KEY-----\nTEST\n-----END PUBLIC KEY-----", now]
    );

    const { PostgresFieldOfflineClaimStore } = await import("../packages/finance/src/postgres-field-offline.js");
    const store = new PostgresFieldOfflineClaimStore(client);
    const binding = await store.get(organizationId, deviceId, keyId);
    assert.equal(binding?.lastAcceptedSequence, 0);
    assert.equal(binding?.organizationId, organizationId);

    assert.equal(await store.claimAndAdvance(envelopeId, organizationId, deviceId, 1), true);
    assert.equal(await store.claimAndAdvance(envelopeId, organizationId, deviceId, 1), false);
    assert.equal(await store.claimAndAdvance(randomUUID(), organizationId, deviceId, 3), false);

    const state = await client.query(
      "SELECT last_accepted_sequence FROM field_devices WHERE organization_id=$1 AND device_id=$2",
      [organizationId, deviceId]
    );
    const claims = await client.query(
      "SELECT count(*)::int AS count FROM field_offline_replay_claims WHERE organization_id=$1 AND device_id=$2",
      [organizationId, deviceId]
    );
    assert.equal(state.rows[0]?.last_accepted_sequence, "1");
    assert.equal(claims.rows[0]?.count, 1);

    await client.query(
      "UPDATE field_devices SET status='revoked', revoked_at=$3::timestamptz WHERE organization_id=$1 AND device_id=$2",
      [organizationId, deviceId, now]
    );
    assert.equal(await store.get(organizationId, deviceId, keyId), undefined);
    assert.equal(await store.claimAndAdvance(randomUUID(), organizationId, deviceId, 2), false);
  } finally {
    await client.query("DELETE FROM field_offline_replay_claims WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM field_device_keys WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM field_devices WHERE organization_id=$1", [organizationId]);
    await client.query("DELETE FROM organizations WHERE id=$1", [organizationId]);
    await client.end();
  }
});

test("L6.2 live PostgreSQL prevents two envelopes from consuming the same device sequence", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const setup = new pg.Client({ connectionString: databaseUrl });
  const workerA = new pg.Client({ connectionString: databaseUrl });
  const workerB = new pg.Client({ connectionString: databaseUrl });
  await setup.connect();
  await workerA.connect();
  await workerB.connect();
  const organizationId = randomUUID();
  const deviceId = "device-" + randomUUID();
  const now = "2026-10-04T00:20:00.000Z";
  try {
    await applyMigrations(setup, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await setup.query(
      "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)",
      [organizationId, "L6.2 concurrency org", now]
    );
    await setup.query(
      "INSERT INTO field_devices (organization_id,device_id,status,max_offline_seconds,last_accepted_sequence,created_at) VALUES ($1,$2,'active',3600,0,$3)",
      [organizationId, deviceId, now]
    );

    const { PostgresFieldOfflineClaimStore } = await import("../packages/finance/src/postgres-field-offline.js");
    const a = new PostgresFieldOfflineClaimStore(workerA);
    const b = new PostgresFieldOfflineClaimStore(workerB);
    const results = await Promise.all([
      a.claimAndAdvance(randomUUID(), organizationId, deviceId, 1),
      b.claimAndAdvance(randomUUID(), organizationId, deviceId, 1)
    ]);
    assert.deepEqual(results.sort(), [false, true]);

    const state = await setup.query(
      "SELECT last_accepted_sequence FROM field_devices WHERE organization_id=$1 AND device_id=$2",
      [organizationId, deviceId]
    );
    const claims = await setup.query(
      "SELECT count(*)::int AS count FROM field_offline_replay_claims WHERE organization_id=$1 AND device_id=$2",
      [organizationId, deviceId]
    );
    assert.equal(state.rows[0]?.last_accepted_sequence, "1");
    assert.equal(claims.rows[0]?.count, 1);
  } finally {
    await setup.query("DELETE FROM field_offline_replay_claims WHERE organization_id=$1", [organizationId]);
    await setup.query("DELETE FROM field_device_keys WHERE organization_id=$1", [organizationId]);
    await setup.query("DELETE FROM field_devices WHERE organization_id=$1", [organizationId]);
    await setup.query("DELETE FROM organizations WHERE id=$1", [organizationId]);
    await Promise.all([setup.end(), workerA.end(), workerB.end()]);
  }
});

test("L7 live PostgreSQL enforces organization-scoped payout idempotency and approval ownership", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  const a=randomUUID(), b=randomUUID(), payout=randomUUID(), now="2026-10-04T00:30:00.000Z";
  try {
    await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations") + "/"));
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3),($4,$5,'active',$3)",[a,"L7 A",now,b,"L7 B"]);
    await client.query("INSERT INTO payout_intents (payout_id,organization_id,cycle_id,beneficiary_id,amount_minor,currency,destination_ref,state,idempotency_key,requires_human_approval,kyc_verified,created_at) VALUES ($1,$2,'c1','member-a',1000,'XOF','dest','pending_approval','same-key',true,true,$3)",[payout,a,now]);
    await assert.rejects(()=>client.query("INSERT INTO payout_intents (payout_id,organization_id,cycle_id,beneficiary_id,amount_minor,currency,destination_ref,state,idempotency_key,requires_human_approval,kyc_verified,created_at) VALUES ($1,$2,'c1','member-b',1000,'XOF','dest','pending_approval','same-key',true,true,$3)",[randomUUID(),a,now]));
    await client.query("INSERT INTO payout_intents (payout_id,organization_id,cycle_id,beneficiary_id,amount_minor,currency,destination_ref,state,idempotency_key,requires_human_approval,kyc_verified,created_at) VALUES ($1,$2,'c1','member-b',1000,'XOF','dest','pending_approval','same-key',true,true,$3)",[randomUUID(),b,now]);
    await client.query("INSERT INTO payout_approvals (payout_id,approver_id,decision,approved_at) VALUES ($1,'supervisor-1','approve',$2)",[payout,now]);
    assert.equal((await client.query("SELECT count(*) FROM payout_approvals WHERE payout_id=$1",[payout])).rows[0].count,"1");
  } finally {
    await client.query("DELETE FROM payout_approvals WHERE payout_id=$1",[payout]);
    await client.query("DELETE FROM payout_intents WHERE organization_id IN ($1,$2)",[a,b]);
    await client.query("DELETE FROM organizations WHERE id IN ($1,$2)",[a,b]); await client.end();
  }
});


test("Community Tontine partner settlement is payout-bound, maker-checker protected, and audited in live PostgreSQL", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationId = randomUUID();
  const groupId = randomUUID();
  const membershipId = randomUUID();
  const clientId = randomUUID();
  const cycleId = randomUUID();
  const slotId = randomUUID();
  const payoutId = randomUUID();
  const microfinanceId = randomUUID();
  const preparerId = randomUUID();
  const approverId = randomUUID();
  const instructionId = randomUUID();
  const destinationRef = "test-route-" + randomUUID();
  const db = {
    query: (sql:string, values:readonly unknown[] = []) => client.query(sql, [...values]),
    transaction: async <T>(work:(tx:any)=>Promise<T>):Promise<T> => {
      await client.query("BEGIN");
      try {
        const result = await work(db);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  };
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',now())", [organizationId,"community-tontine-settlement-live-test"]);
    await client.query(
      `INSERT INTO tontine_groups
       (id,organization_id,name,country_code,currency,frequency,contribution_mode,fixed_amount_minor,minimum_amount_minor,
        cycle_number,governance,status,created_by,created_at)
       VALUES ($1,$2,'live-test','TG','XOF','daily','fixed',1000,1000,1,'founder_managed','active',$3,now())`,
      [groupId,organizationId,preparerId]
    );
    await client.query(
      `INSERT INTO tontine_memberships
       (id,organization_id,group_id,client_id,role,status,joined_at,selected_microfinance_id)
       VALUES ($1,$2,$3,$4,'member','active',now(),$5)`,
      [membershipId,organizationId,groupId,clientId,microfinanceId]
    );
    await client.query(
      `INSERT INTO tontine_cycles
       (id,organization_id,group_id,cycle_number,starts_on,ends_on,status,rules_version,minimum_amount_minor,currency,created_at)
       VALUES ($1,$2,$3,1,CURRENT_DATE,CURRENT_DATE,'open','live-test-v1',1000,'XOF',now())`,
      [cycleId,organizationId,groupId]
    );
    await client.query(
      `INSERT INTO tontine_beneficiary_slots
       (id,organization_id,group_id,cycle_id,cycle_number,sequence,beneficiary_membership_id,amount_target_minor,status,scheduled_for)
       VALUES ($1,$2,$3,$4,1,1,$5,1000,'eligible',CURRENT_DATE)`,
      [slotId,organizationId,groupId,cycleId,membershipId]
    );
    await client.query(
      `INSERT INTO payout_intents
       (payout_id,organization_id,cycle_id,beneficiary_id,amount_minor,currency,destination_ref,state,idempotency_key,requires_human_approval,kyc_verified,created_at,tontine_slot_id)
       VALUES ($1,$2,$3,$4,1000,'XOF',$5,'approved',$6,true,true,now(),$7)`,
      [payoutId,organizationId,cycleId,clientId,destinationRef,"live-settlement-"+payoutId,slotId]
    );

    const repository = new PostgresCommunityTontineMfSettlementRepository(db as any);
    await assert.rejects(
      () => repository.savePrepared(organizationId as never, {
        id:randomUUID() as never,tontineGroupId:groupId as never,microfinanceId:randomUUID() as never,
        payoutId:payoutId as never,beneficiaryClientId:clientId as never,amountMinor:1000n,currency:"XOF",
        destinationRef,requiresHumanApproval:true,preparedBy:preparerId as never,state:"prepared",createdAt:new Date().toISOString()
      }),
      /PERSISTENCE_CONFLICT/
    );
    const instruction = await repository.savePrepared(organizationId as never, {
      id:instructionId as never,tontineGroupId:groupId as never,microfinanceId:microfinanceId as never,
      payoutId:payoutId as never,beneficiaryClientId:clientId as never,amountMinor:1000n,currency:"XOF",
      destinationRef,requiresHumanApproval:true,preparedBy:preparerId as never,state:"prepared",createdAt:new Date().toISOString()
    });
    assert.equal(instruction.state,"prepared");
    await assert.rejects(
      () => repository.savePrepared(organizationId as never, {
        id:instructionId as never,tontineGroupId:groupId as never,microfinanceId:microfinanceId as never,
        payoutId:payoutId as never,beneficiaryClientId:clientId as never,amountMinor:1000n,currency:"XOF",
        destinationRef:destinationRef+"-tampered",requiresHumanApproval:true,preparedBy:preparerId as never,state:"prepared",createdAt:new Date().toISOString()
      }),
      /PERSISTENCE_CONFLICT/
    );
    await client.query("UPDATE payout_intents SET state='failed' WHERE payout_id=$1",[payoutId]);
    await assert.rejects(
      () => repository.markApproved(organizationId as never,instructionId as never,approverId as never,"prepared"),
      /APPROVAL_CONFLICT/
    );
    await client.query("UPDATE payout_intents SET state='approved' WHERE payout_id=$1",[payoutId]);
    await assert.rejects(
      () => repository.markApproved(organizationId as never,instructionId as never,preparerId as never,"prepared"),
      /APPROVAL_CONFLICT/
    );
    const approved = await repository.markApproved(organizationId as never,instructionId as never,approverId as never,"prepared");
    assert.equal(approved.state,"approved");
    assert.equal(approved.approvedBy,approverId);
    await assert.rejects(
      () => client.query("UPDATE community_tontine_mf_settlement_instructions SET destination_ref='tampered',version=version+1,last_modified_at=now() WHERE id=$1",[instructionId]),
      /COMMUNITY_TONTINE_SETTLEMENT_IMMUTABLE_BINDING/
    );
    await assert.rejects(
      () => client.query("UPDATE community_tontine_mf_settlement_instructions SET state='prepared',version=version+1,last_modified_at=now() WHERE id=$1",[instructionId]),
      /COMMUNITY_TONTINE_SETTLEMENT_TRANSITION_DENIED/
    );

    const audit = await client.query(
      "SELECT event_type,new_state,actor_id FROM community_tontine_mf_settlement_audit WHERE instruction_id=$1 ORDER BY id",
      [instructionId]
    );
    assert.deepEqual(audit.rows.map(row => [row.event_type,row.new_state]), [["created","prepared"],["updated","approved"]]);
    assert.equal(audit.rows[0]?.actor_id,preparerId);
    assert.equal(audit.rows[1]?.actor_id,approverId);
    await assert.rejects(
      () => client.query("DELETE FROM community_tontine_mf_settlement_instructions WHERE id=$1",[instructionId]),
      /COMMUNITY_TONTINE_SETTLEMENT_DELETE_FORBIDDEN/
    );
    await assert.rejects(
      () => client.query("DELETE FROM community_tontine_mf_settlement_audit WHERE instruction_id=$1",[instructionId]),
      /COMMUNITY_TONTINE_SETTLEMENT_AUDIT_IMMUTABLE/
    );
  } finally {
    await client.query("ALTER TABLE community_tontine_mf_settlement_audit DISABLE TRIGGER trg_community_tontine_mf_settlement_audit_no_mutation").catch(()=>undefined);
    await client.query("DELETE FROM community_tontine_mf_settlement_audit WHERE instruction_id=$1",[instructionId]).catch(()=>undefined);
    await client.query("ALTER TABLE community_tontine_mf_settlement_audit ENABLE TRIGGER trg_community_tontine_mf_settlement_audit_no_mutation").catch(()=>undefined);
    await client.query("ALTER TABLE community_tontine_mf_settlement_instructions DISABLE TRIGGER trg_community_tontine_mf_settlement_no_delete").catch(()=>undefined);
    await client.query("DELETE FROM community_tontine_mf_settlement_instructions WHERE id=$1",[instructionId]).catch(()=>undefined);
    await client.query("ALTER TABLE community_tontine_mf_settlement_instructions ENABLE TRIGGER trg_community_tontine_mf_settlement_no_delete").catch(()=>undefined);
    await client.query("DELETE FROM payout_intents WHERE payout_id=$1",[payoutId]).catch(()=>undefined);
    await client.query("DELETE FROM tontine_beneficiary_slots WHERE id=$1",[slotId]).catch(()=>undefined);
    await client.query("DELETE FROM tontine_cycles WHERE id=$1",[cycleId]).catch(()=>undefined);
    await client.query("DELETE FROM tontine_memberships WHERE id=$1",[membershipId]).catch(()=>undefined);
    await client.query("DELETE FROM tontine_groups WHERE id=$1",[groupId]).catch(()=>undefined);
    await client.query("DELETE FROM organizations WHERE id=$1",[organizationId]).catch(()=>undefined);
    await client.end();
  }
});
