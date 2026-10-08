import test from "node:test";
import assert from "node:assert/strict";
import { activateChannelSkill, getChannelSkill, listChannelSkills } from "../packages/ai/src/channel-skill-registry.js";

test("catalogue exposes communication and growth skills", () => {
  const ids = listChannelSkills().map(skill => skill.id);
  for (const expected of ["whatsapp","facebook","tiktok","sms","phone","publishing","marketing","sales","crm","customer_support","campaigns","analytics"]) {
    assert.ok(ids.includes(expected as never));
  }
});

test("skills are capability-bound and agent-scoped", () => {
  const skill = activateChannelSkill({
    organizationId: "org-1", agentId: "marketing", channel: "whatsapp",
    requestedCapabilities: ["message.draft","template.use"],
  });
  assert.equal(skill.authorizationBoundary, "capability-broker");
  assert.equal(skill.externalContentIsUntrusted, true);
});

test("an agent cannot activate another agent's skill", () => {
  assert.throws(() => activateChannelSkill({
    organizationId:"org-1", agentId:"finance", channel:"tiktok",
    requestedCapabilities:["post.publish"],
  }), /TPAY_CHANNEL_SKILL_AGENT_NOT_ALLOWED/);
});

test("undeclared capability cannot be smuggled into a skill", () => {
  assert.throws(() => activateChannelSkill({
    organizationId:"org-1", agentId:"marketing", channel:"whatsapp",
    requestedCapabilities:["ledger.write"],
  }), /TPAY_CHANNEL_SKILL_CAPABILITY_NOT_DECLARED/);
});

test("phone remains high risk and delegated to capability broker", () => {
  const skill = getChannelSkill("phone");
  assert.equal(skill.risk, "S5");
  assert.equal(skill.authorizationBoundary, "capability-broker");
  assert.ok(skill.requiredApprovals.includes("financial.action"));
});
