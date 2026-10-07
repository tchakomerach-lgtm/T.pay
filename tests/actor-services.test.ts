import test from "node:test";
import assert from "node:assert/strict";
import { assignService, nextServiceAction, projectActorView, transitionService } from "../packages/education/src/actor-services.js";

const request = { id:"r1", organizationId:"o1", requesterId:"s1", serviceCode:"CERTIFICATE", status:"TRIAGED" as const, priority:"NORMAL" as const, assignedTo:null, createdAt:"2026-10-07T08:00:00Z", dueAt:"2026-10-07T10:00:00Z", version:1n };
test("service assignment is organization-bound", () => {
  const actor = { actorId:"a1", organizationId:"o1", kind:"ADMIN" as const, active:true };
  assert.equal(assignService(request, actor).assignedTo, "a1");
  assert.throws(() => assignService(request, {...actor, organizationId:"o2"}), /SERVICE_CROSS_ORGANIZATION_ASSIGNMENT/);
});
test("service termination requires a reason", () => {
  const assigned = assignService(request, { actorId:"a1", organizationId:"o1", kind:"ADMIN", active:true });
  assert.throws(() => transitionService(assigned, {from:"IN_PROGRESS",to:"REJECTED",actorId:"a1",at:"2026-10-07T09:00:00Z"}), /SERVICE_TERMINATION_REASON_REQUIRED/);
  const resolved = transitionService(assigned, {from:"IN_PROGRESS",to:"RESOLVED",actorId:"a1",at:"2026-10-07T09:00:00Z"});
  assert.equal(resolved.status, "RESOLVED");
});
test("expired open service escalates", () => assert.equal(nextServiceAction(request, Date.parse("2026-10-07T11:00:00Z")), "ESCALATE"));
test("actor projection strips sensitive fields by default", () => {
  const actor = {actorId:"p1",organizationId:"o1",kind:"PARENT" as const,active:true};
  const view = projectActorView(actor, ["name","private_contact","financial_balance"], {name:"Parent",private_contact:"x",financial_balance:1000});
  assert.deepEqual(view.data, {name:"Parent"});
});
