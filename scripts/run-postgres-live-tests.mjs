import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const testFiles = readdirSync("dist/tests")
  .filter(file => file.endsWith(".test.js"))
  .sort()
  .map(file => join("dist/tests", file));

if (testFiles.length === 0) throw new Error("POSTGRES_TEST_SUITE_EMPTY");

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...testFiles],
  {
    stdio: "inherit",
    env: { ...process.env, TPAY_RUN_POSTGRES_LIVE: "1" }
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
