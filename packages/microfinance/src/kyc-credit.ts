export type KycStatus = "pending"|"verified"|"rejected"|"expired"|"needs_review";
export type KycRiskLevel = "low"|"medium"|"high"|"blocked";
export type KycEvidenceType = "id_document"|"selfie_liveness"|"address"|"consent"|"income";
export type CreditStatus =
  | "draft"|"submitted"|"kyc_pending"|"underwriting"|"approved"|"rejected"
  | "disbursement_pending"|"active"|"delinquent"|"restructured"|"closed"|"writeoff";

export interface KycProfile {
  kycId:string; organizationId:string; customerId:string; status:KycStatus;
  riskLevel:KycRiskLevel; policyVersion:string; verifiedAt?:string; expiresAt?:string;
}
export interface KycEvidence {
  evidenceId:string; organizationId:string; kycId:string; type:KycEvidenceType;
  evidenceHash:string; status:"submitted"|"verified"|"rejected"|"expired";
  provider?:string; externalReference?:string; collectedAt:string;
}
export interface CreditApplication {
  applicationId:string; organizationId:string; customerId:string; partnerMfiId:string;
  requestedAmountMinor:bigint; currency:string; termDays:number; purpose:string;
  status:CreditStatus; policyVersion:string;
}
export interface CreditDecision {
  decision:"approve"|"reject"|"manual_review";
  policyVersion:string;
  exposureMinor:bigint;
  repaymentCapacityMinor:bigint;
  debtServiceRatioBps:number;
  reasonCodes:readonly string[];
}

export interface EligibilityInput {
  kyc:KycProfile;
  requestedAmountMinor:bigint;
  existingExposureMinor:bigint;
  monthlyRepaymentCapacityMinor:bigint;
  maxExposureMinor:bigint;
  maxDebtServiceRatioBps:number;
  requestedTermDays:number;
  policyVersion:string;
  delinquent:boolean;
  manualReviewRequired:boolean;
}

export function evaluateCreditEligibility(input:EligibilityInput):CreditDecision {
  if(input.requestedAmountMinor<=0n) throw new Error("MFI_CREDIT_AMOUNT_INVALID");
  if(input.existingExposureMinor<0n || input.monthlyRepaymentCapacityMinor<0n) throw new Error("MFI_CREDIT_METRIC_INVALID");
  if(input.maxExposureMinor<0n || input.maxDebtServiceRatioBps<0) throw new Error("MFI_CREDIT_POLICY_INVALID");
  if(input.requestedTermDays<=0 || input.repaymentPeriodDays<=0) throw new Error("MFI_CREDIT_TERM_INVALID");
  if(input.policyVersion.trim()==="") throw new Error("MFI_CREDIT_POLICY_VERSION_REQUIRED");
  if(input.kyc.status!=="verified") return {decision:"manual_review",policyVersion:input.policyVersion,exposureMinor:input.existingExposureMinor,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:0,reasonCodes:["KYC_NOT_VERIFIED"]};
  if(input.kyc.riskLevel==="blocked") return {decision:"reject",policyVersion:input.policyVersion,exposureMinor:input.existingExposureMinor,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:0,reasonCodes:["KYC_BLOCKED"]};
  if(input.delinquent) return {decision:"manual_review",policyVersion:input.policyVersion,exposureMinor:input.existingExposureMinor,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:0,reasonCodes:["EXISTING_DELINQUENCY"]};
  const exposure=input.existingExposureMinor+input.requestedAmountMinor;
  if(exposure>input.maxExposureMinor) return {decision:"reject",policyVersion:input.policyVersion,exposureMinor:exposure,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:0,reasonCodes:["EXPOSURE_LIMIT"]};
  const repaymentPeriods=Math.ceil(input.requestedTermDays/input.repaymentPeriodDays);
  const installment=(input.requestedAmountMinor + BigInt(repaymentPeriods-1)) / BigInt(repaymentPeriods);
  const ratio=input.monthlyRepaymentCapacityMinor===0n ? Number.MAX_SAFE_INTEGER : Number((installment*10000n)/input.monthlyRepaymentCapacityMinor);
  if(ratio>input.maxDebtServiceRatioBps) return {decision:"reject",policyVersion:input.policyVersion,exposureMinor:exposure,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:ratio,reasonCodes:["DEBT_SERVICE_RATIO_LIMIT"]};
  if(input.manualReviewRequired || input.kyc.riskLevel==="high") return {decision:"manual_review",policyVersion:input.policyVersion,exposureMinor:exposure,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:ratio,reasonCodes:["HUMAN_REVIEW_REQUIRED"]};
  return {decision:"approve",policyVersion:input.policyVersion,exposureMinor:exposure,repaymentCapacityMinor:input.monthlyRepaymentCapacityMinor,debtServiceRatioBps:ratio,reasonCodes:["POLICY_PASS"]};
}

export function assertDisbursementRequiresPartnerApproval(decision:CreditDecision):void {
  if(decision.decision!=="approve") throw new Error("MFI_DISBURSEMENT_NOT_APPROVED");
}
