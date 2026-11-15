import test from "node:test";
import assert from "node:assert/strict";
import {
  assertGovernanceAction,
  assertProposalWindow,
  assertUniqueGovernanceVotes,
  type TontineProposal,
  type TontineVote
} from "../packages/microfinance/src/tontine-governance.js";

const proposalId = "123e4567-e89b-42d3-a456-426614174001" as never;
const voterA = "123e4567-e89b-42d3-a456-426614174002" as never;
const voterB = "123e4567-e89b-42d3-a456-426614174003" as never;

function proposal(overrides: Partial<TontineProposal> = {}): TontineProposal {
  return {
    id: proposalId,
    groupId: "123e4567-e89b-42d3-a456-426614174004" as never,
    proposerId: voterA,
    type: "rule_change",
    payload: { reason: "Test" },
    status: "open",
    openedAt: "2026-11-15T10:00:00.000Z",
    closesAt: "2026-11-16T10:00:00.000Z",
    ...overrides
  };
}

function vote(voterId: TontineVote["voterId"], overrides: Partial<TontineVote> = {}): TontineVote {
  return {
    id: "123e4567-e89b-42d3-a456-426614174005" as never,
    proposalId,
    voterId,
    choice: "approve",
    castAt: "2026-11-15T12:00:00.000Z",
    ...overrides
  };
}

test("governance proposal window accepts an instant at the opening boundary", () => {
  assert.doesNotThrow(() => assertProposalWindow(proposal(), "2026-11-15T10:00:00.000Z"));
});

test("governance proposal window rejects an instant before opening", () => {
  assert.throws(
    () => assertProposalWindow(proposal(), "2026-11-15T09:59:59.999Z"),
    /TONTINE_PROPOSAL_NOT_OPEN/
  );
});

test("governance proposal window treats the closing instant as exclusive", () => {
  assert.throws(
    () => assertProposalWindow(proposal(), "2026-11-16T10:00:00.000Z"),
    /TONTINE_PROPOSAL_CLOSED/
  );
});

test("governance proposal window rejects malformed timestamps", () => {
  assert.throws(
    () => assertProposalWindow(proposal({ openedAt: "not-a-date" }), "2026-11-15T12:00:00.000Z"),
    /TONTINE_PROPOSAL_WINDOW_INVALID/
  );
});

test("governance proposal window rejects a non-positive interval", () => {
  assert.throws(
    () => assertProposalWindow(proposal({ closesAt: "2026-11-15T10:00:00.000Z" }), "2026-11-15T10:00:00.000Z"),
    /TONTINE_PROPOSAL_WINDOW_INVALID/
  );
});

test("governance proposal window rejects a proposal no longer open", () => {
  assert.throws(
    () => assertProposalWindow(proposal({ status: "approved" }), "2026-11-15T12:00:00.000Z"),
    /TONTINE_PROPOSAL_CLOSED/
  );
});

test("governance vote validation accepts distinct voters for the requested proposal", () => {
  assert.doesNotThrow(() => assertUniqueGovernanceVotes([vote(voterA), vote(voterB)], proposalId));
});

test("governance vote validation rejects duplicate votes by one member", () => {
  assert.throws(
    () => assertUniqueGovernanceVotes([vote(voterA), vote(voterA)], proposalId),
    /TONTINE_DUPLICATE_VOTE/
  );
});

test("governance vote validation rejects votes belonging to another proposal", () => {
  assert.throws(
    () => assertUniqueGovernanceVotes([vote(voterA, { proposalId: "123e4567-e89b-42d3-a456-426614174099" as never })], proposalId),
    /TONTINE_VOTE_PROPOSAL_MISMATCH/
  );
});

test("member-vote governance blocks actions until the proposal is approved", () => {
  assert.throws(
    () => assertGovernanceAction("member_vote", proposal()),
    /TONTINE_VOTE_APPROVAL_REQUIRED/
  );
  assert.doesNotThrow(() => assertGovernanceAction("member_vote", proposal({ status: "approved" })));
});

test("manager governance does not require a member-vote proposal", () => {
  assert.doesNotThrow(() => assertGovernanceAction("manager", proposal()));
});
