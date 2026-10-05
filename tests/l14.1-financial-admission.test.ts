import {strict as assert} from "node:assert";
import {test} from "node:test";
import {admitFinancialIntent,resolveFinancialIntentRoute} from "../packages/api-gateway/src/financial-admission.js";

test("L14.1 only explicit financial intent routes are admitted",()=>{
 assert.equal(resolveFinancialIntentRoute("POST","/v1/payments/intents"),"payment_intent");
 assert.equal(resolveFinancialIntentRoute("POST","/v1/payments"),null);
 assert.equal(resolveFinancialIntentRoute("GET","/v1/payments/intents"),null);
 assert.equal(resolveFinancialIntentRoute("POST","/v1/ledger"),null);
});

test("L14.1 admission requires tenant, idempotency and payload evidence",()=>{
 assert.throws(()=>admitFinancialIntent({
  method:"POST",route:"/v1/payments/intents",authClass:"member"
 }),/FINANCIAL_INTENT_ORGANIZATION_REQUIRED/);
 assert.throws(()=>admitFinancialIntent({
  method:"POST",route:"/v1/payments/intents",authClass:"member",organizationId:"org-1",
  idempotencyKey:"same-key"
 }),/FINANCIAL_INTENT_PAYLOAD_HASH_REQUIRED/);
});

test("L14.1 admitted intent cannot bypass Financial Core",()=>{
 const result=admitFinancialIntent({
  method:"POST",route:"/v1/payments/intents",authClass:"member",organizationId:"org-1",
  idempotencyKey:"idem-12345678",
  payloadHash:"a".repeat(64)
 });
 assert.equal(result.requiresFinancialCore,true);
 assert.equal(result.requiresHumanApproval,true);
 assert.match(result.evidenceHash,/^[a-f0-9]{64}$/);
});

test("L14.1 human approval can only be explicitly policy-disabled",()=>{
 const result=admitFinancialIntent({
  method:"POST",route:"/v1/tontines/contributions",authClass:"member",organizationId:"org-1",
  idempotencyKey:"idem-12345678",payloadHash:"b".repeat(64),humanApprovalRequired:false
 });
 assert.equal(result.requiresHumanApproval,false);
});
