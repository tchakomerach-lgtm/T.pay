import test from "node:test";
import assert from "node:assert/strict";
import { buildContinuityQueue, buildReassignmentPlan } from "../packages/microfinance/src/field-agent.js";

test("L6 reassigns unavailable-agent clients deterministically to active agents",()=>{
  const clients=[
    {clientId:"c2",latitude:1,longitude:1,priority:"normal" as const,assignedAgentId:"a1"},
    {clientId:"c1",latitude:1,longitude:1,priority:"high_risk" as const,assignedAgentId:"a2"},
    {clientId:"c3",latitude:1,longitude:1,priority:"overdue" as const}
  ];
  const agents=[
    {agentId:"a1",available:false,lastHeartbeatAt:"2026-10-04T04:00:00Z"},
    {agentId:"a2",available:true,lastHeartbeatAt:"2026-10-04T04:01:00Z"},
    {agentId:"a3",available:true,lastHeartbeatAt:"2026-10-04T04:01:00Z"}
  ];
  const queue=buildContinuityQueue(clients,agents);
  assert.deepEqual(queue.map(c=>c.clientId),["c2","c3"]);
  const first=buildReassignmentPlan(clients,agents), second=buildReassignmentPlan(clients,agents);
  assert.deepEqual(first,second);
  assert.equal(first[0]?.nextAgentId,"a2");
  assert.equal(first[0]?.nextAgentId,"a2");
  assert.equal(first[1]?.nextAgentId,"a2");
  assert.equal(first.every(x=>x.planHash.length===64),true);
});
test("L6 does not invent a replacement when every agent is unavailable",()=>{
  assert.deepEqual(buildReassignmentPlan(
    [{clientId:"c1",latitude:1,longitude:1,priority:"high_risk" as const,assignedAgentId:"a1"}],
    [{agentId:"a1",available:false,lastHeartbeatAt:"2026-10-04T04:00:00Z"}]
  ),[]);
});
