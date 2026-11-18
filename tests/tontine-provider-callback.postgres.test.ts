import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { processVerifiedTontinePayoutCallback } from "../packages/microfinance/src/tontine-provider-callback.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";
import type { TontinePayoutContext } from "../packages/microfinance/src/tontine-payout.js";
import type { UUID } from "../packages/domain/src/types.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("tontine callback payload substitution persists a rejected receipt in PostgreSQL", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  if (!databaseUrl) return;
  const client = new pg.Client({ connectionString: databaseUrl });
  const organizationId = randomUUID() as UUID;
  const payoutId = randomUUID() as UUID;
  const receiptId = randomUUID();
  const provider = "postgres-callback-security-test";
  const providerEventId = "evt-" + randomUUID();
  const now = new Date().toISOString();

  await client.connect();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query(
      "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)",
      [organizationId, "Tontine callback security integration", now]
    );
    await client.query(
      `INSERT INTO tontine_provider_callback_receipts
       (id,organization_id,provider,provider_event_id,payload_sha256,signature_verified,received_at,state,payout_id)
       VALUES ($1,$2,$3,$4,$5,true,$6,'received',$7)`,
      [receiptId, organizationId, provider, providerEventId, "original-payload-sha256", now, payoutId]
    );

    const db: TontineSqlExecutor = {
      async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
        const result = await client.query(sql, values as unknown[] | undefined);
        return { rows: result.rows as Row[], rowCount: result.rowCount ?? 0 };
      },
      async transaction<T>(work: (tx: TontineSqlExecutor) => Promise<T>): Promise<T> {
        await client.query("BEGIN");
        try {
          const result = await work(this);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    };
    const verifier = {
      async verifyAndNormalize(input: { provider: string; rawBody: string; signature: string; receivedAt: string }) {
        return {
          provider: input.provider,
          providerEventId,
          payoutId,
          organizationId,
          providerReference: "provider-ref",
          amountMinor: 1000n,
          currency: "XOF",
          receivedAt: input.receivedAt,
          rawBody: input.rawBody
        };
      }
    };
    const payout: TontinePayoutContext = {
      organizationId,
      cycleId: randomUUID(),
      beneficiaryMembershipId: randomUUID() as UUID,
      beneficiaryClientId: randomUUID() as UUID,
      microfinanceId: randomUUID() as UUID,
      destinationRef: "mf:beneficiary",
      amountMinor: 1000n,
      currency: "XOF",
      kycVerified: true,
      unresolvedFinancialException: false,
      humanApprovalRequired: true,
      now
    };
    const result = await processVerifiedTontinePayoutCallback(
      db,
      verifier,
      { provider, rawBody: "substituted-payload", signature: "verified-signature", receivedAt: now },
      payoutId,
      payout,
      { tontineClearingAccountId: "clearing", microfinanceSettlementAccountId: "settlement" },
      randomUUID(),
      { async settle() { throw new Error("Settlement must not run for a replay mismatch"); } }
    );

    assert.deepEqual(result, { state: "rejected", providerEventId, payoutId });
    const persisted = await client.query(
      "SELECT state,failure_code FROM tontine_provider_callback_receipts WHERE organization_id=$1 AND provider=$2 AND provider_event_id=$3",
      [organizationId, provider, providerEventId]
    );
    assert.deepEqual(persisted.rows[0], { state: "rejected", failure_code: "CALLBACK_PAYLOAD_MISMATCH" });
  } finally {
    await client.query("DELETE FROM tontine_provider_callback_receipts WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await client.query("DELETE FROM organizations WHERE id=$1", [organizationId]).catch(() => undefined);
    await client.end();
  }
});
