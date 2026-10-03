import test from "node:test";
import assert from "node:assert/strict";
import { createTontineCycle, buildMemberSchedules, markScheduleDue, calculateAttendance, closeCycle } from "../packages/microfinance/src/tontine-cycle.js";

const group = {
  id:"g" as never,name:"Cycle",countryCode:"TG",currency:"XOF",frequency:"daily" as const,
  contributionMode:"fixed" as const,fixedAmountMinor:1000n,minimumAmountMinor:250n,cycleNumber:1,
  governance:"member_vote" as const,status:"active" as const,createdBy:"u" as never,createdAt:"2026-10-03T00:00:00Z"
};
const member = {id:"m" as never,groupId:group.id,clientId:"c" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-01"};

test("cycle captures the configured minimum and rules version",()=>{
  const cycle=createTontineCycle(group,{id:"cycle-1" as never,startsOn:"2026-10-03",periods:3,rulesVersion:"rules-7",createdAt:"2026-10-03T00:00:00Z"});
  assert.equal(cycle.minimumAmountMinor,250n);
  assert.equal(cycle.endsOn,"2026-10-05");
  assert.equal(cycle.rulesVersion,"rules-7");
});

test("member schedules are generated only for active members",()=>{
  const cycle=createTontineCycle(group,{id:"cycle-2" as never,startsOn:"2026-10-03",periods:3,rulesVersion:"rules-7",createdAt:"2026-10-03T00:00:00Z"});
  const schedules=buildMemberSchedules(cycle,group,[member,{...member,id:"m2" as never,status:"exited" as const}]);
  assert.equal(schedules.length,3);
  assert.deepEqual(schedules.map(x=>x.scheduledFor),["2026-10-03","2026-10-04","2026-10-05"]);
  assert.equal(schedules[0].expectedAmountMinor,1000n);
});

test("due transition is deterministic and does not mutate future schedules",()=>{
  const cycle=createTontineCycle(group,{id:"cycle-3" as never,startsOn:"2026-10-03",periods:2,rulesVersion:"rules-7",createdAt:"2026-10-03T00:00:00Z"});
  const [past,future]=buildMemberSchedules(cycle,group,[member]);
  assert.equal(markScheduleDue(past,"2026-10-03").dueStatus,"due");
  assert.equal(markScheduleDue(future,"2026-10-03").dueStatus,"scheduled");
});

test("attendance is computed with integer basis points",()=>{
  const cycle=createTontineCycle(group,{id:"cycle-4" as never,startsOn:"2026-10-03",periods:3,rulesVersion:"rules-7",createdAt:"2026-10-03T00:00:00Z"});
  const schedules=buildMemberSchedules(cycle,group,[member]);
  const attendance=calculateAttendance(cycle.id,member.id,schedules.map((s,i)=>i<2?{...s,dueStatus:"confirmed" as const}:s));
  assert.equal(attendance.attendanceRatioBps,6666n);
});

test("cycle cannot close while money or beneficiary work is unresolved",()=>{
  const cycle=createTontineCycle(group,{id:"cycle-5" as never,startsOn:"2026-10-03",periods:1,rulesVersion:"rules-7",createdAt:"2026-10-03T00:00:00Z"});
  const schedule=buildMemberSchedules(cycle,group,[member])[0];
  assert.throws(()=>closeCycle(cycle,[{...schedule,dueStatus:"due"}],[]),/TONTINE_CYCLE_UNSETTLED_CONTRIBUTIONS/);
});
