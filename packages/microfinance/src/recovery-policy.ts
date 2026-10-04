export interface RecoveryPolicy{version:string;minimumMinor:bigint;allowPartial:boolean;overpayment:"reject"|"credit_next_installment"|"manual_review";graceDays:number;}
export function validateRecoveryPolicy(p:RecoveryPolicy):void{if(!p.version||p.minimumMinor<=0n||p.graceDays<0)throw new Error("RECOVERY_POLICY_INVALID");}
export function enforceDailyMinimum(amountMinor:bigint,p:RecoveryPolicy):void{if(amountMinor<p.minimumMinor)throw new Error("RECOVERY_BELOW_POLICY_MINIMUM");}
