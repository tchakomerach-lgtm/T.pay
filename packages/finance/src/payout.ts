export type PayoutState="draft"|"pending_kyc"|"pending_approval"|"approved"|"initiated"|"confirmed"|"failed"|"reversed"|"cancelled";
export interface PayoutIntent{payoutId:string;organizationId:string;cycleId:string;beneficiaryId:string;amountMinor:bigint;currency:string;destinationRef:string;state:PayoutState;idempotencyKey:string;requiresHumanApproval:boolean;kycVerified:boolean;createdAt:string;}
export type ApprovalDecision="approve"|"reject";
export interface PayoutApproval{payoutId:string;approverId:string;decision:ApprovalDecision;reason?:string;at:string;}
export function assertPayoutTransition(from:PayoutState,to:PayoutState):void{
 const allowed:Record<PayoutState,PayoutState[]>={
 draft:["pending_kyc","pending_approval","cancelled"],pending_kyc:["pending_approval","cancelled"],pending_approval:["approved","cancelled"],approved:["initiated","cancelled"],initiated:["confirmed","failed"],confirmed:["reversed"],failed:["initiated","cancelled"],reversed:[],cancelled:[]
 };
 if(!allowed[from].includes(to))throw new Error("PAYOUT_INVALID_TRANSITION");
}
export function authorizePayout(i:PayoutIntent,approval:PayoutApproval|undefined):void{
 if(i.amountMinor<=0n)throw new Error("PAYOUT_AMOUNT_INVALID");
 if(!i.kycVerified)throw new Error("PAYOUT_KYC_REQUIRED");
 if(i.requiresHumanApproval){
  if(!approval||approval.payoutId!==i.payoutId||approval.decision!=="approve"||!approval.approverId)throw new Error("PAYOUT_HUMAN_APPROVAL_REQUIRED");
  if(approval.approverId===i.beneficiaryId)throw new Error("PAYOUT_SELF_APPROVAL_FORBIDDEN");
 }
 if(i.state!=="approved"&&i.state!=="pending_approval")throw new Error("PAYOUT_NOT_APPROVABLE");
}
export interface BeneficiaryCandidate{memberId:string;eligible:boolean;reason?:string;contributionsCount:number;lastPayoutCycleId?:string;}
export function selectRotationBeneficiary(candidates:readonly BeneficiaryCandidate[],previouslyPaid:ReadonlySet<string>):string{
 const eligible=candidates.filter(c=>c.eligible&&!previouslyPaid.has(c.memberId));
 if(!eligible.length)throw new Error("NO_ELIGIBLE_BENEFICIARY");
 return [...eligible].sort((a,b)=>b.contributionsCount-a.contributionsCount||a.memberId.localeCompare(b.memberId))[0]!.memberId;
}
