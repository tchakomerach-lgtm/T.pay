import test from "node:test";
import assert from "node:assert/strict";
import type { FinancialAccount } from "../packages/finance/src/account.js";
import {
  postFinancialTransaction,
  type PostFinancialTransactionResult
} from "../packages/finance/src/transactional-ledger.js";
import type {
  AccountRepository,
  FinancialUnitOfWork,
  LedgerStore
} from "../packages/finance/src/persistence.js";
import type { LedgerTransaction } from "../packages/finance/src/ledger-service.js";

const account = (id: string): FinancialAccount => ({
  id,
  organizationId: "org-1",
  code: id,
  name: id,
  kind: "asset",
  currency: "XOF",
  status: "active",
  createdAt: "2026-10-03T00:00:00.000Z"
});

class MemoryUow implements FinancialUnitOfWork {
  readonly accounts = new Accounts();
  readonly ledger = new Ledger();
  commits = 0;
  rollbacks = 0;

  async run<T>(operation: (tx: FinancialUnitOfWork) => Promise<T>): Promise<T> {
    try {
      const result = await operation(this);
      this.commits++;
      return result;
    } catch (error) {
      this.rollbacks++;
      throw error;
    }
  }
}

class Accounts implements AccountRepository {
  private readonly rows = new Map<string, FinancialAccount>();
  constructor() {
    this.rows.set("org-1:cash", account("cash"));
    this.rows.set("org-1:user", account("user"));
  }
  async getById(org: string, id: string): Promise<FinancialAccount | undefined> {
    return this.rows.get(`${org}:${id}`);
  }
  async save(): Promise<void> {
    throw new Error("NOT_IMPLEMENTED_IN_MEMORY_TEST");
  }
}

class Ledger implements LedgerStore {
  readonly rows: LedgerTransaction[] = [];
  async findByIdempotencyKey(org: string, key: string) {
    return this.rows.find(
      (row) => row.organizationId === org && row.idempotencyKey === key
    );
  }
  async append(tx: LedgerTransaction) {
    if (await this.findByIdempotencyKey(tx.organizationId, tx.idempotencyKey)) {
      throw new Error("UNIQUE_IDEMPOTENCY_CONSTRAINT");
    }
    this.rows.push(tx);
  }
}

const tx: LedgerTransaction = {
  id: "tx-persistent-1",
  organizationId: "org-1",
  idempotencyKey: "idem-persistent-123",
  occurredAt: "2026-10-03T00:00:00.000Z",
  postedAt: "2026-10-03T00:00:01.000Z",
  lines: [
    { accountId: "cash", amount: { currency: "XOF", minor: 1000n }, direction: "debit" },
    { accountId: "user", amount: { currency: "XOF", minor: 1000n }, direction: "credit" }
  ]
};

test("transactional ledger posts once and replays safely", async () => {
  const uow = new MemoryUow();
  const first = await postFinancialTransaction(uow, tx);
  const second = await postFinancialTransaction(uow, { ...tx, id: "other-id" });

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(second.transaction.id, tx.id);
  assert.equal(uow.ledger.rows.length, 1);
});

test("transactional ledger rejects a missing account before append", async () => {
  const uow = new MemoryUow();
  await assert.rejects(
    postFinancialTransaction(uow, {
      ...tx,
      id: "tx-missing-account",
      idempotencyKey: "idem-missing-123",
      lines: [
        ...tx.lines.slice(0, 1),
        { accountId: "missing", amount: { currency: "XOF", minor: 1000n }, direction: "credit" }
      ]
    }),
    /LEDGER_ACCOUNT_NOT_FOUND/
  );

  assert.equal(uow.ledger.rows.length, 0);
  assert.equal(uow.commits, 0);
  assert.equal(uow.rollbacks, 1);
});

test("transactional ledger rejects currency mismatch before append", async () => {
  const uow = new MemoryUow();
  await assert.rejects(
    postFinancialTransaction(uow, {
      ...tx,
      id: "tx-currency-mismatch",
      idempotencyKey: "idem-currency-123",
      lines: [
        { accountId: "cash", amount: { currency: "USD", minor: 1000n }, direction: "debit" },
        { accountId: "user", amount: { currency: "USD", minor: 1000n }, direction: "credit" }
      ]
    }),
    /LEDGER_ACCOUNT_CURRENCY_MISMATCH/
  );

  assert.equal(uow.ledger.rows.length, 0);
});
