import test from "node:test";
import assert from "node:assert/strict";
import { summarizeCommunityTontineContributions } from "../apps/experience-web/src/community-tontine-finance-metrics.js";

test("finance dashboard counts only persisted confirmed and pending contribution states", () => {
  const summary = summarizeCommunityTontineContributions([
    { status: "confirmed", amount_minor: "125000" },
    { status: "pending", amount_minor: "5000" },
    { status: "failed", amount_minor: "99000" },
    { status: "disputed", amount_minor: "3000" }
  ]);
  assert.deepEqual(summary, {
    totalCount: 4,
    confirmedCount: 1,
    pendingCount: 1,
    exceptionCount: 2,
    confirmedMinor: 125000n,
    pendingMinor: 5000n,
    invalidAmountCount: 0
  });
});

test("finance dashboard uses exact integer arithmetic and rejects malformed minor amounts", () => {
  const summary = summarizeCommunityTontineContributions([
    { status: "confirmed", amount_minor: "9007199254740993" },
    { status: "confirmed", amount_minor: "7" },
    { status: "confirmed", amount_minor: "7.25" },
    { status: "pending", amount_minor: "-1" },
    { status: "unknown_future_state", amount_minor: null }
  ]);
  assert.equal(summary.confirmedMinor, 9007199254741000n);
  assert.equal(summary.invalidAmountCount, 3);
  assert.equal(summary.exceptionCount, 1);
});

test("empty finance dashboard is explicitly zero rather than fabricated", () => {
  const summary = summarizeCommunityTontineContributions([]);
  assert.equal(summary.totalCount, 0);
  assert.equal(summary.confirmedMinor, 0n);
  assert.equal(summary.pendingMinor, 0n);
});
