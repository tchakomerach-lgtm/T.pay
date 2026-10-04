import test from "node:test";
import assert from "node:assert/strict";
import {PolicyOrganizationAccessVerifier} from "../packages/organization/src/access-service.js";
import {hashOrganizationAccessCode} from "../packages/organization/src/access-code.js";

test("L10.4 access verifier clears failures after valid code",async()=>{
  const hash=hashOrganizationAccessCode("Tpay@2026");
  let failures=0,cleared=0;
  const attempts={
    getState:async()=>({failedCount:failures}),
    recordFailure:async()=>({failedCount:++failures}),
    clear:async()=>{cleared++}
  };
  const verifier=new PolicyOrganizationAccessVerifier(attempts);
  assert.equal(await verifier.verify({organizationId:"o1",userId:"u1",accessCode:"Tpay@2026",accessCodeHash:hash,now:"2026-10-04T14:00:00Z"}),true);
  assert.equal(cleared,1);
  assert.equal(failures,0);
});

test("L10.4 verifier records invalid access without exposing the hash",async()=>{
  let recorded=0;
  const attempts={
    getState:async()=>undefined,
    recordFailure:async()=>{recorded++;return {failedCount:1}},
    clear:async()=>{}
  };
  const verifier=new PolicyOrganizationAccessVerifier(attempts);
  const ok=await verifier.verify({organizationId:"o1",userId:"u1",accessCode:"wrong",accessCodeHash:hashOrganizationAccessCode("Tpay@2026")});
  assert.equal(ok,false);
  assert.equal(recorded,1);
});

test("L10.4 verifier blocks an active lock",async()=>{
  const attempts={
    getState:async()=>({failedCount:5,lockedUntil:"2099-01-01T00:00:00.000Z"}),
    recordFailure:async()=>({failedCount:6}),
    clear:async()=>{}
  };
  const verifier=new PolicyOrganizationAccessVerifier(attempts);
  await assert.rejects(()=>verifier.verify({organizationId:"o1",userId:"u1",accessCode:"Tpay@2026",accessCodeHash:hashOrganizationAccessCode("Tpay@2026"),now:"2026-10-04T14:00:00Z"}),/ORG_ACCESS_TEMPORARILY_LOCKED/);
});
