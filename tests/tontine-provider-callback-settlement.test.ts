import assert from "node:assert/strict";
import test from "node:test";
import { processVerifiedTontinePayoutCallback, type VerifiedTontineProviderCallback } from "../packages/microfinance/src/tontine-provider-callback.js";
import type { TontinePayoutContext } from "../packages/microfinance/src/tontine-payout.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";

const org="123e4567-e89b-42d3-a456-426614174001" as never;
const payoutId="123e4567-e89b-42d3-a456-426614174002" as never;
const memberId="123e4567-e89b-42d3-a456-426614174003" as never;
const beneficiaryId="123e4567-e89b-42d3-a456-426614174004" as never;
const microfinanceId="123e4567-e89b-42d3-a456-426614174005" as never;
const now="2026-11-14T12:00:00.000Z";
const payout:TontinePayoutContext={
  organizationId:org,cycleId:"123e4567-e89b-42d3-a456-426614174006",
  beneficiaryMembershipId:memberId,beneficiaryClientId:beneficiaryId,microfinanceId,
  destinationRef:"mf-beneficiary:1",amountMinor:2500n,currency:"XOF",
  kycVerified:true,unresolvedFinancialException:false,humanApprovalRequired:true,now
};
const callback:VerifiedTontineProviderCallback={
  provider:"microfinance",providerEventId:"event-001",payoutId,organizationId:org,
  providerReference:"out-001",amountMinor:2500n,currency:"XOF",receivedAt:now,rawBody:"signed-provider-payload"
};
const input={provider:"microfinance",rawBody:"signed-provider-payload",signature:"verified-by-test",receivedAt:now};
const accounts={tontineClearingAccountId:"tontine-clearing",microfinanceSettlementAccountId:"mf-clearing"};

function database(handler:(sql:string,values?:readonly unknown[])=>{rows:Record<string,unknown>[];rowCount:number|null}){
  const statements:string[]=[];
  let db:TontineSqlExecutor;
  db={
    query:async(sql,values)=>{statements.push(sql);return handler(sql,values) as never;},
    transaction:async work=>work(db)
  };
  return {db,statements};
}

test("verified callback posts through the same transaction and confirms payout plus rotation slot",async()=>{
  const {db,statements}=database(sql=>{
    if(sql.includes("FROM tontine_provider_callback_receipts"))return {rows:[],rowCount:0};
    if(sql.includes("FROM payout_intents"))return {rows:[{
      payout_id:payoutId,organization_id:org,state:"initiated",idempotency_key:"payout-key",
      provider:"microfinance",provider_reference:"out-001",amount_minor:"2500",currency:"XOF",tontine_slot_id:"slot-1"
    }],rowCount:1};
    return {rows:[{ok:true}],rowCount:1};
  });
  let settled=false;
  const result=await processVerifiedTontinePayoutCallback(db,{verifyAndNormalize:async()=>callback},input,payoutId,payout,accounts,"123e4567-e89b-42d3-a456-426614174007",{
    settle:async(tx,_payout,evidence)=>{settled=true;assert.equal(evidence.amountMinor,2500n);await (tx as TontineSqlExecutor).query("INSERT INTO ledger_transactions (id) VALUES ($1)",["tx"]);return {posted:true};}
  });
  assert.equal(result.state,"processed");
  assert.equal(settled,true);
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO ledger_transactions")));
  assert.ok(statements.some(sql=>sql.includes("SET state='confirmed'")));
  assert.ok(statements.some(sql=>sql.includes("SET status='paid'")));
});

test("callback cannot settle a payout with a different persisted provider reference",async()=>{
  const {db}=database(sql=>{
    if(sql.includes("FROM tontine_provider_callback_receipts"))return {rows:[],rowCount:0};
    if(sql.includes("FROM payout_intents"))return {rows:[{
      payout_id:payoutId,organization_id:org,state:"initiated",idempotency_key:"payout-key",
      provider:"microfinance",provider_reference:"different-ref",amount_minor:"2500",currency:"XOF",tontine_slot_id:"slot-1"
    }],rowCount:1};
    return {rows:[],rowCount:1};
  });
  let settled=false;
  await assert.rejects(()=>processVerifiedTontinePayoutCallback(db,{verifyAndNormalize:async()=>callback},input,payoutId,payout,accounts,"tx-id",{
    settle:async()=>{settled=true;}
  }),/TONTINE_CALLBACK_PERSISTED_PAYOUT_MISMATCH/);
  assert.equal(settled,false);
});

test("same provider event with a different payload is durably rejected without Ledger settlement",async()=>{
  const {db,statements}=database(sql=>{
    if(sql.includes("FROM tontine_provider_callback_receipts"))return {rows:[{
      provider_event_id:"event-001",payout_id:payoutId,payload_sha256:"different-hash",state:"processed"
    }],rowCount:1};
    return {rows:[],rowCount:1};
  });
  let settled=false;
  const result=await processVerifiedTontinePayoutCallback(db,{verifyAndNormalize:async()=>callback},input,payoutId,payout,accounts,"tx-id",{
    settle:async()=>{settled=true;}
  });
  assert.equal(result.state,"rejected");
  assert.equal(settled,false);
  assert.ok(statements.some(sql=>sql.includes("failure_code='CALLBACK_PAYLOAD_MISMATCH'")));
});
