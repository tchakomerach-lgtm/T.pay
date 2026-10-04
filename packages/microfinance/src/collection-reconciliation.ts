export type CollectionIntentStatus = "pending"|"accepted"|"rejected"|"quarantined";
export interface DurableCollectionIntent {
 collectionId:string; organizationId:string; partnerMfiId:string; clientId:string; agentId:string;
 amountMinor:bigint; currency:string; channel:"cash_agent"|"tmoney"|"flooz"|"pi_spi"|"partner_mfi";
 location:"home"|"work"|"other"; latitude?:number; longitude?:number; occurredAt:string;
 idempotencyKey:string; status:CollectionIntentStatus; providerReference?:string;
}
export interface CashMovement { movementId:string; sessionId:string; collectionId?:string; direction:"in"|"out"; amountMinor:bigint; currency:string; }
export type ReconciliationClassification="shortage"|"overage"|"currency_mismatch"|"missing_evidence"|"duplicate_collection";
export function calculateExpectedCash(openingFloatMinor:bigint,movements:readonly CashMovement[]):bigint{
 if(openingFloatMinor<0n)throw new Error("MFI_OPENING_FLOAT_INVALID"); let expected=openingFloatMinor;
 for(const movement of movements){if(movement.amountMinor<=0n)throw new Error("MFI_CASH_MOVEMENT_INVALID");
  if(movement.direction==="in")expected+=movement.amountMinor; else {if(movement.amountMinor>expected)throw new Error("MFI_CASH_OUT_EXCEEDS_EXPECTED"); expected-=movement.amountMinor;}}
 return expected;
}
export function classifyCashReconciliation(expectedMinor:bigint,countedMinor:bigint,currencyMatches:boolean):{classification?:ReconciliationClassification;varianceMinor:bigint}{
 if(countedMinor<0n)throw new Error("MFI_COUNTED_CASH_INVALID"); if(!currencyMatches)return {classification:"currency_mismatch",varianceMinor:countedMinor-expectedMinor};
 const varianceMinor=countedMinor-expectedMinor; if(varianceMinor<0n)return {classification:"shortage",varianceMinor};
 if(varianceMinor>0n)return {classification:"overage",varianceMinor}; return {varianceMinor:0n};
}
export function assertNoAutomaticFinancialCorrection(classification:ReconciliationClassification|undefined):void{
 if(classification!==undefined)throw new Error("MFI_RECONCILIATION_EXCEPTION_REQUIRES_REVIEW");
}
