import test from "node:test";
import assert from "node:assert/strict";
import { PostgresDurableTontineSettlementRepository, type PostgresClient } from "../packages/finance/src/postgres-settlement-uow.js";

class FakeClient implements PostgresClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  private attempt = 0;

  constructor(private readonly serializationFailures = 0) {
    void serializationFailures;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<{ rows: readonly Row[]; rowCount: number }> {
    this.calls.push({ text, values });
    if (text.startsWith("BEGIN")) {
      this.attempt += 1;
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("txid_current")) {
      return { rows: [{ transaction_id: String(this.attempt) } as unknown as unknown as Row], rowCount: 1 };
    }
    if (text === "COMMIT" || text === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    throw new Error("UNEXPECTED_SQL:" + text);
  }
}

test("S-02.5 begins and commits one serializable transaction", async () => {
  const client = new FakeClient();
  const repository = new PostgresDurableTontineSettlementRepository(client);
  const result = await repository.runAtomic(
    { organizationId: "00000000-0000-0000-0000-000000000001" as never, idempotencyKey: "k", isolation: "serializable" },
    async tx => tx.transactionId
  );
  assert.equal(result, "1");
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("S-02.5 rolls back on failure and does not commit", async () => {
  const client = new FakeClient();
  const repository = new PostgresDurableTontineSettlementRepository(client);
  await assert.rejects(
    repository.runAtomic(
      { organizationId: "00000000-0000-0000-0000-000000000001" as never, idempotencyKey: "k", isolation: "serializable" },
      async () => {
        throw new Error("FAIL_MID_TRANSACTION");
      }
    ),
    /FAIL_MID_TRANSACTION/
  );
  assert.equal(client.calls.filter(call => call.text === "COMMIT").length, 0);
  assert.equal(client.calls.filter(call => call.text === "ROLLBACK").length, 1);
});

test("S-02.5 exposes the database transaction id to settlement telemetry", async () => {
  const client = new FakeClient();
  const repository = new PostgresDurableTontineSettlementRepository(client);
  const context = await repository.runAtomic(
    { organizationId: "00000000-0000-0000-0000-000000000001" as never, idempotencyKey: "k", isolation: "read_committed" },
    async tx => ({ id: tx.transactionId, isolation: tx.isolation })
  );
  assert.deepEqual(context, { id: "1", isolation: "read_committed" });
});

test("S-02.5 retries serialization failures from the whole transaction boundary", async () => {
  let beginCount = 0;
  const client: PostgresClient = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<{ rows: readonly Row[]; rowCount: number }> {
      if (text.startsWith("BEGIN")) { beginCount += 1; return { rows: [], rowCount: 0 }; }
      if (text.includes("txid_current")) return { rows: [{ transaction_id: String(beginCount) } as unknown as Row], rowCount: 1 };
      if (text === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (text === "COMMIT") {
        if (beginCount === 1) {
          throw Object.assign(new Error("serialization"), { code: "40001" });
        }
        return { rows: [], rowCount: 0 };
      }
      throw new Error("UNEXPECTED_SQL:" + text);
    }
  };
  const repository = new PostgresDurableTontineSettlementRepository(client, { maxAttempts: 2 });
  const result = await repository.runAtomic(
    { organizationId: "00000000-0000-0000-0000-000000000001" as never, idempotencyKey: "k", isolation: "serializable" },
    async tx => tx.transactionId
  );
  assert.equal(result, "2");
  assert.equal(beginCount, 2);
});

test("S-02.5 does not retry persistent validation failures", async () => {
  let beginCount = 0;
  const client: PostgresClient = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<{ rows: readonly Row[]; rowCount: number }> {
      if (text.startsWith("BEGIN")) beginCount += 1;
      if (text.includes("txid_current")) return { rows: [{ transaction_id: "1" } as unknown as Row], rowCount: 1 };
      if (text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 };
      throw new Error("UNEXPECTED_SQL:" + text);
    }
  };
  const repository = new PostgresDurableTontineSettlementRepository(client);
  await assert.rejects(
    repository.runAtomic(
      { organizationId: "00000000-0000-0000-0000-000000000001" as never, idempotencyKey: "k", isolation: "serializable" },
      async () => {
        throw new Error("PERSISTENT_VALIDATION");
      }
    ),
    /PERSISTENT_VALIDATION/
  );
  assert.equal(beginCount, 1);
});
