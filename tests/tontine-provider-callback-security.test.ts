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

test("community tontine durably quarantines same provider event replay with substituted payload", async () => {
  let receipt: { hash: string; payoutId: UUID } | undefined;
  const db = {
    async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      if (sql.includes("SELECT provider_event_id")) {
        if (!receipt) return { rows: [] as Row[], rowCount: 0 };
        return { rows: [{ provider_event_id: "evt-1", payout_id: receipt.payoutId, payload_sha256: receipt.hash, state: "processed" }] as Row[], rowCount: 1 };
      }
      if (sql.includes("SELECT payout_id,organization_id,state,idempotency_key")) {
        return { rows: [{ payout_id: id, organization_id: id, state: "initiated", idempotency_key: "payout-1" }] as Row[], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO tontine_provider_callback_receipts")) {
        receipt = { hash: String(values?.[4]), payoutId: values?.[6] as UUID };
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] as Row[], rowCount: 1 };
    },
    async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> { return work(this); }
  } as any;
  const verifier = {
    async verifyAndNormalize(input: any) {
      return { provider: input.provider, providerEventId: "evt-1", payoutId: id, organizationId: id,
        providerReference: "ref-1", amountMinor: 1000n, currency: "XOF",
        receivedAt: "2026-10-05T10:00:00Z", rawBody: input.rawBody };
    }
  };
  const bridge = { async settle() { return undefined; } };
  const first = await processVerifiedTontinePayoutCallback(db, verifier, { provider:"mf", rawBody:"body-A", signature:"sig", receivedAt:"2026-10-05T10:00:00Z" }, id, payout, { tontineClearingAccountId:"a", microfinanceSettlementAccountId:"b" }, "tx-1", bridge);
  assert.equal(first.state, "rejected");
  const replay = await processVerifiedTontinePayoutCallback(db, verifier, { provider:"mf", rawBody:"body-B", signature:"sig", receivedAt:"2026-10-05T10:01:00Z" }, id, payout, { tontineClearingAccountId:"a", microfinanceSettlementAccountId:"b" }, "tx-2", bridge);
  assert.equal(replay.state, "rejected");
});
