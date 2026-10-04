import test from "node:test";import assert from "node:assert/strict";import {assertCycleCanClose,closeCycleSafely,pauseCycle,resumeCycle} from "../packages/microfinance/src/cycle-closure.js";
const cycle:any={id:"c1",groupId:"g1",cycleNumber:1,startsOn:"2026-01-01",endsOn:"2026-01-31",status:"settlement_pending",rulesVersion:"v1",minimumAmountMinor:500n,currency:"XOF",createdAt:"2026-01-01"};
const ok={cycleId:"c1",pendingContributions:0,pendingPayouts:0,openExceptions:0,reconciliationComplete:true};
test("L8 closes only when every financial gate is clear",()=>assert.equal(closeCycleSafely(cycle,ok,"2026-02-01").status,"closed"));
test("L8 blocks unresolved payout",()=>assert.throws(()=>assertCycleCanClose({...ok,pendingPayouts:1}),/CYCLE_PENDING_PAYOUTS/));
test("L8 blocks reconciliation exception",()=>assert.throws(()=>assertCycleCanClose({...ok,openExceptions:1}),/CYCLE_OPEN_EXCEPTIONS/));
test("L8 supports controlled pause/resume",()=>assert.equal(resumeCycle(pauseCycle(cycle,"provider outage")).status,"settlement_pending"));
