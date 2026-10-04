import type { PayoutApproval, PayoutIntent } from "./payout.js";
import { money } from "./ledger.js";
import { postFinancialTransaction, type PostFinancialTransactionResult } from "./transactional-ledger.js";
import type { FinancialUnitOfWork } from "./persistence.js";
import { authorizePayout, assertPayoutTransition } from "./payout.js";

export interface PayoutProviderRequest {
  payoutId:string; idempotencyKey:string; amountMinor:bigint; currency:string; destinationRef:string;
}
export interface PayoutInitiationResult {
  provider:string; providerReference:string; status:"accepted"|"pending"|"rejected";
}
export interface PayoutProvider {
  initiate(request:PayoutProviderRequest):Promise<PayoutInitiationResult>;
  query(providerReference:string):Promise<PayoutInitiationResult>;
}
export interface PayoutSettlementEvidence {
  payoutId:string; organizationId:string; provider:string; providerReference:string; amountMinor:bigint; currency:string;
}
export async function initiateApprovedPayout(intent:PayoutIntent,approval:PayoutApproval|undefined,provider:PayoutProvider):Promise<{state:PayoutIntent["state"];evidence?:PayoutSettlementEvidence}>{
  authorizePayout(intent,approval);
  const approvedIntent = intent.state==="pending_approval" ? {...intent,state:"approved" as const} : intent;
  assertPayoutTransition(approvedIntent.state,"initiated");
  const result=await provider.initiate({payoutId:intent.payoutId,idempotencyKey:intent.idempotencyKey,amountMinor:intent.amountMinor,currency:intent.currency,destinationRef:intent.destinationRef});
  if(result.status==="rejected") return {state:"failed"};
  return {state:"initiated",evidence:{payoutId:intent.payoutId,organizationId:intent.organizationId,provider:result.provider,providerReference:result.providerReference,amountMinor:intent.amountMinor,currency:intent.currency}};
}
export function buildPayoutSettlementIdempotency(intent:PayoutIntent,providerReference:string):string{
 return `payout-settlement:${intent.organizationId}:${intent.payoutId}:${providerReference}`;
}

export async function settleConfirmedPayout(
  uow:FinancialUnitOfWork,
  intent:PayoutIntent,
  evidence:PayoutSettlementEvidence,
  sourceAccountId:string,
  beneficiaryAccountId:string,
  transactionId:string,
  now=new Date().toISOString()
):Promise<PostFinancialTransactionResult>{
  if(intent.state!=="initiated") throw new Error("PAYOUT_NOT_INITIATED");
  if(evidence.payoutId!==intent.payoutId||evidence.organizationId!==intent.organizationId) throw new Error("PAYOUT_EVIDENCE_IDENTITY_MISMATCH");
  if(evidence.amountMinor!==intent.amountMinor||evidence.currency!==intent.currency) throw new Error("PAYOUT_EVIDENCE_AMOUNT_MISMATCH");
  if(!evidence.providerReference) throw new Error("PAYOUT_PROVIDER_REFERENCE_REQUIRED");
  return postFinancialTransaction(uow,{
    id:transactionId,organizationId:intent.organizationId,
    idempotencyKey:buildPayoutSettlementIdempotency(intent,evidence.providerReference),
    occurredAt:now,postedAt:now,
    lines:[
      {accountId:sourceAccountId,amount:money(intent.currency,intent.amountMinor),direction:"debit"},
      {accountId:beneficiaryAccountId,amount:money(intent.currency,intent.amountMinor),direction:"credit"}
    ]
  });
}
