import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRoute, resolveRoutePolicy } from "../packages/api-gateway/src/policy.js";
import { permissionFor } from "../packages/education/src/education-http.js";

test("parameterized API routes resolve against concrete paths",()=>{
 const policy=resolveRoutePolicy("GET","/v1/education/actors/teacher-1");
 assert.equal(policy?.route,"/v1/education/actors/:actorId");
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/actors/teacher-1",authClass:"member"}).allowed,true);
});
test("unlisted sibling routes remain deny-by-default",()=>{
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/actors/teacher-1/secrets",authClass:"member"}).allowed,false);
});

test("P056.4 teaching assignment routes require an authenticated member and reject unlisted methods",()=>{
 const list=resolveRoutePolicy("GET","/v1/education/class-assignments");
 const create=resolveRoutePolicy("POST","/v1/education/class-assignments");
 const revoke=resolveRoutePolicy("PATCH","/v1/education/class-assignments/6d83f0b7-77d6-4e28-9f58-9b4f4e85e0f1");
 assert.equal(list?.auth,"member");
 assert.equal(create?.auth,"member");
 assert.equal(revoke?.auth,"member");
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/class-assignments",authClass:"anonymous"}).allowed,false);
 assert.equal(authorizeRoute({method:"DELETE",route:"/v1/education/class-assignments",authClass:"member"}).allowed,false);
});


test("P056.4 class assignment reads require org.read while writes require org.manage",()=>{
 assert.equal(permissionFor("class-assignments","GET"),"org.read");
 assert.equal(permissionFor("class-assignments","POST"),"org.manage");
 assert.equal(permissionFor("class-assignment-revoke","PATCH"),"org.manage");
});
