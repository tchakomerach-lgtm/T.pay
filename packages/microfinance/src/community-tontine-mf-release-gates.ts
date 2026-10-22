export type CommunityTontineMfGateId =
  | "01_portfolio" | "02_access" | "03_isolation" | "04_member_view"
  | "05_kyc" | "06_destination" | "07_collection" | "08_offline"
  | "09_idempotency" | "10_prepare" | "11_approval" | "12_limits"
  | "13_provider" | "14_callback" | "15_settlement" | "16_reconciliation"
  | "17_incidents" | "18_refund" | "19_audit" | "20_notifications"
  | "21_concurrency" | "22_resilience" | "23_observability" | "24_release";

export interface CommunityTontineMfGateEvidence {
  gateId: CommunityTontineMfGateId;
  code: boolean;
  tests: boolean;
  database?: boolean;
  security?: boolean;
  evidenceRefs: readonly string[];
  note?: string;
}

export const COMMUNITY_TONTINE_MF_GATES: readonly CommunityTontineMfGateId[] = [
  "01_portfolio","02_access","03_isolation","04_member_view","05_kyc","06_destination",
  "07_collection","08_offline","09_idempotency","10_prepare","11_approval","12_limits",
  "13_provider","14_callback","15_settlement","16_reconciliation","17_incidents","18_refund",
  "19_audit","20_notifications","21_concurrency","22_resilience","23_observability","24_release"
];

export function evaluateCommunityTontineMfRelease(
  evidence: readonly CommunityTontineMfGateEvidence[]
): { ready: boolean; passed: number; missing: CommunityTontineMfGateId[]; reasons: string[] } {
  const byId = new Map(evidence.map(item => [item.gateId, item]));
  const missing: CommunityTontineMfGateId[] = [];
  const reasons: string[] = [];
  for (const gateId of COMMUNITY_TONTINE_MF_GATES) {
    const item = byId.get(gateId);
    if (!item || !item.code || !item.tests || item.evidenceRefs.length === 0) {
      missing.push(gateId);
      if (!item) reasons.push(gateId + ": evidence missing");
      else reasons.push(gateId + ": code/tests/evidence incomplete");
    }
  }
  return {
    ready: missing.length === 0,
    passed: COMMUNITY_TONTINE_MF_GATES.length - missing.length,
    missing,
    reasons
  };
}

export function assertCommunityTontineMfRelease(
  evidence: readonly CommunityTontineMfGateEvidence[]
): void {
  const result = evaluateCommunityTontineMfRelease(evidence);
  if (!result.ready) {
    throw new Error("COMMUNITY_TONTINE_MF_RELEASE_BLOCKED:" + result.missing.join(","));
  }
}
