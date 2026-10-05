import {strict as assert} from "node:assert";
import {test} from "node:test";
import {createPaymentIntent,submitPaymentIntent,approvePaymentIntent,type PaymentIntent, type PaymentIntentRepository} from "../packages/finance/src/payment-intent.js";

class Repo implements PaymentIntentRepository{
 rows=new Map<string,PaymentIntent>();
 async findByIdempotency(org:string,key:string){return this.rows.get(org+"|"+key);}
 async insert(i:PaymentIntent){this.rows.set(i.organizationId+"|"+i.idempotencyKey,i);return i;}
 async approve(org:string,id:string,by:string,at:string){
  for(const i of this.rows.values())if(i.organizationId===org&&i.id===id&&i.state==="pending_approval"){
   i.state="approved";i.approvedBy=by;i.approvedAt=at;i.updatedAt=at;return i;
  } return undefined;
 }
 async reject(){return undefined;}
}

test("L14.2 creates XOF payment intent with human approval by default",()=>{
 const i=createPaymentIntent({organizationId:"org-1",idempotencyKey:"idem-12345678",payloadHash:"a".repeat(64),
  payerAccountId:"payer",payeeAccountId:"payee",amountMinor:500n,currency:"XOF",now:"2026-10-05T10:00:00Z"});
 assert.equal(i.state,"pending_approval");assert.equal(i.requiresHumanApproval,true);assert.equal(i.amountMinor,500n);
});
test("L14.2 same idempotency key with different payload is rejected",async()=>{
 const repo=new Repo();const input={organizationId:"org-1",idempotencyKey:"idem-12345678",payloadHash:"a".repeat(64),payerAccountId:"payer",payeeAccountId:"payee",amountMinor:500n,currency:"XOF",now:"2026-10-05T10:00:00Z"};
 await submitPaymentIntent(repo,input);
 await assert.rejects(()=>submitPaymentIntent(repo,{...input,payloadHash:"b".repeat(64)}),/PAYMENT_INTENT_IDEMPOTENCY_CONFLICT/);
});
test("L14.2 approval is an explicit state transition",async()=>{
 const repo=new Repo();const {intent}=await submitPaymentIntent(repo,{organizationId:"org-1",idempotencyKey:"idem-12345678",payloadHash:"a".repeat(64),payerAccountId:"payer",payeeAccountId:"payee",amountMinor:500n,currency:"XOF",now:"2026-10-05T10:00:00Z"});
 const approved=await approvePaymentIntent(repo,"org-1",intent.id,"admin-1","2026-10-05T10:01:00Z");
 assert.equal(approved.state,"approved");assert.equal(approved.approvedBy,"admin-1");
});
test("L14.2 rejects non-XOF direct payment intent in current Togo-first core",()=>{
 assert.throws(()=>createPaymentIntent({organizationId:"org-1",idempotencyKey:"idem-12345678",payloadHash:"a".repeat(64),payerAccountId:"payer",payeeAccountId:"payee",amountMinor:500n,currency:"USD",now:"2026-10-05T10:00:00Z"}),/PAYMENT_CURRENCY_UNSUPPORTED/);
});
