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

test("community tontine group portfolio is readable and creation is authenticated non-financial",()=>{
 const route="/v1/tontine/groups";
 assert.equal(resolveRoutePolicy("GET",route)?.financial,false);
 assert.equal(authorizeRoute({method:"GET",route,authClass:"member"}).allowed,true);
 assert.equal(resolveRoutePolicy("POST",route)?.financial,false);
 assert.equal(authorizeRoute({method:"POST",route,authClass:"member"}).allowed,true);
});


test("community tontine operational read resources are authenticated and read-only",()=>{
 for(const resource of ["members","cycles","contributions","governance","cases"]){
  const route=`/v1/tontine/groups/123e4567-e89b-42d3-a456-426614174000/${resource}`;
  assert.equal(resolveRoutePolicy("GET",route)?.financial,false,resource);
  assert.equal(authorizeRoute({method:"GET",route,authClass:"member"}).allowed,true,resource);
  assert.equal(authorizeRoute({method:"POST",route,authClass:"member"}).allowed,false,resource);
 }
});
