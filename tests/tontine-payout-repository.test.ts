import assert from "node:assert/strict";
import test from "node:test";
import { PostgresTontinePayoutRepository } from "../packages/microfinance/src/tontine-payout-repository.js";
import type { TontinePayoutPlan } from "../packages/microfinance/src/tontine-payout.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";

const org="123e4567-e89b-42d3-a456-426614174001";
const payoutId="123e4567-e89b-42d3-a456-426614174002";
const memberId="123e4567-e89b-42d3-a456-426614174003";
const clientId="123e4567-e89b-42d3-a456-426614174004";
const microfinanceId="123e4567-e89b-42d3-a456-426614174005";
const slotId="123e4567-e89b-42d3-a456-426614174006";
const cycleId="123e4567-e89b-42d3-a456-426614174007";

const plan:TontinePayoutPlan={
  intent:{
    payoutId,organizationId:org,cycleId,beneficiaryId:clientId,amountMinor:2500n,currency:"XOF",
    destinationRef:"mf-beneficiary:123",state:"pending_approval",
    idempotencyKey:"tontine-payout:org:cycle:member",requiresHumanApproval:true,kycVerified:true,
    createdAt:"2026-11-14T00:00:00.000Z"
  },
  gate:"pending_approval",beneficiaryMembershipId:memberId as never,microfinanceId:microfinanceId as never
};

function row(state="pending_approval"){
  return {
    payout_id:payoutId,organization_id:org,cycle_id:cycleId,beneficiary_id:clientId,amount_minor:"2500",
    currency:"XOF",destination_ref:"mf-beneficiary:123",state,idempotency_key:plan.intent.idempotencyKey,
    requires_human_approval:true,kyc_verified:true,created_at:plan.intent.createdAt,
    provider:null,provider_reference:null,settlement_transaction_id:null,
    beneficiary_membership_id:memberId,microfinance_id:microfinanceId,tontine_slot_id:slotId
  };
}

test("payout creation is bound to eligible slot, active beneficiary and selected microfinance",async()=>{
  const statements:{sql:string;values?:readonly unknown[]}[]=[];
  let executor:TontineSqlExecutor;
  executor={
    query:async(sql,values)=>{statements.push({sql,...(values?{values}:{})});return {rows:sql.includes("INSERT INTO payout_intents")?[{tontine_slot_id:slotId} as never]:[],rowCount:1};},
    transaction:async work=>work(executor)
  };
  const result=await new PostgresTontinePayoutRepository(executor).createIfAbsent(plan);
  assert.equal(result.replayed,false);
  assert.equal(result.payout.tontineSlotId,slotId);
  const insert=statements.find(item=>item.sql.includes("INSERT INTO payout_intents"));
  assert.ok(insert?.sql.includes("slot.status='eligible'"));
  assert.ok(insert?.sql.includes("m.status='active'"));
  assert.ok(insert?.sql.includes("m.selected_microfinance_id=$14"));
  assert.equal(insert?.values?.[13],microfinanceId);
});

test("approval is row-locked and committed with the payout state transition",async()=>{
  const statements:string[]=[];
  let state="pending_approval";
  let executor:TontineSqlExecutor;
  executor={
    query:async(sql)=>{statements.push(sql);
      if(sql.includes("SELECT pi.payout_id"))return {rows:[row(state)] as never[],rowCount:1};
      if(sql.includes("INSERT INTO payout_approvals"))return {rows:[{payout_id:payoutId}] as never[],rowCount:1};
      if(sql.includes("UPDATE payout_intents SET state='approved'")){state="approved";return {rows:[{payout_id:payoutId}] as never[],rowCount:1};}
      return {rows:[],rowCount:1};
    },
    transaction:async work=>work(executor)
  };
  const result=await new PostgresTontinePayoutRepository(executor).approve(org as never,payoutId as never,{
    payoutId,approverId:"supervisor-9",decision:"approve",at:"2026-11-14T00:02:00.000Z"
  });
  assert.equal(result.intent.state,"approved");
  assert.ok(statements.some(sql=>sql.includes("FOR UPDATE")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO payout_approvals")));
  assert.ok(statements.some(sql=>sql.includes("UPDATE payout_intents SET state='approved'")));
});

test("settlement state and beneficiary slot transition are one repository transaction",async()=>{
  const statements:string[]=[];
  let executor:TontineSqlExecutor;
  executor={
    query:async(sql)=>{statements.push(sql);return {rows:[],rowCount:1};},
    transaction:async work=>work(executor)
  };
  await new PostgresTontinePayoutRepository(executor).markSettled(org as never,payoutId as never,"123e4567-e89b-42d3-a456-426614174008" as never,"provider-event-009");
  assert.equal(statements.length,2);
  assert.ok(statements[0]?.includes("settlement_transaction_id=$3"));
  assert.ok(statements[1]?.includes("status='paid'"));
});


test("approval retry after a lost response replays the same persisted approval without a second insert",async()=>{
  const statements:string[]=[];
  let executor:TontineSqlExecutor;
  executor={
    query:async(sql)=>{
      statements.push(sql);
      if(sql.includes("SELECT pi.payout_id"))return {rows:[row("approved")] as never[],rowCount:1};
      if(sql.includes("SELECT decision,reason FROM payout_approvals"))return {rows:[{decision:"approve",reason:"validated"}] as never[],rowCount:1};
      return {rows:[],rowCount:1};
    },
    transaction:async work=>work(executor)
  };
  const result=await new PostgresTontinePayoutRepository(executor).approve(org as never,payoutId as never,{
    payoutId,approverId:"supervisor-9",decision:"approve",reason:"validated",at:"2026-11-14T00:02:00.000Z"
  });
  assert.equal(result.intent.state,"approved");
  assert.equal(statements.filter(sql=>sql.includes("INSERT INTO payout_approvals")).length,0);
  assert.equal(statements.filter(sql=>sql.includes("UPDATE payout_intents SET state='approved'")).length,0);
});

test("an approval retry with a changed reason is rejected instead of silently replayed",async()=>{
  let executor:TontineSqlExecutor;
  executor={
    query:async(sql)=>{
      if(sql.includes("SELECT pi.payout_id"))return {rows:[row("approved")] as never[],rowCount:1};
      if(sql.includes("SELECT decision,reason FROM payout_approvals"))return {rows:[{decision:"approve",reason:"validated"}] as never[],rowCount:1};
      return {rows:[],rowCount:1};
    },
    transaction:async work=>work(executor)
  };
  await assert.rejects(()=>new PostgresTontinePayoutRepository(executor).approve(org as never,payoutId as never,{
    payoutId,approverId:"supervisor-9",decision:"approve",reason:"different reason",at:"2026-11-14T00:03:00.000Z"
  }),/TONTINE_PAYOUT_APPROVAL_CONFLICT/);
});
