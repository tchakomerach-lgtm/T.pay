import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRoute, resolveRoutePolicy } from "../packages/api-gateway/src/policy.js";
import { assertAuthorized } from "../packages/security/src/authorization.js";

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


test("CT-042 verification, approval, and activation require separate explicit permissions",()=>{
 const base={userId:"20000000-0000-4000-8000-000000000001",organizationId:"20000000-0000-4000-8000-000000000002",sessionId:"session-ct042"};
 const verifier={...base,permissions:["community.protection.verify"]} as const;
 assert.doesNotThrow(()=>assertAuthorized(verifier,{organizationId:base.organizationId,requestedPermission:"community.protection.verify"}));
 assert.throws(()=>assertAuthorized(verifier,{organizationId:base.organizationId,requestedPermission:"community.protection.approve"}),/FORBIDDEN/);
 assert.throws(()=>assertAuthorized(verifier,{organizationId:"20000000-0000-4000-8000-000000000099",requestedPermission:"community.protection.verify"}),/ORGANIZATION_CONTEXT_REQUIRED/);
 const approver={...base,permissions:["community.protection.approve"]} as const;
 assert.doesNotThrow(()=>assertAuthorized(approver,{organizationId:base.organizationId,requestedPermission:"community.protection.approve"}));
 const activator={...base,permissions:["community.protection.activate"]} as const;
 assert.doesNotThrow(()=>assertAuthorized(activator,{organizationId:base.organizationId,requestedPermission:"community.protection.activate"}));
});
