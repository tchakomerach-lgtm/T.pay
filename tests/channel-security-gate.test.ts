import test from "node:test";
import assert from "node:assert/strict";
import { evaluateChannelSecurity, assertChannelSecurity } from "../packages/security/src/channel-security-gate.js";

const base = {
  organizationId:"org-1", agentId:"marketing", actorId:"actor-1", sessionId:"session-1",
  capability:"message.send", externalContent:true,
};

test("low-risk external communication remains explicitly untrusted", () => {
  const decision = evaluateChannelSecurity({...base, risk:"low"});
  assert.equal(decision.allowed, true);
  assert.ok(decision.reasons.includes("external_content_untrusted"));
});

test("high-risk channel action needs idempotency and approval", () => {
  const denied = evaluateChannelSecurity({...base, risk:"high"});
  assert.equal(denied.allowed, false);
  assert.ok(denied.reasons.includes("missing_idempotency_key"));

  const pending = evaluateChannelSecurity({...base, risk:"high", idempotencyKey:"idem-1"});
  assert.equal(pending.allowed, false);
  assert.ok(pending.reasons.includes("approval_required"));

  const approved = evaluateChannelSecurity({...base, risk:"high", idempotencyKey:"idem-1", approvalId:"approval-1"});
  assert.equal(approved.allowed, true);
});

test("critical channel action requires step-up semantics", () => {
  const decision = evaluateChannelSecurity({...base, risk:"critical", idempotencyKey:"idem-1", approvalId:"approval-1"});
  assert.equal(decision.requiresStepUp, true);
});

test("wildcard capabilities are denied", () => {
  assert.throws(() => assertChannelSecurity({...base, risk:"low", capability:"*"}), /TPAY_CHANNEL_SECURITY_DENIED/);
});

test("missing tenant/session context fails closed", () => {
  assert.throws(() => assertChannelSecurity({...base, organizationId:"", risk:"low"}), /TPAY_CHANNEL_SECURITY_DENIED/);
});
