import test from "node:test";
import assert from "node:assert/strict";
import {
  assuranceFromConfidence,
  authorizeAgentAction,
  commitmentStatusFromRisk,
  createActionReceipt,
  evaluateCommitmentRisk,
  isClaimUsable,
  normalizeOpportunityAction,
  verifyEvidenceHash,
  type AgentAuthority,
  type Claim,
  type Commitment,
} from "../packages/opportunity/src/index.js";

test("assurance status is monotonic and bounded", () => {
  assert.equal(assuranceFromConfidence(0), "UNVERIFIED");
  assert.equal(assuranceFromConfidence(50), "PARTIAL");
  assert.equal(assuranceFromConfidence(75), "VERIFIED");
  assert.equal(assuranceFromConfidence(90), "STRONGLY_VERIFIED");
  assert.equal(assuranceFromConfidence(98), "CRYPTOGRAPHICALLY_VERIFIED");
});

test("expired claims are never usable", () => {
  const claim: Claim = {
    id: "claim-1",
    tenantId: "tenant-1",
    organizationId: "org-1",
    subjectId: "user-1",
    issuerId: "issuer-1",
    type: "certification",
    value: "certified",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
    status: "VERIFIED",
    confidence: 90,
    evidenceIds: [],
    provenance: "issuer",
  };
  assert.equal(isClaimUsable(claim, new Date("2026-03-01T00:00:00.000Z")), false);
});

test("evidence hash verification detects tampering", () => {
  const content = new TextEncoder().encode("original-evidence");
  assert.equal(verifyEvidenceHash({
    content,
    expectedSha256: "5c8c4e2f0f6c2e6d4f9a1d7f6b4e4e1c7d8b7e6f5c4b3a291817161514131211",
  }), false);
});

test("agent authority is resource, action, expiry and budget bounded", () => {
  const authority: AgentAuthority = {
    agentId: "agent-1",
    principalId: "user-1",
    organizationId: "org-1",
    purpose: "opportunity.read",
    resource: "opportunity:123",
    actions: ["read"],
    expiresAt: "2026-12-01T00:00:00.000Z",
    maxActions: 2,
    maxValueMinor: 100000n,
  };
  const now = new Date("2026-10-08T12:00:00.000Z");
  assert.equal(authorizeAgentAction({
    authority, resource: "opportunity:123", action: "read", now, consumedActions: 0,
  }), "ALLOW");
  assert.equal(authorizeAgentAction({
    authority, resource: "opportunity:999", action: "read", now, consumedActions: 0,
  }), "DENY");
  assert.equal(authorizeAgentAction({
    authority, resource: "opportunity:123", action: "read", now, consumedActions: 2,
  }), "DENY");
  assert.equal(authorizeAgentAction({
    authority: {...authority, expiresAt: "2026-10-07T00:00:00.000Z"},
    resource: "opportunity:123", action: "read", now, consumedActions: 0,
  }), "DENY");
});

test("commitment risk escalates near deadlines", () => {
  const commitment: Commitment = {
    id: "commit-1",
    tenantId: "tenant-1",
    organizationId: "org-1",
    actorId: "actor-1",
    opportunityId: "opp-1",
    action: "deliver",
    expectedResult: "accepted",
    deadline: "2026-10-08T18:00:00.000Z",
    status: "OPEN",
    evidenceRequired: true,
    dependencyIds: ["dep-1"],
  };
  const risk = evaluateCommitmentRisk({
    commitment,
    now: new Date("2026-10-08T12:00:00.000Z"),
    dependencyRisk: 10,
    capacityRisk: 10,
    evidenceRisk: 10,
  });
  assert.ok(risk >= 20);
  assert.equal(commitmentStatusFromRisk(risk), "OPEN");
});

test("action receipts bind the actor, intent and policy decision", () => {
  const receipt = createActionReceipt({
    actorId: "actor-1",
    agentId: "agent-1",
    organizationId: "org-1",
    intent: "match",
    action: "opportunity.read",
    policyDecision: "ALLOW",
    expectedEffect: "read one opportunity",
    dataClass: "CONFIDENTIAL",
    createdAt: new Date("2026-10-08T12:00:00.000Z"),
  });
  assert.match(receipt.actionHash, /^[0-9a-f]{64}$/);
  assert.equal(receipt.organizationId, "org-1");
  assert.equal(receipt.policyDecision, "ALLOW");
});

test("opportunity actions cannot be normalized without tenant context", () => {
  assert.throws(() => normalizeOpportunityAction({
    organizationId: "",
    opportunityId: "opp-1",
    action: "read",
    parameters: {},
  }), /OPPORTUNITY_ACTION_CONTEXT_REQUIRED/);
});
