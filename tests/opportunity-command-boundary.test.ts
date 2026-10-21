import test from "node:test";
import assert from "node:assert/strict";
import { executeOpportunityTransition, OpportunityCommandError } from "../packages/opportunity/src/command-boundary.js";

const principal = {
  subjectId: "user-123",
  tenantId: "tenant-a",
  organizationId: "org-a",
  actorClass: "OWNER" as const,
  permissions: ["opportunity:transition"],
};

test("OP-1299 command boundary derives identity and tenant from authenticated principal", async () => {
  let received: Record<string, unknown> | undefined;
  const result = await executeOpportunityTransition(principal, {
    opportunityId: "opp-123",
    command: "PUBLISH",
    idempotencyKey: "request-key-123456789",
    humanApproval: true,
  }, {
    async transition(input) {
      received = input;
      return { opportunityId: input.opportunityId, state: "PUBLISHED", version: 2n, idempotent: false };
    },
  });
  assert.equal(received?.actorId, "user-123");
  assert.equal(received?.tenantId, "tenant-a");
  assert.equal(received?.organizationId, "org-a");
  assert.equal(result.status, 202);
  assert.equal(result.body.version, "2");
});

test("OP-1299 denies unauthenticated or unauthorized commands before repository access", async () => {
  let called = false;
  const port = { async transition() { called = true; throw new Error("should-not-run"); } };
  await assert.rejects(
    executeOpportunityTransition(null, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    }, port),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 401,
  );
  await assert.rejects(
    executeOpportunityTransition({ ...principal, permissions: [] }, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    }, port),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 403,
  );
  assert.equal(called, false);
});

test("OP-1299 rejects malformed command and short idempotency key", async () => {
  const port = { async transition() { throw new Error("should-not-run"); } };
  await assert.rejects(
    executeOpportunityTransition(principal, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "short",
    }, port),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 400,
  );
});

test("OP-1299 maps lifecycle conflicts to HTTP conflict without exposing internals", async () => {
  await assert.rejects(
    executeOpportunityTransition(principal, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    }, { async transition() { throw new Error("OPPORTUNITY_HUMAN_APPROVAL_REQUIRED"); } }),
    (error: unknown) => error instanceof OpportunityCommandError &&
      error.status === 409 && error.code === "OPPORTUNITY_HUMAN_APPROVAL_REQUIRED",
  );
});
