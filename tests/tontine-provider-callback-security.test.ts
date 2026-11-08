import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import { processVerifiedTontinePayoutCallback } from "../packages/microfinance/src/tontine-provider-callback.js";

const id = "11111111-1111-4111-8111-111111111111" as UUID;
const payout = {
  payoutId: id, organizationId: id, cycleId: id, beneficiaryMembershipId: id,
  beneficiaryClientId: id, microfinanceId: id, destinationRef: "mf:c1",
  amountMinor: 1000n, currency: "XOF", state: "initiated" as const, idempotencyKey: "payout-1",
  kycVerified: true, unresolvedFinancialException: false, humanApprovalRequired: true,
  now: "2026-10-05T10:00:00Z"
};

function createHarness() {
  let receipt: { hash: string; payoutId: UUID; state: "processed" | "rejected" | "replayed"; failureCode?: string } | undefined;
  let settlementCalls = 0;
  const db = {
    async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      if (sql.includes("SELECT provider_event_id")) {
        if (!receipt) return { rows: [] as Row[], rowCount: 0 };
        return { rows: [{
          provider_event_id: "evt-1", payout_id: receipt.payoutId,
          payload_sha256: receipt.hash, state: receipt.state
        }] as Row[], rowCount: 1 };
      }
      if (sql.includes("UPDATE tontine_provider_callback_receipts")) {
        if (receipt) {
          receipt.state = "rejected";
          receipt.failureCode = sql.includes("CALLBACK_PAYLOAD_MISMATCH") ? "CALLBACK_PAYLOAD_MISMATCH" : "CALLBACK_RECEIPT_STALE";
        }
        return { rows: [] as Row[], rowCount: 1 };
      }
      if (sql.includes("SELECT payout_id,organization_id,state,idempotency_key")) {
        return { rows: [{ payout_id: id, organization_id: id, state: "initiated", idempotency_key: "payout-1" }] as Row[], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO tontine_provider_callback_receipts")) {
        receipt = { hash: String(values?.[4]), payoutId: values?.[6] as UUID, state: "processed" };
        return { rows: [] as Row[], rowCount: 1 };
      }
      return { rows: [] as Row[], rowCount: 1 };
    },
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> { return work(this); },
    getReceipt() { return receipt; },
    getSettlementCalls() { return settlementCalls; },
    countSettlement() { settlementCalls += 1; }
  } as any;
  const verifier = {
    async verifyAndNormalize(input: { provider: string; rawBody: string; receivedAt: string }) {
      return {
        provider: input.provider, providerEventId: "evt-1", payoutId: id, organizationId: id,
        providerReference: "ref-1", amountMinor: 1000n, currency: "XOF",
        receivedAt: input.receivedAt, rawBody: input.rawBody
      };
    }
  };
  const bridge = { async settle() { db.countSettlement(); return undefined; } };
  const run = (rawBody: string) => processVerifiedTontinePayoutCallback(
    db, verifier,
    { provider: "mf", rawBody, signature: "sig", receivedAt: "2026-10-05T10:00:00Z" },
    id, payout,
    { tontineClearingAccountId: "a", microfinanceSettlementAccountId: "b" },
    "tx-1", bridge
  );
  return { run, db };
}

test("same provider event ID with substituted payload is durably quarantined", async () => {
  const { run, db } = createHarness();
  assert.equal((await run("body-A")).state, "processed");
  assert.equal((await run("body-B")).state, "rejected");
  assert.equal(db.getReceipt()?.state, "rejected");
  assert.equal(db.getReceipt()?.failureCode, "CALLBACK_PAYLOAD_MISMATCH");
  // Restoring the original payload does not clear the integrity incident.
  assert.equal((await run("body-A")).state, "rejected");
  assert.equal(db.getReceipt()?.state, "rejected");
  assert.equal(db.getSettlementCalls(), 1);
});

test("identical processed callback replay is acknowledged without rewriting or settling again", async () => {
  const { run, db } = createHarness();
  assert.equal((await run("body-A")).state, "processed");
  assert.equal((await run("body-A")).state, "replayed");
  assert.equal(db.getReceipt()?.state, "processed");
  assert.equal(db.getSettlementCalls(), 1);
});
