import test from "node:test";
import assert from "node:assert/strict";
import { validateCommunityTontine } from "../packages/microfinance/src/community-tontine.js";
import { scheduleContribution, assertPayoutAllowed } from "../packages/microfinance/src/tontine-rules.js";
import { reconcileTontinePayment } from "../packages/microfinance/src/tontine-reconciliation.js";
import { createContributionIntent, initiateContributionPayment } from "../packages/microfinance/src/community-tontine-service.js";

const group = {
  id:"g" as never, name:"Tontine Solidarité", countryCode:"TG", currency:"XOF",
  frequency:"daily" as const, contributionMode:"fixed" as const, fixedAmountMinor:500n,
  minimumAmountMinor:500n, cycleNumber:1, governance:"member_vote" as const,
  status:"active" as const, createdBy:"u" as never, createdAt:"2026-10-03T00:00:00Z"
};

test("community tontine accepts a creator-defined minimum instead of a hard-coded 500 floor", () => {
  assert.doesNotThrow(() => validateCommunityTontine(group));
  const lowMinimum = { ...group, fixedAmountMinor: 125n, minimumAmountMinor: 125n };
  assert.doesNotThrow(() => validateCommunityTontine(lowMinimum));
  const customMinimum = { ...group, fixedAmountMinor: 2750n, minimumAmountMinor: 2750n };
  assert.doesNotThrow(() => validateCommunityTontine(customMinimum));
  assert.deepEqual(scheduleContribution(group,"2026-10-03",3).map(x=>x.scheduledFor),[
    "2026-10-03","2026-10-04","2026-10-05"
  ]);
});

test("configured minimum is enforced for contribution intents", async () => {
  const customGroup = { ...group, fixedAmountMinor: 2750n, minimumAmountMinor: 2750n };
  const repository = {
    findGroup: async()=>customGroup,
    findMembership: async()=>({id:"m" as never,groupId:customGroup.id,clientId:"c" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-01"}),
    findContributionByIdempotency: async()=>undefined,
    insertContribution: async()=>{},
    findBeneficiarySlot: async()=>undefined,
    markBeneficiaryPaid: async()=>{}
  };
  await assert.rejects(
    createContributionIntent({
      id:"c1" as never, groupId:customGroup.id, membershipId:"m" as never, scheduledFor:"2026-10-03",
      amountMinor:2749n, currency:"XOF", channel:"wallet", idempotencyKey:"idem-123456789012"
    }, {repository}),
    /TONTINE_BELOW_MINIMUM/
  );
  const accepted = await createContributionIntent({
    id:"c2" as never, groupId:customGroup.id, membershipId:"m" as never, scheduledFor:"2026-10-03",
    amountMinor:2750n, currency:"XOF", channel:"wallet", idempotencyKey:"idem-accepted-12345"
  }, {repository});
  assert.equal(accepted.amountMinor,2750n);
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

test("payment notification is bound to the membership client, never the contribution id", async () => {
  const notifications: Array<{memberId?: string}> = [];
  const membership = {id:"m" as never,groupId:group.id,clientId:"client-1" as never,role:"member" as const,status:"active" as const,joinedAt:"2026-10-01"};
  const result = await initiateContributionPayment(
    {id:"c9" as never,groupId:group.id,membershipId:membership.id,scheduledFor:"2026-10-03",amountMinor:500n,currency:"XOF",status:"pending",channel:"wallet",idempotencyKey:"idem-payment-12345"},
    {
      provider:{initiate:async()=>({providerReference:"provider-1",status:"pending" as const})},
      repository:{findMembership:async()=>membership},
      notifications:{notify:async(input)=>{notifications.push({memberId:input.memberId as string})}}
    }
  );
  assert.equal(result.providerReference,"provider-1");
  assert.deepEqual(notifications,[{memberId:"client-1"}]);
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
