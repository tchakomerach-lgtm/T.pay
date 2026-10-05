import {strict as assert} from "node:assert";
import {test} from "node:test";
import {resolveRatePolicy} from "../packages/api-gateway/src/rate-policy.js";

test("L13.2 maps allowed routes to deterministic channel policy",()=>{
  const policy=resolveRatePolicy({method:"GET",route:"/v1/profile",channel:"mobile",authClass:"user"});
  assert.deepEqual(policy,{
    policyKey:"mobile:GET:/v1/profile",
    scopes:["channel","ip","actor","device"],
    windowSeconds:60,
    maxRequests:90
  });
});

test("L13.2 adds phone scope to low-bandwidth channels",()=>{
  const policy=resolveRatePolicy({method:"POST",route:"/v1/ai/runs",channel:"ussd",authClass:"member"});
  assert.equal(policy?.maxRequests,12);
  assert.ok(policy?.scopes.includes("phone"));
  assert.ok(policy?.scopes.includes("device"));
});

test("L13.2 refuses routes outside the API allowlist",()=>{
  assert.equal(resolveRatePolicy({method:"POST",route:"/v1/payments",channel:"web",authClass:"user"}),null);
});
