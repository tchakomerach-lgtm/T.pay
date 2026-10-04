import type { TontineCycle, TontineMemberSchedule } from "./tontine-cycle.js";
export interface CycleClosureEvidence {cycleId:string;pendingContributions:number;pendingPayouts:number;openExceptions:number;reconciliationComplete:boolean;}
export function assertCycleCanClose(e:CycleClosureEvidence):void{
 if(e.pendingContributions>0)throw new Error("CYCLE_PENDING_CONTRIBUTIONS");
 if(e.pendingPayouts>0)throw new Error("CYCLE_PENDING_PAYOUTS");
 if(e.openExceptions>0)throw new Error("CYCLE_OPEN_EXCEPTIONS");
 if(!e.reconciliationComplete)throw new Error("CYCLE_RECONCILIATION_INCOMPLETE");
}
export function closeCycleSafely(cycle:TontineCycle,e:CycleClosureEvidence,closedAt:string):TontineCycle{
 if(cycle.id!==e.cycleId)throw new Error("CYCLE_IDENTITY_MISMATCH");
 if(cycle.status==="cancelled")throw new Error("CYCLE_CANCELLED");
 assertCycleCanClose(e);
 if(cycle.status!=="settlement_pending")throw new Error("CYCLE_NOT_SETTLEMENT_PENDING");
 return {...cycle,status:"closed",closedAt};
}
export function pauseCycle(cycle:TontineCycle,reason:string):TontineCycle{
 if(!reason.trim())throw new Error("CYCLE_PAUSE_REASON_REQUIRED");
 if(cycle.status==="closed"||cycle.status==="cancelled")throw new Error("CYCLE_NOT_PAUSABLE");
 return {...cycle,status:"paused"};
}
export function resumeCycle(cycle:TontineCycle):TontineCycle{
 if(cycle.status!=="paused")throw new Error("CYCLE_NOT_PAUSED");
 return {...cycle,status:"settlement_pending"};
}
