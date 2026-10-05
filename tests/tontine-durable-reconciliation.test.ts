import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  signOfflineTontineOperation,
  verifyOfflineTontineOperation,
  classifyOfflineConflict
} from "../packages/microfinance/src/tontine-offline.js";
import { assertTontineCaseTransition } from "../packages/microfinance/src/tontine-case.js";
import {
  PostgresTontineBeneficiarySlotRepository,
  type TontineSqlExecutor
} from "../packages/microfinance/src/tontine-repositories.js";

const uuid = "11111111-1111-4111-8111-111111111111" as never;

test("offline tontine operation is signed, sequenced and blocks local ledger mutation", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  let last = 0;
  const store = {
    getLastAcceptedSequence: async () => last,
    claimSequence: async (_device: string, sequence: number) => {
      if (sequence <= last) return false;
      last = sequence;
      return true;
    }
  };

  const unsigned = {
    operationId: uuid,
    organizationId: uuid,
    groupId: uuid,
    membershipId: uuid,
    deviceId: "device-01",
    sequence: 1,
    kind: "collection_receipt" as const,
    idempotencyKey: "offline-1",
    payload: { ledgerMutation: false, amountMinor: "1000" },
    capturedAt: "2026-10-05T10:00:00Z",
    expiresAt: "2026-10-05T12:00:00Z",
    state: "queued" as const
  };
  const operation = signOfflineTontineOperation(unsigned, privateKey);
  assert.deepEqual(
    await verifyOfflineTontineOperation(operation, publicKey, store, "2026-10-05T11:00:00Z"),
    { accepted: true, reason: "ok" }
  );
  assert.deepEqual(
    await verifyOfflineTontineOperation(operation, publicKey, store, "2026-10-05T11:00:00Z"),
    { accepted: false, reason: "sequence_replay" }
  );

  const forbidden = signOfflineTontineOperation(
    { ...unsigned, operationId: "22222222-2222-4222-8222-222222222222" as never, sequence: 2,
      payload: { ledgerMutation: true } },
    privateKey
  );
  assert.deepEqual(
    await verifyOfflineTontineOperation(forbidden, publicKey, store, "2026-10-05T11:00:00Z"),
    { accepted: false, reason: "financial_mutation_forbidden" }
  );
});

test("tontine case transition rejects unsafe silent closure", () => {
  assert.doesNotThrow(() => assertTontineCaseTransition("opened", "triaged"));
  assert.doesNotThrow(() => assertTontineCaseTransition("resolution", "confirmed"));
  assert.throws(() => assertTontineCaseTransition("opened", "closed"), /TONTINE_CASE_INVALID_TRANSITION/);
  assert.deepEqual(
    classifyOfflineConflict({
      operation: {} as never,
      serverState: "already_confirmed"
    }),
    { accepted: false, reason: "duplicate" }
  );
});

test("beneficiary slot repository uses conditional claim to prevent double assignment", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const db: TontineSqlExecutor = {
    async query(text: string, values?: readonly unknown[]) {
      queries.push({ text, values });
      if (text.startsWith("UPDATE tontine_beneficiary_slots")) {
        return { rows: [{
          id: uuid, group_id: uuid, cycle_number: 1, sequence: 1,
          beneficiary_membership_id: uuid, amount_target_minor: "1000",
          status: "eligible", scheduled_for: "2026-10-05T00:00:00Z"
        }], rowCount: 1 };
      }
      return { rows: [] };
    },
    async transaction(work) { return work(this); }
  };

  const repo = new PostgresTontineBeneficiarySlotRepository(db);
  const slot = await repo.claimScheduledSlot(uuid, uuid, 1, uuid);
  assert.equal(slot.status, "eligible");
  assert.match(queries[0]!.text, /status='scheduled'/);
});
