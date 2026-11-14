import assert from "node:assert/strict";
import test from "node:test";
import { createAndInitiateDurableTontinePayout } from "../packages/microfinance/src/tontine-payout-durable-orchestrator.js";
import type { PersistedTontinePayout } from "../packages/microfinance/src/tontine-payout-repository.js";
import type { TontinePayoutPlan } from "../packages/microfinance/src/tontine-payout.js";

const base:PersistedTontinePayout={
  intent:{
    payoutId:"123e4567-e89b-42d3-a456-426614174001",
    organizationId:"123e4567-e89b-42d3-a456-426614174002",
    cycleId:"123e4567-e89b-42d3-a456-426614174003",
    beneficiaryId:"123e4567-e89b-42d3-a456-426614174004",
    amountMinor:1500n,currency:"XOF",destinationRef:"mf-account:beneficiary",
    state:"pending_approval",idempotencyKey:"tontine-payout:org:cycle:member",
    requiresHumanApproval:true,kycVerified:true,createdAt:"2026-11-14T00:00:00.000Z"
  },
  beneficiaryMembershipId:"123e4567-e89b-42d3-a456-426614174005",
  microfinanceId:"123e4567-e89b-42d3-a456-426614174006",
  tontineSlotId:"123e4567-e89b-42d3-a456-426614174007"
};
const approval={payoutId:base.intent.payoutId,approverId:"supervisor-1",decision:"approve" as const,at:"2026-11-14T00:01:00.000Z"};
const plan=(gate:TontinePayoutPlan["gate"]):TontinePayoutPlan=>({
  intent:{...base.intent,state:gate==="pending_kyc"?"pending_kyc":gate==="approved"?"approved":"pending_approval"},
  gate,beneficiaryMembershipId:base.beneficiaryMembershipId,microfinanceId:base.microfinanceId
});
function repository(initial:PersistedTontinePayout=base){
  const calls:string[]=[];
  let current=initial;
  return {
    calls,
    get current(){return current;},
    createIfAbsent:async()=>{calls.push("create");return {payout:current,replayed:false};},
    approve:async()=>{calls.push("approve");current={...current,intent:{...current.intent,state:"approved"}};return current;},
    markInitiated:async(_org:string,_id:string,provider:string,providerReference:string)=>{calls.push("initiated:"+provider+":"+providerReference);current={...current,intent:{...current.intent,state:"initiated"},provider,providerReference};},
    markFailed:async()=>{calls.push("failed");current={...current,intent:{...current.intent,state:"failed"}};}
  };
}

test("durable payout refuses to call provider before human approval",async()=>{
  const repo=repository();
  let providerCalls=0;
  await assert.rejects(()=>createAndInitiateDurableTontinePayout(plan("pending_approval"),undefined,{
    initiate:async()=>{providerCalls++;return {provider:"mf",providerReference:"ref",status:"pending"};},
    query:async()=>({provider:"mf",providerReference:"ref",status:"pending"})
  },repo),/TONTINE_PAYOUT_HUMAN_APPROVAL_REQUIRED/);
  assert.equal(providerCalls,0);
  assert.deepEqual(repo.calls,["create"]);
});

test("durable payout persists independent approval before provider initiation",async()=>{
  const repo=repository();
  const result=await createAndInitiateDurableTontinePayout(plan("pending_approval"),approval,{
    initiate:async request=>({provider:"microfinance",providerReference:"out-001",status:request.amountMinor===1500n?"pending":"rejected"}),
    query:async()=>({provider:"microfinance",providerReference:"out-001",status:"pending"})
  },repo);
  assert.equal(result.payout.intent.state,"initiated");
  assert.equal(result.providerInitiated,true);
  assert.deepEqual(repo.calls,["create","approve","initiated:microfinance:out-001"]);
});

test("provider rejection is persisted as failed and never as confirmed",async()=>{
  const approved={...base,intent:{...base.intent,state:"approved" as const,requiresHumanApproval:false}};
  const repo=repository(approved);
  const result=await createAndInitiateDurableTontinePayout(plan("approved"),undefined,{
    initiate:async()=>({provider:"microfinance",providerReference:"out-rejected",status:"rejected"}),
    query:async()=>({provider:"microfinance",providerReference:"out-rejected",status:"rejected"})
  },repo);
  assert.equal(result.payout.intent.state,"failed");
  assert.equal(result.providerInitiated,false);
  assert.deepEqual(repo.calls,["create","failed"]);
});

test("an already initiated payout is replayed without a second provider call",async()=>{
  const initiated={...base,intent:{...base.intent,state:"initiated" as const}};
  const repo=repository(initiated);
  let providerCalls=0;
  const result=await createAndInitiateDurableTontinePayout(plan("approved"),approval,{
    initiate:async()=>{providerCalls++;return {provider:"mf",providerReference:"out-002",status:"pending"};},
    query:async()=>({provider:"mf",providerReference:"out-002",status:"pending"})
  },repo);
  assert.equal(result.payout.intent.state,"initiated");
  assert.equal(result.providerInitiated,false);
  assert.equal(providerCalls,0);
});
