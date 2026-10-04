export interface KycVerificationEvent{organizationId:string;kycId:string;customerId:string;provider:string;externalReference:string;evidenceHash:string;status:"submitted"|"verified"|"rejected"|"expired"|"quarantined";verifiedAt?:string;expiresAt?:string;}
export interface KycVerificationProvider{verify(input:{customerId:string;evidenceRef:string;correlationId:string}):Promise<{provider:string;externalReference:string;status:"verified"|"rejected"|"pending";evidenceHash:string;expiresAt?:string}>;}
export function acceptKycVerification(e:KycVerificationEvent,now=new Date()):void{
 if(!e.organizationId||!e.kycId||!e.customerId||!e.provider||!e.externalReference||!e.evidenceHash)throw new Error("KYC_VERIFICATION_IDENTITY_INVALID");
 if(e.status==="verified"){if(!e.verifiedAt)throw new Error("KYC_VERIFIED_AT_REQUIRED");if(e.expiresAt&&new Date(e.expiresAt)<=now)throw new Error("KYC_VERIFICATION_ALREADY_EXPIRED");}
}
