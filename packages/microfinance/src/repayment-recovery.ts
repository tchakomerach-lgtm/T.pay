export type RepaymentSource="cash_agent"|"tmoney"|"flooz"|"pi_spi"|"tontine"|"partner_mfi";
export type ScheduleState="scheduled"|"due"|"partial"|"paid"|"delinquent"|"restructured"|"written_off";
export interface RepaymentSchedule{scheduleId:string;organizationId:string;creditRequestId:string;installmentNo:number;dueAt:string;principalDueMinor:bigint;interestDueMinor:bigint;feeDueMinor:bigint;principalPaidMinor:bigint;interestPaidMinor:bigint;feePaidMinor:bigint;graceUntil?:string;state:ScheduleState;policyVersion:string;}
export interface RepaymentIntent{repaymentId:string;organizationId:string;creditRequestId:string;scheduleId?:string;payerId:string;amountMinor:bigint;currency:string;source:RepaymentSource;idempotencyKey:string;providerReference?:string;status:"pending"|"accepted"|"rejected"|"quarantined"|"settled";occurredAt:string;}
export interface Allocation{principalMinor:bigint;interestMinor:bigint;feeMinor:bigint;}
export function outstanding(s:RepaymentSchedule):bigint{
 return (s.principalDueMinor-s.principalPaidMinor)+(s.interestDueMinor-s.interestPaidMinor)+(s.feeDueMinor-s.feePaidMinor);
}
export function allocateRepayment(s:RepaymentSchedule,amount:bigint):Allocation{
 if(amount<=0n)throw new Error("REPAYMENT_AMOUNT_INVALID"); if(amount>outstanding(s))throw new Error("REPAYMENT_OVERPAYMENT_REQUIRES_EXPLICIT_POLICY");
 let rest=amount; const fee=s.feeDueMinor-s.feePaidMinor, interest=s.interestDueMinor-s.interestPaidMinor, principal=s.principalDueMinor-s.principalPaidMinor;
 const feeMinor=rest<fee?rest:fee; rest-=feeMinor; const interestMinor=rest<interest?rest:interest; rest-=interestMinor; const principalMinor=rest<principal?rest:principal;
 return {feeMinor,interestMinor,principalMinor};
}
export function nextScheduleState(s:RepaymentSchedule,a:Allocation,now=new Date()):ScheduleState{
 const np=s.principalPaidMinor+a.principalMinor,ni=s.interestPaidMinor+a.interestMinor,nf=s.feePaidMinor+a.feeMinor;
 if(np>=s.principalDueMinor&&ni>=s.interestDueMinor&&nf>=s.feeDueMinor)return "paid";
 if(now.getTime()>new Date(s.graceUntil??s.dueAt).getTime())return "delinquent";
 if(np>0n||ni>0n||nf>0n)return "partial"; return s.state==="scheduled"?"due":s.state;
}
export function validateRepaymentIntent(i:RepaymentIntent):void{
 if(i.amountMinor<=0n)throw new Error("REPAYMENT_AMOUNT_INVALID"); if(i.idempotencyKey.length<16)throw new Error("REPAYMENT_IDEMPOTENCY_INVALID");
 if(!/^[A-Z]{3}$/.test(i.currency))throw new Error("REPAYMENT_CURRENCY_INVALID"); if(!i.organizationId||!i.creditRequestId||!i.payerId)throw new Error("REPAYMENT_IDENTITY_INVALID");
}
export function buildRepaymentLedgerIdempotency(i:RepaymentIntent):string{return `mfi-repayment:${i.organizationId}:${i.repaymentId}`;}
