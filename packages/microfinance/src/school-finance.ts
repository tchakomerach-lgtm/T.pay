export interface SchoolFinanceRequest{requestId:string;organizationId:string;schoolId:string;parentId:string;studentId:string;partnerMfiId:string;annualTuitionMinor:bigint;supplyMinor:bigint;dailyRecoveryMinimumMinor:bigint;currency:string;status:"requested"|"approved"|"funded"|"repaid"|"rejected";}
export interface SchoolFinanceCommissionPolicy{version:string;mfiBps:number;tpayBps:number;supplyMarginBps:number;}
export function validateSchoolFinanceRequest(r:SchoolFinanceRequest,p:SchoolFinanceCommissionPolicy):void{
 if(r.annualTuitionMinor<0n||r.supplyMinor<0n||r.annualTuitionMinor+r.supplyMinor<=0n)throw new Error("SCHOOL_FINANCE_AMOUNT_INVALID");
 if(r.dailyRecoveryMinimumMinor<=0n)throw new Error("SCHOOL_FINANCE_DAILY_MIN_INVALID");
 if(!p.version||p.mfiBps<0||p.tpayBps<0||p.supplyMarginBps<0)throw new Error("SCHOOL_FINANCE_POLICY_INVALID");
}
export function calculateSchoolFinanceFees(amountMinor:bigint,p:SchoolFinanceCommissionPolicy){return {mfiFeeMinor:amountMinor*BigInt(p.mfiBps)/10000n,tpayFeeMinor:amountMinor*BigInt(p.tpayBps)/10000n,supplyMarginMinor:amountMinor*BigInt(p.supplyMarginBps)/10000n,ruleVersion:p.version};}
