-- Persisted, versioned governance policy and immutable proposal-time snapshots.
-- No quorum or approval threshold is silently selected: a group must configure them explicitly.

CREATE TABLE IF NOT EXISTS tontine_governance_group_policies (
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  quorum_percent smallint NOT NULL CHECK (quorum_percent BETWEEN 1 AND 100),
  approval_percent smallint NOT NULL CHECK (approval_percent BETWEEN 51 AND 100),
  allow_abstention boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, group_id),
  CONSTRAINT tontine_governance_policy_group_fk
    FOREIGN KEY (organization_id, group_id)
    REFERENCES tontine_groups (organization_id, id)
);

ALTER TABLE tontine_governance_proposals
  ADD COLUMN IF NOT EXISTS quorum_percent_snapshot smallint,
  ADD COLUMN IF NOT EXISTS approval_percent_snapshot smallint,
  ADD COLUMN IF NOT EXISTS allow_abstention_snapshot boolean,
  ADD COLUMN IF NOT EXISTS eligible_member_count_snapshot integer,
  ADD COLUMN IF NOT EXISTS policy_version_snapshot integer,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tontine_governance_proposals_policy_snapshot_check'
      AND conrelid = 'tontine_governance_proposals'::regclass
  ) THEN
    ALTER TABLE tontine_governance_proposals
      ADD CONSTRAINT tontine_governance_proposals_policy_snapshot_check CHECK (
        (quorum_percent_snapshot IS NULL OR quorum_percent_snapshot BETWEEN 1 AND 100)
        AND (approval_percent_snapshot IS NULL OR approval_percent_snapshot BETWEEN 51 AND 100)
        AND (eligible_member_count_snapshot IS NULL OR eligible_member_count_snapshot >= 2)
        AND (policy_version_snapshot IS NULL OR policy_version_snapshot > 0)
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tontine_governance_proposals_org_id
  ON tontine_governance_proposals (organization_id, id);

CREATE INDEX IF NOT EXISTS idx_tontine_governance_votes_proposal
  ON tontine_governance_votes (organization_id, proposal_id, cast_at, voter_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tontine_governance_proposals_org_group_fk'
      AND conrelid = 'tontine_governance_proposals'::regclass
  ) THEN
    ALTER TABLE tontine_governance_proposals
      ADD CONSTRAINT tontine_governance_proposals_org_group_fk
      FOREIGN KEY (organization_id, group_id)
      REFERENCES tontine_groups (organization_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tontine_governance_votes_org_proposal_fk'
      AND conrelid = 'tontine_governance_votes'::regclass
  ) THEN
    ALTER TABLE tontine_governance_votes
      ADD CONSTRAINT tontine_governance_votes_org_proposal_fk
      FOREIGN KEY (organization_id, proposal_id)
      REFERENCES tontine_governance_proposals (organization_id, id);
  END IF;
END;
$$;

ALTER TABLE tontine_governance_votes
  DROP CONSTRAINT IF EXISTS tontine_governance_votes_choice_check;
ALTER TABLE tontine_governance_votes
  ADD CONSTRAINT tontine_governance_votes_choice_check
  CHECK (choice IN ('approve', 'reject', 'abstain'));

COMMENT ON TABLE tontine_governance_group_policies IS
  'Explicitly configured quorum and approval policy for an independent Community Tontine group.';
COMMENT ON COLUMN tontine_governance_proposals.quorum_percent_snapshot IS
  'Immutable quorum percentage copied from the group policy when the proposal is opened.';
COMMENT ON COLUMN tontine_governance_proposals.eligible_member_count_snapshot IS
  'Active voting membership count captured when the proposal is opened; later membership changes do not rewrite its quorum.';
