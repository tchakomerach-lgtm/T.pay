import test from "node:test";
import assert from "node:assert/strict";
import { sqlCommandOf } from "../apps/api-server/src/main.js";

test("transaction command parser accepts leading whitespace and mixed-case SQL", () => {
  assert.equal(sqlCommandOf("  COMMIT  "), "COMMIT");
  assert.equal(sqlCommandOf("\n\trollback;"), "ROLLBACK;");
  assert.equal(sqlCommandOf("  commit work"), "COMMIT");
});

test("transaction command parser does not mistake empty SQL for a command", () => {
  assert.equal(sqlCommandOf("   \n\t"), undefined);
});

test("transaction command parser returns the first SQL token", () => {
  assert.equal(sqlCommandOf("BEGIN ISOLATION LEVEL SERIALIZABLE"), "BEGIN");
});
