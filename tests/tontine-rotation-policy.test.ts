import assert from "node:assert/strict";
import test from "node:test";
import type { UUID } from "../packages/domain/src/types.js";
import type { CommunityTontineGroup, CommunityTontineMembership } from "../packages/microfinance/src/community-tontine.js";
import { selectRotatingBeneficiary } from "../packages/microfinance/src/tontine-rotation.js";

const groupId="123e4567-e89b-42d3-a456-426614174000" as UUID;
const member=(id:string,status:CommunityTontineMembership["status"],joinedAt:string):CommunityTontineMembership=>({
  id:id as UUID,groupId,clientId:(id+"-client") as UUID,role:"member",status,joinedAt
});
const group:CommunityTontineGroup={
  id:groupId,name:"Rotation test",countryCode:"TG",currency:"XOF",frequency:"weekly",
  contributionMode:"fixed",fixedAmountMinor:1000n,minimumAmountMinor:500n,
  cycleNumber:3,governance:"member_vote",status:"active",
  createdBy:"123e4567-e89b-42d3-a456-426614174099" as UUID,createdAt:"2026-01-01T00:00:00.000Z"
};
const members=[
  member("123e4567-e89b-42d3-a456-426614174001","active","2026-01-01T00:00:00.000Z"),
  member("123e4567-e89b-42d3-a456-426614174002","active","2026-01-02T00:00:00.000Z"),
  member("123e4567-e89b-42d3-a456-426614174003","active","2026-01-03T00:00:00.000Z")
];

test("strict round-robin policy follows cycle sequence even when earlier members were paid",()=>{
  const selected=selectRotatingBeneficiary(group,members,new Set([members[0]!.id]),{
    allowRepeatOnlyAfterFullRound:false,requireActiveMembership:true
  });
  assert.equal(selected.memberId,members[2]!.id);
  assert.equal(selected.sequence,3);
});

test("policy may explicitly include inactive members when configured",()=>{
  const roster=[
    member("123e4567-e89b-42d3-a456-426614174011","exited","2026-01-01T00:00:00.000Z"),
    member("123e4567-e89b-42d3-a456-426614174012","suspended","2026-01-02T00:00:00.000Z"),
    members[0]!
  ];
  const selected=selectRotatingBeneficiary(group,roster,new Set(),{
    allowRepeatOnlyAfterFullRound:true,requireActiveMembership:false
  });
  assert.equal(selected.memberId,roster[0]!.id);
});
