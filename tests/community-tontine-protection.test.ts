import test from "node:test";
import assert from "node:assert/strict";
import {
  computeTontineProtectionPolicyHash, evaluateTontineProtectionClaim,
  quoteTontineProtectionPremium, validateTontineProtectionPolicy,
  type CommunityTontineProtectionPolicy
} from "../packages/microfinance/src/community-tontine-protection.js";

const org="10000000-0000-4000-8000-000000000001" as never;
const group="10000000-0000-4000-8000-000000000002" as never;
const maker="10000000-0000-4000-8000-000000000003" as never;
const checker="10000000-0000-4000-8000-000000000004" as never;
const insurer="10000000-0000-4000-8000-000000000005" as never;
const now="2026-11-18T08:00:00.000Z";

function policy(overrides: Partial<CommunityTontineProtectionPolicy> = {}): CommunityTontineProtectionPolicy {
  const value: CommunityTontineProtectionPolicy = {
    id:"10000000-0000-4000-8000-000000000010" as never, organizationId:org, groupId:group,
    version:"v1",currency:"XOF",state:"ACTIVE",proposalOrigin:"TPAY",riskBearer:"LICENSED_INSURER",
    insurerPartnerId:insurer,insurerLicenseReference:"CIMA-LICENSE-TO-BE-VERIFIED",
    insurerContractReference:"CONTRACT-TO-BE-EXECUTED",effectiveFrom:"2026-11-01T00:00:00.000Z",
    createdBy:maker,approvedBy:checker,policyHash:"0".repeat(64),
    tiers:[
      {tier:"ESSENTIEL",premiumRateBps:100,coveredInstallments:1,gracePeriodDays:7,waitingPeriodDays:14,maxClaimMinor:100_000n},
      {tier:"EQUILIBRE",premiumRateBps:200,coveredInstallments:2,gracePeriodDays:14,waitingPeriodDays:14,maxClaimMinor:250_000n},
      {tier:"RENFORCE",premiumRateBps:300,coveredInstallments:3,gracePeriodDays:21,waitingPeriodDays:30,maxClaimMinor:500_000n}
    ],...overrides
  };
  value.policyHash=computeTontineProtectionPolicyHash(value);
  return value;
}

test("protection premiums are computed in XOF minor units with explicit coverage caps",()=>{
  const p=policy();
  const essential=quoteTontineProtectionPremium({policy:p,tier:"ESSENTIEL",installmentMinor:1_000_000n,currency:"XOF",now});
  const balanced=quoteTontineProtectionPremium({policy:p,tier:"EQUILIBRE",installmentMinor:1_000_000n,currency:"XOF",now});
  const reinforced=quoteTontineProtectionPremium({policy:p,tier:"RENFORCE",installmentMinor:1_000_000n,currency:"XOF",now});
  assert.equal(essential.premiumMinor,10_000n);
  assert.equal(balanced.premiumMinor,20_000n);
  assert.equal(reinforced.premiumMinor,30_000n);
  assert.equal(essential.coverageLimitMinor,1_000_000n);
  assert.equal(balanced.coverageLimitMinor,2_000_000n);
  assert.equal(reinforced.coverageLimitMinor,3_000_000n);
});

test("protection policy requires a licensed insurer contract and independent approval",()=>{
  assert.throws(()=>validateTontineProtectionPolicy(policy({insurerContractReference:""})),
    /TONTINE_PROTECTION_LICENSED_INSURER_CONTRACT_REQUIRED/);
  assert.throws(()=>validateTontineProtectionPolicy(policy({approvedBy:maker})),
    /TONTINE_PROTECTION_MAKER_CHECKER_REQUIRED/);
  const missingApproval=policy();
  delete missingApproval.approvedBy;
  missingApproval.policyHash=computeTontineProtectionPolicyHash(missingApproval);
  assert.throws(()=>validateTontineProtectionPolicy(missingApproval),
    /TONTINE_PROTECTION_APPROVAL_REQUIRED/);
});

test("claim is blocked until coverage, premium, waiting period, grace and independent abandonment evidence exist",()=>{
  const p=policy();
  const evidence={
    scheduledInstallmentMinor:1_000_000n,dueAt:now,now,
    gracePeriodElapsed:true,waitingPeriodElapsed:true,memberWasCoveredAtDueDate:true,
    premiumSettledForInstallment:true,memberContactAttempts:2,independentReviews:2,
    confirmedAbandonment:true,fraudFlag:false
  };
  const decision=evaluateTontineProtectionClaim({policy:p,tier:"EQUILIBRE",evidence});
  assert.equal(decision.eligible,true);
  assert.equal(decision.maximumPayableMinor,2_000_000n);
  assert.equal(decision.code,"TONTINE_PROTECTION_CLAIM_REQUIRES_INSURER_APPROVAL");
  const unpaid=evaluateTontineProtectionClaim({policy:p,tier:"EQUILIBRE",evidence:{...evidence,premiumSettledForInstallment:false}});
  assert.equal(unpaid.eligible,false);
  assert.equal(unpaid.maximumPayableMinor,0n);
});

test("fraud flag or lack of independent reviews blocks a cycle protection claim",()=>{
  const p=policy();
  const base={
    scheduledInstallmentMinor:100_000n,dueAt:now,now,gracePeriodElapsed:true,
    waitingPeriodElapsed:true,memberWasCoveredAtDueDate:true,premiumSettledForInstallment:true,
    memberContactAttempts:2,independentReviews:1,confirmedAbandonment:true,fraudFlag:false
  };
  assert.equal(evaluateTontineProtectionClaim({policy:p,tier:"ESSENTIEL",evidence:base}).code,
    "TONTINE_PROTECTION_INDEPENDENT_REVIEW_REQUIRED");
  assert.equal(evaluateTontineProtectionClaim({policy:p,tier:"ESSENTIEL",evidence:{...base,independentReviews:2,fraudFlag:true}}).code,
    "TONTINE_PROTECTION_FRAUD_REVIEW_BLOCKED");
});

test("premium quote rejects currency mismatch and inactive policy",()=>{
  assert.throws(()=>quoteTontineProtectionPremium({policy:policy(),tier:"ESSENTIEL",installmentMinor:1000n,currency:"USD",now}),
    /TONTINE_PROTECTION_QUOTE_INPUT_INVALID/);
  assert.throws(()=>quoteTontineProtectionPremium({policy:policy({state:"DRAFT"}),tier:"ESSENTIEL",installmentMinor:1000n,currency:"XOF",now}),
    /TONTINE_PROTECTION_POLICY_NOT_ACTIVE/);
});
