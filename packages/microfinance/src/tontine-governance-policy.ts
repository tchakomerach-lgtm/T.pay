import type { TontineVote } from "./tontine-governance.js";
import { assertUniqueGovernanceVotes } from "./tontine-governance.js";

export interface TontineGovernancePolicy {
  readonly quorumPercent: number;
  readonly approvalPercent: number;
  readonly allowAbstention: boolean;
}

export function validateGovernancePolicy(policy: TontineGovernancePolicy): void {
  if (!Number.isInteger(policy.quorumPercent) || policy.quorumPercent <= 0 || policy.quorumPercent > 100) {
    throw new Error("TONTINE_QUORUM_INVALID");
  }
  if (!Number.isInteger(policy.approvalPercent) || policy.approvalPercent <= 50 || policy.approvalPercent > 100) {
    throw new Error("TONTINE_APPROVAL_THRESHOLD_INVALID");
  }
  if (typeof policy.allowAbstention !== "boolean") throw new Error("TONTINE_ABSTENTION_POLICY_INVALID");
}

export function evaluateGovernance(
  votes: readonly TontineVote[],
  activeMemberCount: number,
  policy: TontineGovernancePolicy
): "quorum_pending" | "approved" | "rejected" {
  validateGovernancePolicy(policy);
  if (!Number.isSafeInteger(activeMemberCount) || activeMemberCount < 2) {
    throw new Error("TONTINE_GOVERNANCE_MEMBERS_INVALID");
  }
  if (votes.length > activeMemberCount) throw new Error("TONTINE_VOTE_COUNT_EXCEEDS_MEMBERS");
  if (votes.length > 0) assertUniqueGovernanceVotes(votes, votes[0]!.proposalId);
  if (!policy.allowAbstention && votes.some(vote => vote.choice === "abstain")) {
    throw new Error("TONTINE_ABSTENTION_NOT_ALLOWED");
  }
  const quorumCount = Math.ceil(activeMemberCount * policy.quorumPercent / 100);
  if (votes.length < quorumCount) return "quorum_pending";
  const approve = votes.filter(v => v.choice === "approve").length;
  const reject = votes.filter(v => v.choice === "reject").length;
  const decided = approve + reject;
  if (decided === 0) return "rejected";
  return approve * 100 >= decided * policy.approvalPercent ? "approved" : "rejected";
}

export function assertGovernanceVersion(currentVersion: number, proposedVersion: number): void {
  if (!Number.isSafeInteger(currentVersion) || !Number.isSafeInteger(proposedVersion) || currentVersion < 1) {
    throw new Error("TONTINE_GOVERNANCE_VERSION_INVALID");
  }
  if (proposedVersion <= currentVersion) throw new Error("TONTINE_GOVERNANCE_NON_MONOTONIC_VERSION");
}
