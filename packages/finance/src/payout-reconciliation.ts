import type { PayoutIntent } from "./payout.js";
import type { PayoutSettlementEvidence } from "./payout-orchestrator.js";
export type PayoutReconciliation="matched"|"provider_only"|"internal_only"|"amount_mismatch"|"currency_mismatch"|"identity_mismatch"|"status_mismatch";
export function reconcilePayout(intent:PayoutIntent|undefined,evidence:PayoutSettlementEvidence|undefined):PayoutReconciliation{
 if(!intent&&evidence)return "provider_only"; if(intent&&!evidence)return "internal_only"; if(!intent||!evidence)return "identity_mismatch";
 if(intent.payoutId!==evidence.payoutId||intent.organizationId!==evidence.organizationId)return "identity_mismatch";
 if(intent.amountMinor!==evidence.amountMinor)return "amount_mismatch"; if(intent.currency!==evidence.currency)return "currency_mismatch";
 if(intent.state!=="initiated"&&intent.state!=="confirmed")return "status_mismatch"; return "matched";
}
export function assertPayoutReversalAllowed(intent:PayoutIntent,evidence:PayoutSettlementEvidence):void{
 if(intent.state!=="confirmed")throw new Error("PAYOUT_NOT_CONFIRMED");
 if(evidence.payoutId!==intent.payoutId||evidence.organizationId!==intent.organizationId)throw new Error("PAYOUT_EVIDENCE_IDENTITY_MISMATCH");
}
