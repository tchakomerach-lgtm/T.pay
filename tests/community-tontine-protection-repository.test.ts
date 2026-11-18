import assert from "node:assert/strict";
import test from "node:test";
import type { UUID } from "../packages/domain/src/types.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";
import {
  computeTontineProtectionPolicyHash,
  type CommunityTontineProtectionPolicy
} from "../packages/microfinance/src/community-tontine-protection.js";
import { PostgresCommunityTontineProtectionRepository } from "../packages/microfinance/src/community-tontine-protection-repository.js";

const org="20000000-0000-4000-8000-000000000001" as UUID;
const group="20000000-0000-4000-8000-000000000002" as UUID;
const maker="20000000-0000-4000-8000-000000000003" as UUID;
const checker="20000000-0000-4000-8000-000000000004" as UUID;
const insurer="20000000-0000-4000-8000-000000000005" as UUID;
const now="2026-11-18T08:00:00.000Z";

function makePolicy(overrides: Partial<CommunityTontineProtectionPolicy> = {}): CommunityTontineProtectionPolicy {
  const value: CommunityTontineProtectionPolicy = {
    id:"20000000-0000-4000-8000-000000000010" as UUID,
    organizationId:org,groupId:group,version:"v1",currency:"XOF",state:"DRAFT",
    proposalOrigin:"TPAY",riskBearer:"LICENSED_INSURER",insurerPartnerId:insurer,
    insurerLicenseReference:"CIMA-REF-PENDING",insurerContractReference:"CONTRACT-REF-PENDING",
    insurerLicenseVerified:false,insurerContractVerified:false,effectiveFrom:"2026-11-01T00:00:00.000Z",
    createdBy:maker,
    tiers:[
      {tier:"ESSENTIEL",premiumRateBps:100,coveredInstallments:1,gracePeriodDays:7,waitingPeriodDays:14,maxClaimMinor:100_000n},
      {tier:"EQUILIBRE",premiumRateBps:200,coveredInstallments:2,gracePeriodDays:14,waitingPeriodDays:14,maxClaimMinor:250_000n},
      {tier:"RENFORCE",premiumRateBps:300,coveredInstallments:3,gracePeriodDays:21,waitingPeriodDays:30,maxClaimMinor:500_000n}
    ],
    policyHash:"0".repeat(64),...overrides
  };
  value.policyHash=computeTontineProtectionPolicyHash(value);
  return value;
}

function executor(handler:(sql:string,values?:readonly unknown[])=>{rows?:Record<string,unknown>[];rowCount?:number} = ()=>({rows:[],rowCount:1})) {
  const calls:Array<{sql:string;values?:readonly unknown[]}>=[];
  const db={
    async query(sql:string,values?:readonly unknown[]) {
      calls.push({sql,...(values?{values}:{})});
      const result=handler(sql,values);
      return {rows:result.rows??[],rowCount:result.rowCount??0};
    },
    async transaction<T>(work:(tx:TontineSqlExecutor)=>Promise<T>):Promise<T> {
      return work(db as unknown as TontineSqlExecutor);
    }
  };
  return {db:db as unknown as TontineSqlExecutor,calls};
}

test("policy creation persists the immutable hash and append-only proposal event without touching the Ledger",async()=>{
  const {db,calls}=executor();
  const repo=new PostgresCommunityTontineProtectionRepository(db);
  await repo.createPolicy(makePolicy(),now);
  assert.match(calls[0]!.sql,/INSERT INTO community_tontine_protection_policies/);
  assert.match(calls[1]!.sql,/INSERT INTO community_tontine_protection_events/);
  assert.equal(calls[0]!.values?.[14],makePolicy().policyHash);
  assert.equal(calls.some(call=>/INSERT INTO .*ledger|UPDATE .*ledger/i.test(call.sql)),false);
});

