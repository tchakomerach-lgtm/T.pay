import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", "dist/tests/*.test.js"],
  {
    stdio: "inherit",
    env: { ...process.env, TPAY_RUN_POSTGRES_LIVE: "1" }
  }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
