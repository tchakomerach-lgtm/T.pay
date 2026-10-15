import assert from "node:assert/strict";
import test from "node:test";
import {normalizeApiError} from "../packages/api-gateway/src/api-error.js";

test("API error contract preserves documented public errors",()=>{
 assert.deepEqual(normalizeApiError(new Error("API_RATE_LIMITED"),"corr-123456"),{status:429,code:"API_RATE_LIMITED",correlationId:"corr-123456"});
 assert.deepEqual(normalizeApiError(new Error("API_IDEMPOTENCY_KEY_INVALID"),"corr-123456"),{status:400,code:"API_IDEMPOTENCY_KEY_INVALID",correlationId:"corr-123456"});
});

test("API error contract hides arbitrary internal uppercase error identifiers",()=>{
 const result=normalizeApiError(new Error("DB_PASSWORD_ROTATION_FAILED"),"corr-123456");
 assert.deepEqual(result,{status:500,code:"API_INTERNAL_ERROR",correlationId:"corr-123456"});
 assert.ok(!JSON.stringify(result).includes("PASSWORD"));
});

test("API error contract never reflects credentials or PII in correlation IDs",()=>{
 const email=normalizeApiError(new Error("API_INTERNAL_ERROR"),"person@example.com");
 assert.equal(email.correlationId,"unavailable");
 const phone=normalizeApiError(new Error("API_INTERNAL_ERROR"),"90123456");
 assert.equal(phone.correlationId,"unavailable");
 const bearer=normalizeApiError(new Error("API_INTERNAL_ERROR"),"Bearer abc.def.ghi");
 assert.equal(bearer.correlationId,"unavailable");
});

test("non-Error thrown values and provider details become generic public errors",()=>{
 const result=normalizeApiError({message:"PRIVATE_KEY_LEAK"}, "corr-123456");
 assert.deepEqual(result,{status:500,code:"API_INTERNAL_ERROR",correlationId:"corr-123456"});
});
