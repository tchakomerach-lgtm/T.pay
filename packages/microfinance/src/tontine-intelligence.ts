import type { UUID } from "../../domain/src/types.js";

export interface TontineHealthMetric {
  readonly name: "collection_rate" | "on_time_rate" | "dispute_rate" | "beneficiary_readiness" | "community_stress";
  readonly value: number;
  readonly confidence: number;
  readonly observedAt: string;
}

export interface TontinePrediction {
  readonly id: UUID;
  readonly groupId: UUID;
  readonly horizon: "H0" | "H1" | "H2";
  readonly target: "missed_contribution" | "payout_delay" | "stress" | "supplier_failure";
  readonly probability: number;
  readonly confidence: number;
  readonly evidenceRefs: readonly string[];
  readonly createdAt: string;
}

export interface TontineRecommendation {
  readonly id: UUID;
  readonly groupId: UUID;
  readonly action: "contact_member" | "review_exception" | "prepare_alternate_provider" | "open_governance_review" | "seek_alternate_supplier";
  readonly reversible: boolean;
  readonly evidenceRefs: readonly string[];
  readonly requiresHumanApproval: boolean;
}

export function validatePrediction(prediction: TontinePrediction): void {
  if (prediction.probability < 0 || prediction.probability > 1) throw new Error("TONTINE_PREDICTION_PROBABILITY_INVALID");
  if (prediction.confidence < 0 || prediction.confidence > 1) throw new Error("TONTINE_PREDICTION_CONFIDENCE_INVALID");
  if (!prediction.evidenceRefs.length) throw new Error("TONTINE_PREDICTION_EVIDENCE_REQUIRED");
}

export function buildCommunityStressIndex(metrics: readonly TontineHealthMetric[]): number {
  if (!metrics.length) return 0;
  const risk = metrics.map(m => {
    const v = Math.max(0, Math.min(100, m.value));
    if (m.name === "collection_rate" || m.name === "on_time_rate" || m.name === "beneficiary_readiness") return 100 - v;
    return v;
  });
  return Math.round(risk.reduce((a,b) => a+b, 0) / risk.length);
}
