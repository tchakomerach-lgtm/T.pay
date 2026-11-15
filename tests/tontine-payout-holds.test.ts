import assert from "node:assert/strict";
import test from "node:test";
import { PostgresTontinePayoutRepository } from "../packages/microfinance/src/tontine-payout-repository.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";

const organizationId = "123e4567-e89b-42d3-a456-426614174001";
const payoutId = "123e4567-e89b-42d3-a456-426614174002";
const membershipId = "123e4567-e89b-42d3-a456-426614174003";

function executor(activeHold: boolean, statements: string[]): TontineSqlExecutor {
  const db: TontineSqlExecutor = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.includes("SELECT pi.payout_id")) {
        return { rows: [{
          payout_id: payoutId, organization_id: organizationId, cycle_id: "cycle-1",
          beneficiary_id: "client-1", amount_minor: "2500", currency: "XOF",
          destination_ref: "wallet-destination", state: "approved",
          idempotency_key: "payout-key", requires_human_approval: true, kyc_verified: true,
          created_at: "2026-11-14T00:00:00.000Z", provider: null, provider_reference: null,
          settlement_transaction_id: null, beneficiary_membership_id: membershipId,
          microfinance_id: "mf-1", tontine_slot_id: "slot-1"
        }], rowCount: 1 };
      }
      if (sql.includes("FROM tontine_targeted_holds")) {
        return { rows: activeHold ? [{ id: "hold-1" }] : [], rowCount: activeHold ? 1 : 0 };
      }
      if (sql.includes("UPDATE payout_intents SET state='initiated'")) {
        return { rows: [{ payout_id: payoutId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    transaction: async work => work(db)
  };
  return db;
}

test("payout initiation fails closed when an active targeted hold exists", async () => {
  const statements: string[] = [];
  const repository = new PostgresTontinePayoutRepository(executor(true, statements));
  await assert.rejects(
    repository.markInitiated(organizationId as never, payoutId as never, "tmoney", "provider-ref-1"),
    /TONTINE_PAYOUT_TARGETED_HOLD_ACTIVE/
  );
  assert.ok(statements.some(sql => sql.includes("FOR UPDATE")));
  assert.ok(statements.some(sql => sql.includes("scope='membership'")));
  assert.equal(statements.some(sql => sql.includes("UPDATE payout_intents SET state='initiated'")), false);
});

test("payout initiation proceeds only after the organization-scoped active-hold check passes", async () => {
  const statements: string[] = [];
  const repository = new PostgresTontinePayoutRepository(executor(false, statements));
  await repository.markInitiated(organizationId as never, payoutId as never, "tmoney", "provider-ref-1");
  assert.ok(statements.some(sql => sql.includes("FROM tontine_targeted_holds")));
  assert.ok(statements.some(sql => sql.includes("UPDATE payout_intents SET state='initiated'")));
});
