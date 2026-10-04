import test from "node:test";import assert from "node:assert/strict";import {allocateRepayment,outstanding,nextScheduleState,validateRepaymentIntent} from "../packages/microfinance/src/repayment-recovery.js";
const s:any={principalDueMinor:1000n,interestDueMinor:100n,feeDueMinor:20n,principalPaidMinor:0n,interestPaidMinor:0n,feePaidMinor:0n,state:"due",dueAt:"2026-10-04T00:00:00Z"};
test("repayment allocates fee then interest then principal",()=>assert.deepEqual(allocateRepayment(s,1120n),{feeMinor:20n,interestMinor:100n,principalMinor:1000n}));
test("partial payment is deterministic",()=>assert.deepEqual(allocateRepayment(s,150n),{feeMinor:20n,interestMinor:100n,principalMinor:30n}));
test("overpayment is never silently absorbed",()=>assert.throws(()=>allocateRepayment(s,1121n),/OVERPAYMENT/));
test("schedule state becomes paid only when all components paid",()=>assert.equal(nextScheduleState(s,allocateRepayment(s,1120n)),"paid"));
test("repayment intent is tenant/idempotency validated",()=>assert.doesNotThrow(()=>validateRepaymentIntent({repaymentId:"r1",organizationId:"o1",creditRequestId:"c1",payerId:"p1",amountMinor:100n,currency:"XOF",source:"tontine",idempotencyKey:"1234567890123456",status:"accepted",occurredAt:"2026-10-04T08:00:00Z"})));
