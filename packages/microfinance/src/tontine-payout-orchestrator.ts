import { initiateApprovedPayout, type PayoutProvider, type PayoutSettlementEvidence } from "../../finance/src/payout-orchestrator.js";
import type { PayoutApproval, PayoutIntent } from "../../finance/src/payout.js";
import { approveTontinePayout, type TontinePayoutPlan } from "./tontine-payout.js";

export interface TontinePayoutInitiation {
  readonly intent: PayoutIntent;
  readonly state: PayoutIntent["state"];
  readonly evidence?: PayoutSettlementEvidence;
}

export async function initiateTontinePayout(
  plan: TontinePayoutPlan,
  approval: PayoutApproval | undefined,
  provider: PayoutProvider
): Promise<TontinePayoutInitiation> {
  const intent = plan.gate === "pending_approval"
    ? approveTontinePayout(plan, approval ?? (() => { throw new Error("TONTINE_PAYOUT_HUMAN_APPROVAL_REQUIRED"); })())
    : plan.intent;

  if (plan.gate === "blocked") throw new Error("TONTINE_PAYOUT_BLOCKED");
  if (intent.state !== "approved") throw new Error("TONTINE_PAYOUT_NOT_APPROVED");

  const result = await initiateApprovedPayout(intent, undefined, provider);
  const nextIntent: PayoutIntent = result.state === "initiated"
    ? { ...intent, state: "initiated" }
    : { ...intent, state: result.state };

  return { intent: nextIntent, state: nextIntent.state, ...(result.evidence ? { evidence: result.evidence } : {}) };
}
