import test from "node:test";
import assert from "node:assert/strict";
import { validateCommunityTontine } from "../packages/microfinance/src/community-tontine.js";
import { scheduleContribution, assertPayoutAllowed } from "../packages/microfinance/src/tontine-rules.js";
import { reconcileTontinePayment } from "../packages/microfinance/src/tontine-reconciliation.js";
import { createContributionIntent } from "../packages/microfinance/src/community-tontine-service.js";

const group = {
  id:"g" as never, name:"Tontine Solidarité", countryCode:"TG", currency:"XOF",
  frequency:"daily" as const, contributionMode:"fixed" as const, fixedAmountMinor:500n,
  minimumAmountMinor:500n, cycleNumber:1, governance:"member_vote" as const,
  status:"active" as const, createdBy:"u" as never, createdAt:"2026-10-03T00:00:00Z"
};

test("community tontine supports daily fixed contributions at the field minimum", () => {
  assert.doesNotThrow(() => validateCommunityTontine(group));
  assert.deepEqual(scheduleContribution(group,"2026-10-03",3).map(x=>x.scheduledFor),[
    "2026-10-03","2026-10-04","2026-10-05"
  ]);
});

test("contribution intent is tenant/group scoped and idempotent", async () => {
  let inserted = 0;
  const existing = {
    id:"c0" as never, groupId:group.id, membershipId:"m" as never, scheduledFor:"2026-10-03",
    amountMinor:500n, currency:"XOF", status:"confirmed" as const, channel:"wallet" as const,
    idempotencyKey:"idem-123456789012"
  };
  const result = await createContributionIntent({
    id:"c1" as never, groupId:group.id, membershipId:"m" as never, scheduledFor:"2026-10-03",
    amountMinor:500n, currency:"XOF", channel:"wallet", idempotencyKey:"idem-123456789012"
  }, {repository:{
    findGroup:async()=>group, findMembership:async()=>({id:"m" as never,groupId:group.id,clientId:"c" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-01"}),
    findContributionByIdempotency:async()=>existing, insertContribution:async()=>{inserted++},
    findBeneficiarySlot:async()=>undefined, markBeneficiaryPaid:async()=>{}
  }});
  assert.equal(result.id,"c0");
  assert.equal(inserted,0);
});

test("payout requires explicit security gates when configured", () => {
  const slot={id:"s" as never,groupId:group.id,cycleNumber:1,sequence:1,beneficiaryMemberId:"m" as never,amountTargetMinor:1000n,status:"scheduled" as const,scheduledFor:"2026-10-03"};
  assert.throws(()=>assertPayoutAllowed(group,slot,{
    version:"1",minimumAttendanceRatioBps:0n,missedContributionGracePeriods:0,
    allowEarlyBeneficiaryPayment:false,requireKycBeforePayout:true,requireHumanApprovalForPayout:true,allowMemberVoteChanges:true
  },false,false),/TONTINE_KYC_REQUIRED/);
});

test("provider/ledger mismatches never self-heal silently", () => {
  assert.equal(reconcileTontinePayment(
    {provider:"tmoney",providerReference:"p",groupId:group.id,amountMinor:500n,currency:"XOF",status:"completed"},
    {contributionId:"c" as never,groupId:group.id,amountMinor:700n,currency:"XOF",status:"confirmed"}
  ),"mismatch");
});
