import test from "node:test";
import assert from "node:assert/strict";
import { renderAdminConsole } from "../apps/web/src/admin-console.js";
import { authorizeRoute } from "../packages/api-gateway/src/policy.js";

test("Super Admin console exposes only explicit control-plane sections",()=>{
 const html=renderAdminConsole("runtime");
 assert.match(html,/Mode système/);
 assert.match(html,/PAM \/ sessions/);
 assert.match(html,/Recovery/);
 assert.match(html,/PRIVILEGED/);
 assert.doesNotMatch(html,/private.?key/i);
});
test("Super Admin API routes are deny-by-default to ordinary members",()=>{
 assert.equal(authorizeRoute({method:"GET",route:"/v1/admin/overview",authClass:"member"}).allowed,false);
 assert.equal(authorizeRoute({method:"GET",route:"/v1/admin/overview",authClass:"admin"}).allowed,true);
 assert.equal(authorizeRoute({method:"POST",route:"/v1/admin/runtime/change-requests",authClass:"admin"}).allowed,true);
});

test("Super Admin browser routes are explicitly allowlisted at the API gateway",()=>{
 assert.equal(authorizeRoute({method:"POST",route:"/v1/admin/auth/webauthn/challenge",authClass:"user"}).allowed,true);
 assert.equal(authorizeRoute({method:"POST",route:"/v1/admin/auth/webauthn/step-up",authClass:"user"}).allowed,true);
 assert.equal(authorizeRoute({method:"GET",route:"/v1/admin/security-posture",authClass:"admin"}).allowed,true);
 assert.equal(authorizeRoute({method:"GET",route:"/v1/admin/runtime/change-requests",authClass:"admin"}).allowed,true);
 assert.equal(authorizeRoute({method:"GET",route:"/v1/admin/security-posture",authClass:"member"}).allowed,false);
});

test("Root of Trust has a dedicated read-only control-plane view",()=>{
 const html=renderAdminConsole("root");
 assert.match(html,/Root of Trust/);
 assert.match(html,/Quorum, signatures et anti-rejeu/);
 assert.doesNotMatch(html,/private.?key/i);
});
