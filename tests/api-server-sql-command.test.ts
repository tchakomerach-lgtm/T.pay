import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { PooledTransactionClient, sqlCommandOf } from "../apps/api-server/src/main.js";

test("transaction command parser accepts leading whitespace and mixed-case SQL", () => {
  assert.equal(sqlCommandOf("  COMMIT  "), "COMMIT");
  assert.equal(sqlCommandOf("\n\trollback;"), "ROLLBACK");
  assert.equal(sqlCommandOf("  commit work"), "COMMIT");
});

test("transaction command parser does not mistake empty SQL for a command", () => {
  assert.equal(sqlCommandOf("   \n\t"), undefined);
});

test("transaction command parser returns the first SQL token", () => {
  assert.equal(sqlCommandOf("BEGIN ISOLATION LEVEL SERIALIZABLE"), "BEGIN");
});

test("pooled transaction client releases its connection after COMMIT and ROLLBACK", async () => {
  for (const command of ["COMMIT", "ROLLBACK;"]) {
    let connects = 0;
    let releases = 0;
    const pool = {
      connect: async () => {
        connects += 1;
        return {
          query: async () => ({ rows: [], rowCount: 0 }),
          release: () => { releases += 1; }
        };
      }
    } as unknown as Pool;
    const client = new PooledTransactionClient(pool);

    await client.query(`  ${command}  `);
    assert.equal(releases, 1, `${command} should release the checked-out connection`);

    await client.query("SELECT 1");
    assert.equal(connects, 2, "a subsequent query should acquire a fresh pool client");
    client.release();
    assert.equal(releases, 2, "explicit cleanup should release the subsequent client");
  }
});
