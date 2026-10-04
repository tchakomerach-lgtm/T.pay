import test from "node:test";
import assert from "node:assert/strict";
import { assertPayoutTransition,authorizePayout,selectRotationBeneficiary,type PayoutIntent } from "../packages/finance/src/payout.js";
const base:PayoutIntent={payoutId:"p1",organizationId:"org1",cycleId:"c1",beneficiaryId:"b1",amountMinor:1000n,currency:"XOF",destinationRef:"dest",state:"pending_approval",idempotencyKey:"payout-idempotency-001",requiresHumanApproval:true,kycVerified:true,createdAt:"2026-01-01T00:00:00Z"};
test("Layer 7 blocks payout without human approval",()=>{assert.throws(()=>authorizePayout(base,undefined),/PAYOUT_HUMAN_APPROVAL_REQUIRED/);});
test("Layer 7 blocks beneficiary self approval",()=>{assert.throws(()=>authorizePayout(base,{payoutId:"p1",approverId:"b1",decision:"approve",at:"2026-01-01T00:00:00Z"}),/PAYOUT_SELF_APPROVAL_FORBIDDEN/);});
test("Layer 7 enforces state machine",()=>{assert.doesNotThrow(()=>assertPayoutTransition("approved","initiated"));assert.throws(()=>assertPayoutTransition("confirmed","initiated"),/PAYOUT_INVALID_TRANSITION/);});
test("Layer 7 rotation is deterministic and avoids previous payout",()=>{assert.equal(selectRotationBeneficiary([{memberId:"a",eligible:true,contributionsCount:4},{memberId:"b",eligible:true,contributionsCount:3}],new Set(["a"])),"b");});

import { initiateApprovedPayout, buildPayoutSettlementIdempotency, settleConfirmedPayout } from "../packages/finance/src/payout-orchestrator.js";
test("Layer 7 initiates only an approved payout and never posts Ledger state",async()=>{
 const result=await initiateApprovedPayout(base,{payoutId:"p1",approverId:"supervisor-1",decision:"approve",at:"2026-01-01T00:00:00Z"},{initiate:async()=>({provider:"tmoney",providerReference:"prov-1",status:"pending"}),query:async()=>({provider:"tmoney",providerReference:"prov-1",status:"pending"})});
 assert.equal(result.state,"initiated"); assert.equal(result.evidence?.providerReference,"prov-1");
});
test("Layer 7 settlement identity is deterministic and organization-scoped",()=>{assert.equal(buildPayoutSettlementIdempotency(base,"prov-1"),"payout-settlement:org1:p1:prov-1");});

test("Layer 7 settles only confirmed provider evidence through Financial Core idempotency",async()=>{
 let appended:any; const uow:any={accounts:{getById:async(_o:string,id:string)=>({id,organizationId:"org1",currency:"XOF",type:"asset",status:"active",version:1})},ledger:{findByIdempotencyKey:async()=>undefined,append:async(t:any)=>{appended=t}},run:async(fn:any)=>fn(uow)};
 const evidence={payoutId:"p1",organizationId:"org1",provider:"tmoney",providerReference:"prov-1",amountMinor:1000n,currency:"XOF"};
 const result=await settleConfirmedPayout(uow,{...base,state:"initiated"},evidence,"source","beneficiary","tx-1");
 assert.equal(result.replayed,false); assert.equal(appended.idempotencyKey,"payout-settlement:org1:p1:prov-1");
});
test("Layer 7 rejects provider amount substitution before Ledger",async()=>{
 const uow:any={accounts:{getById:async()=>({id:"x",organizationId:"org1",currency:"XOF",type:"asset",status:"active",version:1})},ledger:{findByIdempotencyKey:async()=>undefined,append:async()=>{throw new Error("SHOULD_NOT_POST")}},run:async(fn:any)=>fn(uow)};
 await assert.rejects(()=>settleConfirmedPayout(uow,{...base,state:"initiated"},{payoutId:"p1",organizationId:"org1",provider:"tmoney",providerReference:"prov-1",amountMinor:999n,currency:"XOF"},"source","beneficiary","tx-1"),/PAYOUT_EVIDENCE_AMOUNT_MISMATCH/);
});
