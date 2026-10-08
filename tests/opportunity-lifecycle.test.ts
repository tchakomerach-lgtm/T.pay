import test from "node:test";
import assert from "node:assert/strict";
import { listAllowedTransitions, transitionOpportunity } from "../packages/opportunity/src/lifecycle.js";

test("OP-1296 lifecycle guard allows the canonical happy path", () => {
  const published = transitionOpportunity({ current: "DRAFT", command: "PUBLISH", actorClass: "OWNER", humanApproval: true });
  assert.equal(published.to, "PUBLISHED");
  const matching = transitionOpportunity({ current: "PUBLISHED", command: "START_MATCHING", actorClass: "AGENT" });
  assert.equal(matching.to, "MATCHING");
  const review = transitionOpportunity({ current: "MATCHING", command: "START_REVIEW", actorClass: "SYSTEM" });
  assert.equal(review.to, "REVIEW");
  assert.equal(listAllowedTransitions("REVIEW").some(x => x.to === "NEGOTIATION"), true);
});

test("OP-1297 sensitive transitions require explicit human approval", () => {
  assert.throws(
    () => transitionOpportunity({ current: "REVIEW", command: "START_NEGOTIATION", actorClass: "OWNER" }),
    /OPPORTUNITY_HUMAN_APPROVAL_REQUIRED/
  );
  assert.equal(
    transitionOpportunity({ current: "REVIEW", command: "START_NEGOTIATION", actorClass: "OWNER", humanApproval: true }).to,
    "NEGOTIATION",
  );
});

test("OP-1298 lifecycle guard denies impossible actor/command combinations", () => {
  assert.throws(
    () => transitionOpportunity({ current: "DRAFT", command: "START_MATCHING", actorClass: "AGENT" }),
    /OPPORTUNITY_INVALID_TRANSITION/
  );
  assert.throws(
    () => transitionOpportunity({ current: "COMPLETED", command: "PUBLISH", actorClass: "OWNER", humanApproval: true }),
    /OPPORTUNITY_INVALID_TRANSITION|OPPORTUNITY_TERMINAL_STATE/
  );
});
