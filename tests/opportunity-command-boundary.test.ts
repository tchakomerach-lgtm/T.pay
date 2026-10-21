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
const approvals = {
  async verify(input: { approvalId: string; tenantId: string; organizationId: string; opportunityId: string; command: string; requesterId: string }) {
    return input.approvalId === "approval-123" && input.tenantId === "tenant-a" &&
      input.organizationId === "org-a" && input.opportunityId === "opp-123" &&
      input.command === "PUBLISH" && input.requesterId === "user-123";
  },
};

test("OP-1299 command boundary derives identity and tenant from authenticated principal", async () => {
  let received: Record<string, unknown> | undefined;
  const result = await executeOpportunityTransition(principal, {
    opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    approvalId: "approval-123",
  }, {
    async transition(input) {
      received = input;
      return { opportunityId: input.opportunityId, state: "PUBLISHED", version: 2n, idempotent: false };
    },
  }, approvals);
  assert.equal(received?.actorId, "user-123");
  assert.equal(received?.tenantId, "tenant-a");
  assert.equal(received?.organizationId, "org-a");
  assert.equal(received?.humanApproval, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.version, "2");
});

test("OP-1299 denies unauthenticated or unauthorized commands before repository access", async () => {
  let called = false;
  const port = { async transition() { called = true; throw new Error("should-not-run"); } };
  await assert.rejects(
    executeOpportunityTransition(null, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    }, port, approvals),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 401,
  );
  await assert.rejects(
    executeOpportunityTransition({ ...principal, permissions: [] }, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    }, port, approvals),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 403,
  );
  assert.equal(called, false);
});

test("OP-1299 rejects malformed commands, short idempotency keys and client approval assertions", async () => {
  const port = { async transition() { throw new Error("should-not-run"); } };
  await assert.rejects(
    executeOpportunityTransition(principal, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "short",
    }, port, approvals),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 400,
  );
  await assert.rejects(
    executeOpportunityTransition(principal, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
      humanApproval: true,
    } as never, port, approvals),
    (error: unknown) => error instanceof OpportunityCommandError && error.status === 400,
  );
});

test("OP-1299 rejects an approval reference outside its bound context", async () => {
  await assert.rejects(
    executeOpportunityTransition(principal, {
      opportunityId: "opp-123", command: "PUBLISH",
      idempotencyKey: "request-key-123456789", approvalId: "approval-other",
    }, { async transition() { throw new Error("should-not-run"); } }, approvals),
    (error: unknown) => error instanceof OpportunityCommandError &&
      error.status === 403 && error.code === "APPROVAL_INVALID_OR_OUT_OF_SCOPE",
  );
});

test("OP-1299 maps lifecycle conflicts to HTTP conflict", async () => {
  await assert.rejects(
    executeOpportunityTransition(principal, {
      opportunityId: "opp-123", command: "PUBLISH", idempotencyKey: "request-key-123456789",
    }, { async transition() { throw new Error("OPPORTUNITY_HUMAN_APPROVAL_REQUIRED"); } }, approvals),
    (error: unknown) => error instanceof OpportunityCommandError &&
      error.status === 409 && error.code === "OPPORTUNITY_HUMAN_APPROVAL_REQUIRED",
  );
});
