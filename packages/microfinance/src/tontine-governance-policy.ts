import type { TontineVote } from "./tontine-governance.js";

export interface TontineGovernancePolicy {
  readonly quorumPercent: number;
  readonly approvalPercent: number;
  readonly allowAbstention: boolean;
}

export function validateGovernancePolicy(policy: TontineGovernancePolicy): void {
  if (policy.quorumPercent <= 0 || policy.quorumPercent > 100) throw new Error("TONTINE_QUORUM_INVALID");
  if (policy.approvalPercent <= 50 || policy.approvalPercent > 100) throw new Error("TONTINE_APPROVAL_THRESHOLD_INVALID");
}

export function evaluateGovernance(
  votes: readonly TontineVote[],
  activeMemberCount: number,
  policy: TontineGovernancePolicy
): "quorum_pending" | "approved" | "rejected" {
  validateGovernancePolicy(policy);
  if (activeMemberCount < 2) throw new Error("TONTINE_GOVERNANCE_MEMBERS_INVALID");
  const quorumCount = Math.ceil(activeMemberCount * policy.quorumPercent / 100);
  if (votes.length < quorumCount) return "quorum_pending";
  const approve = votes.filter(v => v.choice === "approve").length;
  const reject = votes.filter(v => v.choice === "reject").length;
  const decided = approve + reject;
  if (decided === 0) return "rejected";
  return approve * 100 >= decided * policy.approvalPercent ? "approved" : "rejected";
}

export function assertGovernanceVersion(currentVersion: number, proposedVersion: number): void {
  if (proposedVersion <= currentVersion) throw new Error("TONTINE_GOVERNANCE_NON_MONOTONIC_VERSION");
}
