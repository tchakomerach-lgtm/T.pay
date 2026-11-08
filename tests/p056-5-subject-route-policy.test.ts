import test from "node:test";
import assert from "node:assert/strict";
import { authorizeRoute } from "../packages/api-gateway/src/policy.js";

test("P056.5 subject catalog is member-authenticated and non-financial",()=>{
  assert.equal(authorizeRoute({method:"GET",route:"/v1/education/subjects",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"POST",route:"/v1/education/subjects",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"PATCH",route:"/v1/education/subjects/MATH",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"DELETE",route:"/v1/education/subjects/MATH",authClass:"member"}).allowed,false);
  assert.equal(authorizeRoute({method:"POST",route:"/v1/education/subjects",authClass:"user"}).allowed,false);
});
