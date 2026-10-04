export type SettlementDirection = "collection"|"disbursement"|"refund";
export type SettlementState = "pending"|"submitted"|"provider_confirmed"|"settled"|"quarantined"|"failed"|"reversed";
export type CallbackState = "accepted"|"duplicate"|"rejected"|"quarantined";
export type SettlementReconciliation = "matched"|"amount_mismatch"|"currency_mismatch"|"reference_mismatch"|"state_mismatch";

export interface PartnerSettlement {
  settlementId:string; organizationId:string; partnerMfiId:string; provider:string;
  direction:SettlementDirection; amountMinor:bigint; currency:string;
  clientReference:string; providerReference?:string; idempotencyKey:string; state:SettlementState;
}
export interface ProviderCallback {
  callbackId:string; organizationId:string; provider:string; providerEventId:string;
  settlementId:string; rawBodyHash:string; receivedAt:string; providerOccurredAt?:string;
  freshnessOk:boolean; signatureOk:boolean; payloadValid:boolean;
}
export interface SettlementDecision {
  accepted:boolean; nextState:SettlementState; reason:string;
}

const transitions:Record<SettlementState, readonly SettlementState[]> = {
  pending:["submitted","failed","quarantined"],
  submitted:["provider_confirmed","failed","quarantined"],
  provider_confirmed:["settled","reversed","quarantined"],
  settled:["reversed"],
  quarantined:["pending","failed"],
  failed:["pending"],
  reversed:[]
};

export function assertSettlementTransition(from:SettlementState,to:SettlementState):void {
  if(!transitions[from].includes(to)) throw new Error("MFI_SETTLEMENT_INVALID_STATE_TRANSITION");
}

export function validateProviderConfirmation(
  settlement:PartnerSettlement,
  callback:ProviderCallback & {amountMinor:bigint; currency:string; clientReference:string; providerReference:string}
):SettlementDecision {
  if(settlement.organizationId!==callback.organizationId) return {accepted:false,nextState:"quarantined",reason:"ORGANIZATION_MISMATCH"};
  if(!callback.signatureOk) return {accepted:false,nextState:"quarantined",reason:"SIGNATURE_INVALID"};
  if(!callback.freshnessOk) return {accepted:false,nextState:"quarantined",reason:"CALLBACK_STALE"};
  if(!callback.payloadValid) return {accepted:false,nextState:"quarantined",reason:"PAYLOAD_INVALID"};
  if(callback.amountMinor!==settlement.amountMinor) return {accepted:false,nextState:"quarantined",reason:"AMOUNT_MISMATCH"};
  if(callback.currency!==settlement.currency) return {accepted:false,nextState:"quarantined",reason:"CURRENCY_MISMATCH"};
  if(callback.clientReference!==settlement.clientReference) return {accepted:false,nextState:"quarantined",reason:"REFERENCE_MISMATCH"};
  if(callback.providerReference.trim()==="") return {accepted:false,nextState:"quarantined",reason:"PROVIDER_REFERENCE_MISSING"};
  return {accepted:true,nextState:"provider_confirmed",reason:"PROVIDER_CONFIRMED"};
}

export function classifySettlementReconciliation(
  settlement:PartnerSettlement,
  provider:{amountMinor:bigint;currency:string;clientReference:string;state:SettlementState}
):SettlementReconciliation {
  if(provider.amountMinor!==settlement.amountMinor) return "amount_mismatch";
  if(provider.currency!==settlement.currency) return "currency_mismatch";
  if(provider.clientReference!==settlement.clientReference) return "reference_mismatch";
  if(provider.state!=="provider_confirmed" && provider.state!=="settled") return "state_mismatch";
  return "matched";
}

export function assertNoAutomaticLedgerCorrection(classification:SettlementReconciliation):void {
  if(classification!=="matched") throw new Error("MFI_SETTLEMENT_EXCEPTION_REQUIRES_REVIEW");
}
