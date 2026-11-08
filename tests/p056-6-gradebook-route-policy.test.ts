import test from "node:test";
import assert from "node:assert/strict";
import { authorizeRoute } from "../packages/api-gateway/src/policy.js";

test("P056.6 assessment routes are authenticated, allowlisted and non-financial", () => {
  assert.equal(authorizeRoute({method:"GET",route:"/v1/education/assessments",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"POST",route:"/v1/education/assessments",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"PATCH",route:"/v1/education/assessments/00000000-0000-4000-8000-000000000001",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"POST",route:"/v1/education/assessments/00000000-0000-4000-8000-000000000001/grades",authClass:"member"}).allowed,true);
  assert.equal(authorizeRoute({method:"DELETE",route:"/v1/education/assessments/00000000-0000-4000-8000-000000000001/grades",authClass:"member"}).allowed,false);
  assert.equal(authorizeRoute({method:"POST",route:"/v1/education/assessments",authClass:"user"}).allowed,false);
});
