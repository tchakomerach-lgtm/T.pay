import test from "node:test";
import assert from "node:assert/strict";
import { createActionEnvelope } from "../packages/ai/src/action-envelope.js";
import { issueCapability } from "../packages/ai/src/capability-policy.js";
import { AiPolicyGate } from "../packages/ai/src/policy-gate.js";

const base=()=>createActionEnvelope({
  actionId:"a1",toolName:"send-message",toolVersion:"1",organizationId:"org",actorId:"actor",agentId:"agent",
  purpose:"customer-contact",risk:"L3",canonicalPayload:"{\"message\":\"hello\"}",createdAt:1000,expiresAt:2000,correlationId:"req-1"
});

test("action envelope binds its canonical payload hash",()=>{
  const action=base();
  assert.equal(action.payloadHash.length,64);
  assert.throws(()=>createActionEnvelope({...base(),payloadHash:"bad"}),/AI_ACTION_PAYLOAD_HASH_MISMATCH/);
});

test("capability is scoped and short-lived",()=>{
  const capability=issueCapability({capabilityId:"cap",agentId:"agent",organizationId:"org",actorId:"actor",purpose:"customer-contact",toolName:"send-message",dataClasses:["internal"],risk:"L3",ttlMs:60000},1000);
  const gate=new AiPolicyGate();
  assert.equal(gate.evaluate(base(),capability,true).allowed,true);
  const foreign=createActionEnvelope({...base(),actorId:"other"});
  assert.equal(gate.evaluate(foreign,capability,true).reason,"AI_CAPABILITY_SCOPE_MISMATCH");
});

test("L4 requires independent approval and L5 is never executable",()=>{
  const gate=new AiPolicyGate();
  const action=createActionEnvelope({...base(),risk:"L4"});
  const capability=issueCapability({capabilityId:"cap4",agentId:"agent",organizationId:"org",actorId:"actor",purpose:"customer-contact",toolName:"send-message",dataClasses:["sensitive_financial"],risk:"L4",ttlMs:30000},1000);
  assert.equal(gate.evaluate(action,capability,false).reason,"AI_HUMAN_APPROVAL_REQUIRED");
  assert.equal(gate.evaluate(action,capability,true).allowed,true);
  const root=createActionEnvelope({...base(),risk:"L5"});
  assert.equal(gate.evaluate(root,capability,true).reason,"AI_ROOT_ACTION_FORBIDDEN");
});

test("kill switch fails closed",()=>{
  const gate=new AiPolicyGate();
  gate.disable("incident");
  assert.equal(gate.evaluate(base(),undefined,false).reason,"AI_KILL_SWITCH_ACTIVE");
  gate.enable();
  assert.equal(gate.evaluate(base(),undefined,false).reason,"AI_CAPABILITY_REQUIRED");
});
