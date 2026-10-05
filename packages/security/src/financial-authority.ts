export type FinancialOperation="transfer"|"withdrawal"|"deposit"|"loan_disbursement"|"subsidy_disbursement"|"commission_payout";

export interface FinancialActionRequest{
 readonly operation:FinancialOperation;
 readonly organizationId:string;
 readonly actorId:string;
 readonly agentId?:string;
 readonly transactionId:string;
 readonly idempotencyKey:string;
 readonly amountMinor:number;
 readonly currency:string;
 readonly beneficiaryId:string;
 readonly purpose:string;
 readonly ledgerIntentHash:string;
 readonly approvalCount:number;
 readonly requiredApprovals:number;
 readonly independentRiskDecision:"allow"|"review"|"deny";
}

export function assertFinancialActionAuthorized(request:FinancialActionRequest):void{
 if(!request.organizationId.trim()||!request.actorId.trim()||!request.transactionId.trim()||!request.idempotencyKey.trim()||!request.beneficiaryId.trim())throw new Error("FINANCIAL_ACTION_CONTEXT_REQUIRED");
 if(!Number.isSafeInteger(request.amountMinor)||request.amountMinor<=0)throw new Error("FINANCIAL_AMOUNT_INVALID");
 if(!request.currency.trim()||!request.purpose.trim()||!request.ledgerIntentHash.trim())throw new Error("FINANCIAL_ACTION_CONTEXT_REQUIRED");
 if(!Number.isSafeInteger(request.approvalCount)||!Number.isSafeInteger(request.requiredApprovals)||request.requiredApprovals<1||request.approvalCount<request.requiredApprovals)throw new Error("FINANCIAL_APPROVAL_QUORUM_REQUIRED");
 if(request.independentRiskDecision!=="allow")throw new Error("FINANCIAL_RISK_GATE_DENIED");
}

/**
 * AI proposals may produce this object, but this gate must be called by the
 * financial authority layer immediately before the ledger/payment mutation.
 */
export function assertAiCannotSettleFinancialAction(agentId?:string):void{
 if(agentId)throw new Error("AI_FINANCIAL_SETTLEMENT_FORBIDDEN");
}
