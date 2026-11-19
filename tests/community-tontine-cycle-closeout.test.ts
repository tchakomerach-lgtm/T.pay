import test from "node:test";
import assert from "node:assert/strict";
import { calculateCommunityTontineCycleCloseout } from "../packages/microfinance/src/community-tontine-cycle-closeout.js";

const org="10000000-0000-4000-8000-000000000001" as never;
const group="10000000-0000-4000-8000-000000000002" as never;
const cycle="10000000-0000-4000-8000-000000000003" as never;
const a="10000000-0000-4000-8000-000000000004" as never;
const b="10000000-0000-4000-8000-000000000005" as never;
const base={
 organizationId:org,groupId:group,cycleId:cycle,currency:"XOF",
 shares:[
  {memberId:a,grossRefundableMinor:10_000n,otherContractualDeductionsMinor:100n},
  {memberId:b,grossRefundableMinor:20_000n,otherContractualDeductionsMinor:0n}
 ],
 tpayCommissionMinor:300n,microfinanceCommissionMinor:600n,
 earnedInsurancePremiumMinor:500n,approvedClaimsMinor:100n,incidentCount:0,
 allPaymentsReconciled:true,allDisputesResolved:true,allCallbacksFinal:true,
 reservesSufficient:true,contractualHoldExpired:true
};

test("cycle closeout allocates commissions pro rata and reconciles exact member net refunds",()=>{
 const result=calculateCommunityTontineCycleCloseout(base);
 assert.equal(result.grossRefundableMinor,30_000n);
 assert.equal(result.netRefundMinor,29_000n);
 assert.equal(result.allocations.reduce((s,x)=>s+x.netRefundMinor,0n),29_000n);
 assert.equal(result.allocations.find(x=>x.memberId===a)?.tpayCommissionMinor,100n);
 assert.equal(result.allocations.find(x=>x.memberId===b)?.tpayCommissionMinor,200n);
 assert.equal(result.allocations.find(x=>x.memberId===a)?.microfinanceCommissionMinor,200n);
 assert.equal(result.allocations.find(x=>x.memberId===b)?.microfinanceCommissionMinor,400n);
 assert.match(result.calculationHash,/^[a-f0-9]{64}$/);
 assert.match(result.idempotencyKey,/^tontine-cycle-closeout:/);
});

test("closeout blocks on any open incident, dispute, pending callback or unreconciled payment",()=>{
 for(const [key,value,code] of [
  ["incidentCount",1,"TONTINE_CLOSEOUT_INCIDENTS_OPEN"],
  ["allDisputesResolved",false,"TONTINE_CLOSEOUT_DISPUTES_OPEN"],
  ["allCallbacksFinal",false,"TONTINE_CLOSEOUT_CALLBACKS_PENDING"],
  ["allPaymentsReconciled",false,"TONTINE_CLOSEOUT_PAYMENTS_UNRECONCILED"]
 ] as const){
  assert.throws(()=>calculateCommunityTontineCycleCloseout({...base,[key]:value}),new RegExp(code));
 }
});

test("closeout never deducts more than refundable balance and rejects duplicate members",()=>{
 assert.throws(()=>calculateCommunityTontineCycleCloseout({...base,tpayCommissionMinor:40_000n}),
  /TONTINE_CLOSEOUT_DEDUCTIONS_EXCEED_REFUNDABLE/);
 assert.throws(()=>calculateCommunityTontineCycleCloseout({...base,shares:[base.shares[0],base.shares[0]]}),
  /TONTINE_CLOSEOUT_DUPLICATE_MEMBER/);
});

test("closeout snapshot hash and idempotency are stable regardless of input member ordering",()=>{
 const left=calculateCommunityTontineCycleCloseout(base);
 const right=calculateCommunityTontineCycleCloseout({...base,shares:[...base.shares].reverse()});
 assert.equal(left.calculationHash,right.calculationHash);
 assert.equal(left.idempotencyKey,right.idempotencyKey);
});
