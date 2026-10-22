import type { UUID } from "../../domain/src/types.js";

export type TontineCaseType =
  | "incident"
  | "dispute"
  | "risk_investigation"
  | "recovery"
  | "refund";

export type TontineCaseState =
  | "opened"
  | "triaged"
  | "evidence_collection"
  | "pending_party"
  | "microfinance_review"
  | "mediation"
  | "admin_review"
  | "resolution"
  | "recovery"
  | "confirmed"
  | "closed"
  | "hold"
  | "appealed"
  | "escalated"
  | "rejected"
  | "cancelled";

const transitions: Record<TontineCaseState, readonly TontineCaseState[]> = {
  opened: ["triaged", "hold", "cancelled"],
  triaged: ["evidence_collection", "pending_party", "escalated", "hold"],
  evidence_collection: ["pending_party", "microfinance_review", "admin_review", "hold"],
  pending_party: ["evidence_collection", "microfinance_review", "escalated", "hold"],
  microfinance_review: ["mediation", "admin_review", "resolution", "escalated", "hold"],
  mediation: ["resolution", "admin_review", "appealed", "escalated"],
  admin_review: ["resolution", "recovery", "rejected", "escalated", "hold"],
  resolution: ["recovery", "confirmed", "appealed", "escalated"],
  recovery: ["confirmed", "escalated", "hold"],
  confirmed: ["closed", "appealed"],
  closed: [],
  hold: ["triaged", "evidence_collection", "admin_review", "resolution", "cancelled"],
  appealed: ["admin_review", "escalated", "resolution"],
  escalated: ["admin_review", "resolution", "hold"],
  rejected: ["appealed", "closed"],
  cancelled: ["closed"]
};

export function assertTontineCaseTransition(from: TontineCaseState, to: TontineCaseState): void {
  if (!transitions[from].includes(to)) throw new Error("TONTINE_CASE_INVALID_TRANSITION");
}

export interface TontineCase {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly groupId: UUID;
  readonly type: TontineCaseType;
  readonly state: TontineCaseState;
  readonly openedBy: UUID;
  readonly payoutId?: UUID;
  readonly contributionId?: UUID;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly summary: string;
  readonly createdAt: string;
}

export interface TontineCaseEvidence {
  readonly id: UUID;
  readonly caseId: UUID;
  readonly type: "receipt" | "provider_callback" | "statement" | "photo" | "document" | "participant_declaration" | "system_event";
  readonly contentHash: string;
  readonly objectReference?: string;
  readonly capturedBy: UUID;
  readonly capturedAt: string;
}

export interface TontineTargetedHold {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly caseId: UUID;
  readonly scope: "payout" | "contribution" | "membership" | "provider_reference";
  readonly reference: string;
  readonly reason: string;
  readonly expiresAt?: string;
  readonly releasedAt?: string;
}

export interface TontineRefundRequest {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly caseId: UUID;
  readonly originalContributionId?: UUID;
  readonly originalPayoutId?: UUID;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly reason: string;
  readonly state: "requested" | "reviewing" | "approved" | "rejected" | "submitted_to_financial_core" | "settled" | "failed";
  readonly requiresHumanApproval: boolean;
}

export function assertRefundAmount(amountMinor: bigint): void {
  if (amountMinor <= 0n) throw new Error("TONTINE_REFUND_AMOUNT_INVALID");
}
