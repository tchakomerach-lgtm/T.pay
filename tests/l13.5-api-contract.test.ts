import {strict as assert} from "node:assert";
import {test} from "node:test";
import {parseApiVersion,resolveApiVersion} from "../packages/api-gateway/src/api-version.js";
import {buildApiSuccess,buildApiError,validateContractRoute} from "../packages/api-gateway/src/api-contract.js";
import {normalizeApiError} from "../packages/api-gateway/src/api-error.js";

test("L13.5 parses and validates explicit v1 routes",()=>{
  assert.equal(parseApiVersion("/v1/profile"),"v1");
  assert.equal(parseApiVersion("/profile"),null);
  assert.equal(resolveApiVersion("/v1/profile").state,"active");
  validateContractRoute("/v1/profile");
});

test("L13.5 rejects missing and unsupported versions",()=>{
  assert.throws(()=>resolveApiVersion("/profile"),/API_VERSION_MISSING/);
  assert.throws(()=>resolveApiVersion("/v2/profile"),/API_VERSION_UNSUPPORTED/);
});

test("L13.5 success contract is versioned and correlation-bound",()=>{
  const response=buildApiSuccess("v1","corr-123456",{ok:true});
  assert.deepEqual(response,{ok:true,version:"v1",correlationId:"corr-123456",data:{ok:true}});
  assert.throws(()=>buildApiSuccess("v1","x",{ok:true}),/API_CORRELATION_INVALID/);
});

test("L13.5 error contract never exposes provider details",()=>{
  const response=buildApiError(new Error("ECONNRESET"),"corr-123456");
  assert.equal(response.status,503);
  assert.equal(response.code,"ECONNRESET");
  assert.equal("message" in response,false);
  assert.equal("detail" in response,false);
});

test("L13.5 unknown failures collapse to bounded internal error",()=>{
  const response=normalizeApiError(new Error("postgres stack trace with credential"),"corr-123456");
  assert.deepEqual(response,{status:500,code:"API_INTERNAL_ERROR",correlationId:"corr-123456"});
});
