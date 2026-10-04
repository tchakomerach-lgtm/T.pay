import {
 calculateExpectedCash,
 classifyCashReconciliation,
 type CashMovement,
 type ReconciliationClassification
} from "./collection-reconciliation.js";

export interface CashReconciliationResult {
 expectedMinor: bigint;
 countedMinor: bigint;
 varianceMinor: bigint;
 classification?: ReconciliationClassification;
 requiresHumanReview: boolean;
}

export interface CashReconciliationRepository {
 getOpeningFloat(sessionId:string):Promise<bigint>;
 listMovements(sessionId:string):Promise<readonly CashMovement[]>;
 getSessionCurrency(sessionId:string):Promise<string>;
 getCountedCurrency(sessionId:string):Promise<string>;
 getCountedClose(sessionId:string):Promise<bigint|undefined>;
}

export async function reconcileCashSession(
 sessionId:string,
 repository:CashReconciliationRepository
):Promise<CashReconciliationResult>{
 const [opening,movements,currency,countedCurrency,counted]=await Promise.all([
  repository.getOpeningFloat(sessionId),
  repository.listMovements(sessionId),
  repository.getSessionCurrency(sessionId),
  repository.getCountedCurrency(sessionId),
  repository.getCountedClose(sessionId)
 ]);
 if(counted===undefined)throw new Error("MFI_CASH_COUNT_REQUIRED");
 const expectedMinor=calculateExpectedCash(opening,movements);
 const result=classifyCashReconciliation(expectedMinor,counted,currency===countedCurrency);
 return {...result,expectedMinor,countedMinor:counted,requiresHumanReview:result.classification!==undefined};
}
