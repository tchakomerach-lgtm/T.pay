import test from "node:test";
import assert from "node:assert/strict";
import { postLedgerTransaction, type LedgerRepository, type LedgerTransaction } from "../packages/finance/src/ledger-service.js";

class MemoryIdempotency {
  private readonly keys = new Set<string>();
  async has(key: string): Promise<boolean> { return this.keys.has(key); }
  async reserve(key: string): Promise<boolean> {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

class MemoryLedger implements LedgerRepository {
  readonly rows: LedgerTransaction[] = [];
  async findByIdempotencyKey(org: string, key: string): Promise<LedgerTransaction | undefined> {
    return this.rows.find(x => x.organizationId === org && x.idempotencyKey === key);
  }
  async append(tx: LedgerTransaction): Promise<void> {
    this.rows.push(tx);
  }
}

const tx: LedgerTransaction = {
  id: "tx-1",
  organizationId: "org-1",
  idempotencyKey: "idem-123456789012",
  occurredAt: "2026-10-03T00:00:00.000Z",
  postedAt: "2026-10-03T00:00:01.000Z",
  lines: [
    { accountId: "cash", amount: { currency: "XOF", minor: 1000n }, direction: "debit" },
    { accountId: "user", amount: { currency: "XOF", minor: 1000n }, direction: "credit" }
  ]
};

test("ledger returns the existing transaction on replay", async () => {
  const ledger = new MemoryLedger();
  const idem = new MemoryIdempotency();
  const first = await postLedgerTransaction(ledger, idem, tx);
  const replay = await postLedgerTransaction(ledger, idem, { ...tx, id: "different-id" });
  assert.equal(replay.id, first.id);
  assert.equal(ledger.rows.length, 1);
});

test("ledger rejects a malformed transaction before side effects", async () => {
  const ledger = new MemoryLedger();
  const idem = new MemoryIdempotency();
  await assert.rejects(
    postLedgerTransaction(ledger, idem, { ...tx, lines: tx.lines.slice(0, 1) }),
    /LEDGER_MINIMUM_TWO_LINES/
  );
  assert.equal(ledger.rows.length, 0);
});
