import { assertKycVerified, type KycProfile } from "../../microfinance/src/kyc.js";
import type { PayoutIntent } from "./payout.js";

export interface PayoutBeneficiaryKycInput { payout:PayoutIntent; profile:KycProfile; now?:Date; }
export function assertPayoutBeneficiaryEligible(input:PayoutBeneficiaryKycInput):void {
 if(input.payout.organizationId!==input.profile.userId && input.payout.beneficiaryId!==input.profile.userId) {
   throw new Error("PAYOUT_KYC_BENEFICIARY_IDENTITY_MISMATCH");
 }
 assertKycVerified(input.profile,input.now);
 if(!input.payout.kycVerified) throw new Error("PAYOUT_KYC_FLAG_STALE");
}
