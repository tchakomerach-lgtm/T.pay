import test from "node:test";
import assert from "node:assert/strict";
import { assertPaymentTransition } from "../packages/finance/src/payment-state.js";
import { reconcile } from "../packages/finance/src/reconciliation.js";
import { postCollection } from "../packages/microfinance/src/collection-service.js";
import { outstandingMinor, recoveryOutstandingMinor } from "../packages/education/src/finance-plan.js";

test("payment state machine rejects terminal mutation", () => {
  assert.throws(() => assertPaymentTransition("completed","pending"), /INVALID_PAYMENT_TRANSITION/);
  assert.doesNotThrow(() => assertPaymentTransition("pending","completed"));
});

test("reconciliation never silently accepts amount mismatch", () => {
  assert.equal(reconcile({
    internalPaymentId:"p",providerReference:"r",internalAmountMinor:100n,providerAmountMinor:90n,
    internalStatus:"completed",providerStatus:"completed"
  }), "amount_mismatch");
});

test("tontine posting is idempotent", async () => {
  const rows:any[]=[];
  const keys=new Set<string>();
  const repo={findByIdempotencyKey:async(k:string)=>rows.find(x=>x.idempotencyKey===k),append:async(x:any)=>{rows.push(x)}};
  const idem={reserve:async(k:string)=>{if(keys.has(k))return false;keys.add(k);return true}};
  const member={id:"m",groupId:"g",clientId:"c",dailyMinimumMinor:500n,currency:"XOF",status:"active" as const};
  const collection={id:"c",memberId:"m",agentId:"a",scheduledFor:"2026-10-03",amountMinor:500n,currency:"XOF",status:"collected" as const,idempotencyKey:"idem-123456789012"};
  await postCollection(repo,idem,collection,member);
  const replay=await postCollection(repo,idem,{...collection,id:"different"},member);
  assert.equal(replay.id,"c");
  assert.equal(rows.length,1);
});

test("education finance computes outstanding balances without floating point", () => {
  const plan={id:"p",studentId:"s",schoolOrganizationId:"o",academicYear:"2026-2027",tuitionMinor:1000n,suppliesMinor:200n,currency:"XOF",fundedMinor:900n,recoveredMinor:300n,status:"recovering" as const};
  assert.equal(outstandingMinor(plan),300n);
  assert.equal(recoveryOutstandingMinor(plan),600n);
});
