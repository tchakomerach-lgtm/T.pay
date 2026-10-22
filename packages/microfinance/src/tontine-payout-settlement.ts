import { settleConfirmedPayout, type PayoutSettlementEvidence } from "../../finance/src/payout-orchestrator.js";
import type { FinancialUnitOfWork } from "../../finance/src/persistence.js";
import type { PayoutIntent } from "../../finance/src/payout.js";

export interface TontinePayoutSettlementAccounts {
  readonly tontineClearingAccountId: string;
  readonly microfinanceSettlementAccountId: string;
}

export async function settleConfirmedTontinePayout(
  uow: FinancialUnitOfWork,
  intent: PayoutIntent,
  evidence: PayoutSettlementEvidence,
  accounts: TontinePayoutSettlementAccounts,
  transactionId: string,
  now: string
) {
  if (!intent.idempotencyKey.startsWith("tontine-payout:")) throw new Error("NOT_TONTINE_PAYOUT");
  return settleConfirmedPayout(
    uow,
    intent,
    evidence,
    accounts.tontineClearingAccountId,
    accounts.microfinanceSettlementAccountId,
    transactionId,
    now
  );
}
