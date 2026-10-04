import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifyPayoutCallbackSignature,
  isPayoutCallbackFresh,
  parsePayoutCallback,
  classifyPayoutCallback
} from "../packages/finance/src/payout-callback.js";
import {
  initiatePayoutReversal,
  settleConfirmedPayoutReversal,
  buildPayoutReversalFinancialIdempotency,
  type ReversiblePayoutProvider
} from "../packages/finance/src/payout-reversal.js";

const raw = JSON.stringify({
  organizationId:"org1",payoutId:"p1",provider:"tmoney",providerEventId:"evt-1",
  providerReference:"prov-1",amountMinor:"1000",currency:"XOF",status:"confirmed",
  occurredAt:"2026-10-04T08:00:00.000Z"
});
const signature = createHmac("sha256","secret").update(raw).digest("hex");

test("L7.2 verifies exact callback signature",()=>{
  assert.equal(verifyPayoutCallbackSignature({rawBody:raw,signature,receivedAt:"2026-10-04T08:00:00.000Z",occurredAt:"2026-10-04T08:00:00.000Z",maxAgeSeconds:300,secret:"secret"} as any),true);
  assert.equal(verifyPayoutCallbackSignature({rawBody:raw+"x",signature,receivedAt:"2026-10-04T08:00:00.000Z",occurredAt:"2026-10-04T08:00:00.000Z",maxAgeSeconds:300,secret:"secret"} as any),false);
});

test("L7.2 rejects stale payout callbacks",()=>{
  assert.equal(isPayoutCallbackFresh("2026-10-04T07:00:00.000Z","2026-10-04T07:00:00.000Z",300,Date.parse("2026-10-04T08:00:00.000Z")),false);
});

test("L7.2 validates provider identity and amount before acceptance",()=>{
  const payload=parsePayoutCallback(raw);
  assert.equal(classifyPayoutCallback({organizationId:"org1",payoutId:"p1",provider:"tmoney",amountMinor:1000n,currency:"XOF",providerReference:"prov-1"},payload),"accepted");
  assert.equal(classifyPayoutCallback({organizationId:"org1",payoutId:"p1",provider:"tmoney",amountMinor:999n,currency:"XOF",providerReference:"prov-1"},payload),"quarantined");
  assert.equal(classifyPayoutCallback({organizationId:"org2",payoutId:"p1",provider:"tmoney",amountMinor:1000n,currency:"XOF",providerReference:"prov-1"},payload),"quarantined");
});

const intent:any={payoutId:"p1",organizationId:"org1",state:"confirmed",amountMinor:1000n,currency:"XOF",beneficiaryId:"b1"};
const evidence:any={payoutId:"p1",organizationId:"org1",provider:"tmoney",providerReference:"prov-1",amountMinor:1000n,currency:"XOF"};

test("L7.2 reversal requires confirmed payout and exact evidence",async()=>{
  let called=false;
  const provider:ReversiblePayoutProvider={initiate:async()=>({provider:"tmoney",providerReference:"x",status:"accepted"}),query:async()=>({provider:"tmoney",providerReference:"x",status:"confirmed"}),reverse:async()=>{called=true;return {provider:"tmoney",providerReference:"rev-1",status:"confirmed"};}};
  const result=await initiatePayoutReversal(intent,evidence,{reversalId:"r1",organizationId:"org1",payoutId:"p1",provider,providerReference:"prov-1",amountMinor:1000n,currency:"XOF",reason:"provider duplicate",idempotencyKey:"rev-idem-1"});
  assert.equal(result.providerReference,"rev-1"); assert.equal(called,true);
});

test("L7.2 reversal financial posting is a new idempotent transaction",async()=>{
  let appended:any;
  const uow:any={accounts:{getById:async(_o:string,id:string)=>({id,organizationId:"org1",currency:"XOF",type:"asset",status:"open"})},ledger:{findByIdempotencyKey:async()=>undefined,append:async(t:any)=>{appended=t;}},run:async(fn:any)=>fn(uow)};
  const result=await settleConfirmedPayoutReversal(uow,intent,evidence,"rev-1","source","beneficiary","tx-rev");
  assert.equal(result.replayed,false);
  assert.equal(buildPayoutReversalFinancialIdempotency("org1","p1","rev-1"),result.transaction.idempotencyKey);
  assert.equal(appended.lines[0].direction,"debit"); assert.equal(appended.lines[1].direction,"credit");
});
