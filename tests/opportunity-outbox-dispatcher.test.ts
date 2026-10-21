import test from "node:test";
import assert from "node:assert/strict";
import { OpportunityOutboxDispatcher } from "../packages/opportunity/src/outbox-dispatcher.js";

function fakeDb(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  let inTransaction = false;
  const db = {
    async begin() { inTransaction = true; },
    async commit() { inTransaction = false; },
    async rollback() { inTransaction = false; },
    async query(sql: string, values?: readonly unknown[]) {
      calls.push({ sql, values });
      if (sql.includes("WITH candidates AS")) {
        assert.equal(inTransaction, true);
        const selected = rows.splice(0, Number(values?.[0] ?? 50));
        return { rows: selected, rowCount: selected.length };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { db, calls };
}

const event = {
  id: "evt-1", tenant_id: "tenant-a", organization_id: "org-a",
  aggregate_id: "opp-1", event_type: "opportunity.state.changed",
  payload: { state: "PUBLISHED" }, attempts: 1,
};

test("OP-1300 dispatches claimed events and marks them published", async () => {
  const { db, calls } = fakeDb([{ ...event }]);
  const published: string[] = [];
  const dispatcher = new OpportunityOutboxDispatcher(db as never, {
    async publish(item) { published.push(item.id); },
  });
  const result = await dispatcher.dispatchBatch();
  assert.deepEqual(result, { claimed: 1, published: 1, retried: 0, quarantined: 0 });
  assert.deepEqual(published, ["evt-1"]);
  assert.equal(calls.some(call => call.sql.includes("SET published_at=now()")), true);
});

test("OP-1300 retries publisher failures with bounded exponential backoff", async () => {
  const { db, calls } = fakeDb([{ ...event, attempts: 2 }]);
  const dispatcher = new OpportunityOutboxDispatcher(db as never, {
    async publish() { throw new Error("provider timeout"); },
  });
  const result = await dispatcher.dispatchBatch();
  assert.deepEqual(result, { claimed: 1, published: 0, retried: 1, quarantined: 0 });
  const retry = calls.find(call => call.sql.includes("SET available_at=now()"));
  assert.equal(retry?.values?.[1], 4);
  assert.equal(retry?.values?.[2], "provider timeout");
});

test("OP-1300 quarantines events after the configured attempt limit", async () => {
  const { db, calls } = fakeDb([{ ...event, attempts: 4 }]);
  const dispatcher = new OpportunityOutboxDispatcher(db as never, {
    async publish() { throw new Error("authorization=super-secret"); },
  }, { maxAttempts: 4 });
  const result = await dispatcher.dispatchBatch();
  assert.deepEqual(result, { claimed: 1, published: 0, retried: 0, quarantined: 1 });
  const dead = calls.find(call => call.sql.includes("SET dead_lettered_at=now()"));
  assert.equal(String(dead?.values?.[1]).includes("super-secret"), false);
});

test("OP-1300 refuses to run without a transaction-capable database", async () => {
  const dispatcher = new OpportunityOutboxDispatcher({ async query() { return { rows: [], rowCount: 0 }; } } as never, {
    async publish() {},
  });
  await assert.rejects(dispatcher.dispatchBatch(), /OPPORTUNITY_TRANSACTION_REQUIRED/);
});
