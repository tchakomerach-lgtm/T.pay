import type { UUID } from "../../domain/src/types.js";
import { initiateApprovedPayout, type PayoutProvider } from "../../finance/src/payout-orchestrator.js";
import type { PayoutApproval, PayoutIntent } from "../../finance/src/payout.js";
import type { TontinePayoutPlan } from "./tontine-payout.js";
import type { PersistedTontinePayout, PostgresTontinePayoutRepository } from "./tontine-payout-repository.js";

export interface DurableTontinePayoutResult {
  readonly payout: PersistedTontinePayout;
  readonly replayed: boolean;
  readonly providerInitiated: boolean;
}

export async function createAndInitiateDurableTontinePayout(
  plan: TontinePayoutPlan,
  approval: PayoutApproval | undefined,
  provider: PayoutProvider,
  repository: Pick<PostgresTontinePayoutRepository,"createIfAbsent"|"approve"|"markInitiated"|"markFailed">
): Promise<DurableTontinePayoutResult> {
  if (plan.gate === "blocked") throw new Error("TONTINE_PAYOUT_BLOCKED");
  const created = await repository.createIfAbsent(plan);
  let persisted = created.payout;

  if (persisted.intent.state === "pending_kyc") {
    return { payout: persisted, replayed: created.replayed, providerInitiated: false };
  }
  if (persisted.intent.state === "pending_approval") {
    if (!approval) throw new Error("TONTINE_PAYOUT_HUMAN_APPROVAL_REQUIRED");
    persisted = await repository.approve(persisted.intent.organizationId as UUID,persisted.intent.payoutId as UUID,approval);
  }
  if (persisted.intent.state === "initiated" || persisted.intent.state === "confirmed") {
    return { payout: persisted, replayed: true, providerInitiated: false };
  }
  if (persisted.intent.state === "failed" || persisted.intent.state === "cancelled" || persisted.intent.state === "reversed") {
    return { payout: persisted, replayed: true, providerInitiated: false };
  }
  if (persisted.intent.state !== "approved") throw new Error("TONTINE_PAYOUT_NOT_APPROVED");

  const result = await initiateApprovedPayout(persisted.intent,approval,provider);
  if (result.state === "failed") {
    await repository.markFailed(persisted.intent.organizationId as UUID,persisted.intent.payoutId as UUID);
    return {
      payout: { ...persisted, intent: { ...persisted.intent, state: "failed" } },
      replayed: created.replayed,
      providerInitiated: false
    };
  }
  if (!result.evidence) throw new Error("TONTINE_PAYOUT_PROVIDER_EVIDENCE_MISSING");
  await repository.markInitiated(
    persisted.intent.organizationId as UUID,
    persisted.intent.payoutId as UUID,
    result.evidence.provider,
    result.evidence.providerReference
  );
  const initiated: PayoutIntent = { ...persisted.intent, state: "initiated" };
  return {
    payout: { ...persisted, intent: initiated, provider: result.evidence.provider, providerReference: result.evidence.providerReference },
    replayed: created.replayed,
    providerInitiated: true
  };
}
