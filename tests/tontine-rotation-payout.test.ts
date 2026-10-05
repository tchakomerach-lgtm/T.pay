import test from "node:test";
import assert from "node:assert/strict";
import { buildBeneficiarySlot, calculateTontinePool, selectRotatingBeneficiary } from "../packages/microfinance/src/tontine-rotation.js";
import { approveTontinePayout, buildTontinePayoutPlan } from "../packages/microfinance/src/tontine-payout.js";

const group = {
  id:"g" as never, name:"Famille", countryCode:"TG", currency:"XOF",
  frequency:"daily" as const, contributionMode:"fixed" as const,
  fixedAmountMinor:1000n, minimumAmountMinor:200n, cycleNumber:1,
  governance:"member_vote" as const, status:"active" as const, createdBy:"u" as never,
  createdAt:"2026-10-05T00:00:00Z"
};
const members = [
  {id:"m1" as never,groupId:group.id,clientId:"c1" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-01"},
  {id:"m2" as never,groupId:group.id,clientId:"c2" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-02"},
  {id:"m3" as never,groupId:group.id,clientId:"c3" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-03"}
];

test("rotation is deterministic and does not repeat before a full round",()=>{
  assert.equal(selectRotatingBeneficiary(group,members,new Set()).memberId,"m1");
  assert.equal(selectRotatingBeneficiary({...group,cycleNumber:2},members,new Set(["m1"])).memberId,"m2");
  assert.equal(selectRotatingBeneficiary({...group,cycleNumber:3},members,new Set(["m1","m2"])).memberId,"m3");
});

test("beneficiary slot starts scheduled and pool assignment becomes eligible",()=>{
  const slot=buildBeneficiarySlot({id:"slot1" as never,group,memberships:members,previouslyPaidMemberIds:new Set(),scheduledFor:"2026-10-05"});
  assert.equal(slot.status,"scheduled");
  const pool=calculateTontinePool({
    group,
    contributions:[
      {id:"c1" as never,groupId:group.id,membershipId:"m1" as never,scheduledFor:"2026-10-05",amountMinor:1000n,currency:"XOF",status:"confirmed",channel:"cash_point",idempotencyKey:"c1-idempotency"},
      {id:"c2" as never,groupId:group.id,membershipId:"m2" as never,scheduledFor:"2026-10-05",amountMinor:1000n,currency:"XOF",status:"confirmed",channel:"cash_point",idempotencyKey:"c2-idempotency"}
    ],
    fees:[
      {contributionId:"c1" as never,microfinanceFeeMinor:50n,tpayFeeMinor:50n,totalFeeMinor:100n,currency:"XOF",ruleVersion:"r1",calculatedAt:"2026-10-05T00:00:00Z"},
      {contributionId:"c2" as never,microfinanceFeeMinor:50n,tpayFeeMinor:50n,totalFeeMinor:100n,currency:"XOF",ruleVersion:"r1",calculatedAt:"2026-10-05T00:00:00Z"}
    ]
  });
  assert.equal(pool.netBeneficiaryAmountMinor,1800n);
});

test("payout is blocked by unresolved financial exception",()=>{
  const plan=buildTontinePayoutPlan({
    organizationId:"o1" as never,cycleId:"cycle1",beneficiaryMembershipId:"m1" as never,
    beneficiaryClientId:"c1" as never,microfinanceId:"mf1" as never,destinationRef:"mf-account:c1",
    amountMinor:1800n,currency:"XOF",kycVerified:true,unresolvedFinancialException:true,humanApprovalRequired:true,
    now:"2026-10-05T00:00:00Z"
  },members[0]!);
  assert.equal(plan.gate,"blocked");
});

test("payout requires KYC and then independent human approval",()=>{
  const pending=buildTontinePayoutPlan({
    organizationId:"o1" as never,cycleId:"cycle1",beneficiaryMembershipId:"m1" as never,
    beneficiaryClientId:"c1" as never,microfinanceId:"mf1" as never,destinationRef:"mf-account:c1",
    amountMinor:1800n,currency:"XOF",kycVerified:false,unresolvedFinancialException:false,humanApprovalRequired:true,
    now:"2026-10-05T00:00:00Z"
  },members[0]!);
  assert.equal(pending.gate,"pending_kyc");
  const approvalPlan=buildTontinePayoutPlan({
    organizationId:"o1" as never,cycleId:"cycle1",beneficiaryMembershipId:"m1" as never,
    beneficiaryClientId:"c1" as never,microfinanceId:"mf1" as never,destinationRef:"mf-account:c1",
    amountMinor:1800n,currency:"XOF",kycVerified:true,unresolvedFinancialException:false,humanApprovalRequired:true,
    now:"2026-10-05T00:00:00Z"
  },members[0]!);
  const approved=approveTontinePayout(approvalPlan,{payoutId:approvalPlan.intent.payoutId,approverId:"supervisor",decision:"approve",at:"2026-10-05T00:00:00Z"});
  assert.equal(approved.state,"approved");
});
