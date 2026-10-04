import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCreditEligibility } from "../packages/microfinance/src/kyc-credit.js";

const base={
 kyc:{kycId:"k",organizationId:"o",customerId:"c",status:"verified" as const,riskLevel:"low" as const,policyVersion:"2026.10"},
 requestedAmountMinor:100000n,existingExposureMinor:200000n,monthlyRepaymentCapacityMinor:100000n,
 maxExposureMinor:500000n,maxDebtServiceRatioBps:5000,requestedTermDays:30,repaymentPeriodDays:30,policyVersion:"2026.10",
 delinquent:false,manualReviewRequired:false
};
test("approves deterministic low-risk application inside exposure and repayment limits",()=>{
 const d=evaluateCreditEligibility(base); assert.equal(d.decision,"approve"); assert.equal(d.exposureMinor,300000n);
});
test("never approves without verified KYC",()=>{
 const d=evaluateCreditEligibility({...base,kyc:{...base.kyc,status:"pending"}}); assert.equal(d.decision,"manual_review");
});
test("blocks delinquent customer from automatic approval",()=>{
 const d=evaluateCreditEligibility({...base,delinquent:true}); assert.equal(d.decision,"manual_review");
});
test("rejects cross-policy exposure breach",()=>{
 const d=evaluateCreditEligibility({...base,requestedAmountMinor:400000n}); assert.equal(d.decision,"reject"); assert.deepEqual(d.reasonCodes,["EXPOSURE_LIMIT"]);
});
test("high-risk profile requires human review",()=>{
 const d=evaluateCreditEligibility({...base,kyc:{...base.kyc,riskLevel:"high"}}); assert.equal(d.decision,"manual_review");
});

test("uses actual repayment periods for multi-month terms",()=>{
 const d=evaluateCreditEligibility({...base,requestedAmountMinor:200000n,requestedTermDays:60,repaymentPeriodDays:30,monthlyRepaymentCapacityMinor:100000n}); assert.equal(d.decision,"approve"); assert.equal(d.debtServiceRatioBps,10000);
});
