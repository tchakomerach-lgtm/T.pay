import type { UUID } from "../../domain/src/types.js";
import type { TontineGovernanceMode } from "./community-tontine.js";

export type TontineProposalType = "rule_change" | "beneficiary_order" | "pause" | "resume" | "member_admission" | "member_removal" | "partner_change";
export type TontineProposalStatus = "open" | "approved" | "rejected" | "expired";
export type TontineVoteChoice = "approve" | "reject" | "abstain";

export interface TontineProposal {
  id: UUID;
  groupId: UUID;
  proposerId: UUID;
  type: TontineProposalType;
  payloadVersion: number;
  payloadHash: string;
  status: TontineProposalStatus;
  openedAt: string;
  closesAt: string;
  quorumPercentSnapshot?: number;
  approvalPercentSnapshot?: number;
  eligibleMemberCountSnapshot?: number;
  policyVersionSnapshot?: number;
}

export interface TontineVote {
  id: UUID;
  proposalId: UUID;
  voterId: UUID;
  choice: TontineVoteChoice;
  castAt: string;
}

export function assertGovernanceAction(mode: TontineGovernanceMode, proposal: TontineProposal): void {
  if (mode === "member_vote" && proposal.status !== "approved") throw new Error("TONTINE_VOTE_APPROVAL_REQUIRED");
}

export function assertProposalWindow(proposal: TontineProposal, now: string): void {
  const opened = Date.parse(proposal.openedAt);
  const closes = Date.parse(proposal.closesAt);
  const instant = Date.parse(now);
  if (![opened, closes, instant].every(Number.isFinite) || closes <= opened) throw new Error("TONTINE_PROPOSAL_WINDOW_INVALID");
  if (instant < opened) throw new Error("TONTINE_PROPOSAL_NOT_OPEN");
  if (instant >= closes || proposal.status !== "open") throw new Error("TONTINE_PROPOSAL_CLOSED");
}

export function assertUniqueGovernanceVotes(votes: readonly TontineVote[], proposalId: UUID): void {
  const voters = new Set<string>();
  for (const vote of votes) {
    if (vote.proposalId !== proposalId) throw new Error("TONTINE_VOTE_PROPOSAL_MISMATCH");
    if (voters.has(vote.voterId)) throw new Error("TONTINE_DUPLICATE_VOTE");
    voters.add(vote.voterId);
  }
}
