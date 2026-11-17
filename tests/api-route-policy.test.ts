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

test("P055 student route is allowlisted only for authenticated member GET",()=>{
 const policy=resolveRoutePolicy("GET","/v1/education/students/student-1");
 assert.equal(policy?.route,"/v1/education/students/:studentId");
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/students/student-1",authClass:"member"}).allowed,true);
 assert.equal(authorizeRoute({method:"POST",route:"/v1/education/students/student-1",authClass:"member"}).allowed,false);
 assert.equal(authorizeRoute({method:"GET",route:"/v1/education/students/student-1",authClass:"anonymous"}).allowed,false);
});
