import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRoute, resolveRoutePolicy } from "../packages/api-gateway/src/policy.js";

test("parameterized API routes resolve against concrete paths",()=>{
 const policy=resolveRoutePolicy("GET","/v1/education/actors/teacher-1");
 assert.equal(policy?.route,"/v1/education/actors/:actorId");
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/actors/teacher-1",authClass:"member"}).allowed,true);
});
test("unlisted sibling routes remain deny-by-default",()=>{
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/actors/teacher-1/secrets",authClass:"member"}).allowed,false);
});

test("CT-042 governance and schedule endpoints are explicitly allowlisted without ledger authority",()=>{
 const routes=[
  ["GET","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-policies","member"],
  ["POST","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-policies","member"],
  ["POST","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-policies/22222222-2222-4222-8222-222222222222/verify-insurer","admin"],
  ["POST","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-policies/22222222-2222-4222-8222-222222222222/approve","admin"],
  ["POST","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-policies/22222222-2222-4222-8222-222222222222/activate","admin"],
  ["POST","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-enrollments","member"],
  ["POST","/v1/tontine/groups/11111111-1111-4111-8111-111111111111/protection-enrollments/33333333-3333-4333-8333-333333333333/premiums","admin"]
 ] as const;
 for(const [method,route,authClass] of routes){
  const result=authorizeRoute({method,route,authClass});
  assert.equal(result.allowed,true,route);
  assert.equal(result.policy?.financial,false,route);
 }
});
