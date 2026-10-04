import test from "node:test";import assert from "node:assert/strict";import {reconcilePayout,assertPayoutReversalAllowed} from "../packages/finance/src/payout-reconciliation.js";
const intent:any={payoutId:"p1",organizationId:"o1",amountMinor:1000n,currency:"XOF",state:"confirmed"};
const ev:any={payoutId:"p1",organizationId:"o1",amountMinor:1000n,currency:"XOF",provider:"tmoney",providerReference:"r1"};
test("L7.1 matches confirmed payout evidence",()=>assert.equal(reconcilePayout(intent,ev),"matched"));
test("L7.1 quarantines amount divergence",()=>assert.equal(reconcilePayout(intent,{...ev,amountMinor:999n}),"amount_mismatch"));
test("L7.1 refuses reversal before confirmed state",()=>assert.throws(()=>assertPayoutReversalAllowed({...intent,state:"initiated"},ev),/PAYOUT_NOT_CONFIRMED/));
test("L7.1 provider-only evidence never authorizes financial correction",()=>assert.equal(reconcilePayout(undefined,ev),"provider_only"));
