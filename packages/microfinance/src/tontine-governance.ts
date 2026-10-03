import type { UUID } from "../../domain/src/types.js";
import type { TontineGovernanceMode } from "./community-tontine.js";

export type TontineProposalType = "rule_change" | "beneficiary_order" | "pause" | "resume" | "member_admission" | "member_removal" | "partner_change";
export type TontineProposalStatus = "open" | "approved" | "rejected" | "expired";

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
}

export interface TontineVote {
  id: UUID;
  proposalId: UUID;
  voterId: UUID;
  choice: "approve" | "reject";
  castAt: string;
}

export function assertGovernanceAction(mode: TontineGovernanceMode, proposal: TontineProposal): void {
  if (mode === "member_vote" && proposal.status !== "approved") throw new Error("TONTINE_VOTE_APPROVAL_REQUIRED");
}
