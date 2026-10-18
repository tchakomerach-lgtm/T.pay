import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRoute, resolveRoutePolicy } from "../packages/api-gateway/src/policy.js";

test("microfinance field read endpoints are explicitly allowlisted for authenticated members",()=>{
 for(const route of ["/v1/microfinance/field/routes","/v1/microfinance/field/visits"]){
  const policy=resolveRoutePolicy("GET",route);
  assert.ok(policy,route+" must be allowlisted");
  assert.equal(policy.auth,"member");
  assert.equal(policy.financial,false);
  assert.equal(authorizeRoute({method:"GET",route,authClass:"member"}).allowed,true);
  assert.equal(resolveRoutePolicy("POST",route),null,"field read endpoint must not permit POST");
 }
});