test("premium payment intent is linked before any settlement and creates an audit event",async()=>{
  const {db,calls}=executor((sql)=>sql.startsWith("UPDATE community_tontine_protection_premiums")
    ?{rows:[{enrollment_id:"20000000-0000-4000-8000-000000000020"}],rowCount:1}
    :{rows:[],rowCount:1});
  const repo=new PostgresCommunityTontineProtectionRepository(db);
  await repo.markPremiumPaymentPending({
    organizationId:org,groupId:group,premiumId:"20000000-0000-4000-8000-000000000030" as UUID,
    paymentIntentReference:"20000000-0000-4000-8000-000000000031" as UUID,actorId:maker,now
  });
  assert.match(calls[0]!.sql,/payment_intent_reference=\$4/);
  assert.match(calls[1]!.sql,/PREMIUM_PAYMENT_PENDING/);
});

test("premium cannot be settled without a verified Financial Core reference",async()=>{
  const {db,calls}=executor((sql)=>sql.startsWith("SELECT premium_minor")
    ?{rows:[{premium_minor:"2000",currency:"XOF",state:"PAYMENT_PENDING",financial_core_reference:null}],rowCount:1}
    :{rows:[],rowCount:1});
  const repo=new PostgresCommunityTontineProtectionRepository(db);
  await assert.rejects(repo.settlePremium({
    organizationId:org,groupId:group,premiumId:"20000000-0000-4000-8000-000000000030" as UUID,
    financialCoreReference:"20000000-0000-4000-8000-000000000032" as UUID,actorId:checker,settledAt:now,
    verifier:async()=>false
  }),/TONTINE_PROTECTION_FINANCIAL_CORE_SETTLEMENT_UNVERIFIED/);
  assert.equal(calls.length,1);
  assert.equal(calls.some(call=>/SET state='SETTLED'/.test(call.sql)),false);
});

test("claim calculation uses the stored installment and coverage dates, not caller-supplied amounts",async()=>{
  const active=makePolicy({
    state:"ACTIVE",approvedBy:checker,insurerLicenseVerified:true,insurerContractVerified:true,
    effectiveFrom:"2026-10-01T00:00:00.000Z"
  });
  const row={
    premium_id:"20000000-0000-4000-8000-000000000040",
    premium_minor:"2000",premium_state:"SETTLED",installment_minor:"100000",
    installment_reference:"20000000-0000-4000-8000-000000000041",
    due_at:"2026-11-01T00:00:00.000Z",
    enrollment_id:"20000000-0000-4000-8000-000000000042",
    tier:"EQUILIBRE",coverage_starts_at:"2026-10-01T00:00:00.000Z",enrollment_state:"ACTIVE",
    policy_id:active.id,organization_id:org,group_id:group,version:active.version,currency:active.currency,
    state:"ACTIVE",policy_state:"ACTIVE",proposal_origin:active.proposalOrigin,risk_bearer:"LICENSED_INSURER",
    insurer_partner_id:insurer,insurer_license_reference:active.insurerLicenseReference,
    insurer_contract_reference:active.insurerContractReference,insurer_license_verified:true,
    insurer_contract_verified:true,effective_from:active.effectiveFrom,effective_until:null,
    tiers:active.tiers,policy_hash:active.policyHash,created_by:maker,approved_by:checker
  };
  const {db,calls}=executor((sql)=>sql.startsWith("SELECT c.id AS premium_id")
    ?{rows:[row],rowCount:1}
    :{rows:[],rowCount:1});
  const repo=new PostgresCommunityTontineProtectionRepository(db);
  const result=await repo.evaluateAndSubmitClaim({
    organizationId:org,groupId:group,enrollmentId:row.enrollment_id as UUID,
    installmentReference:row.installment_reference as UUID,actorId:maker,
    evidence:{memberContactAttempts:2,independentReviews:2,confirmedAbandonment:true,fraudFlag:false},now
  });
  assert.equal(result.eligible,true);
  assert.equal(result.maximumPayableMinor,200_000n);
  const insert=calls.find(call=>call.sql.includes("INSERT INTO community_tontine_protection_claims"));
  assert.ok(insert);
  const evidence=JSON.parse(String(insert.values?.[8])) as Record<string,unknown>;
  assert.equal(evidence.scheduledInstallmentMinor,"100000");
  assert.equal(evidence.dueAt,"2026-11-01T00:00:00.000Z");
  assert.equal(evidence.premiumSettledForInstallment,true);
});
