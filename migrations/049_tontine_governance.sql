CREATE TABLE IF NOT EXISTS tontine_governance_proposals (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES tontine_groups(id),
  proposer_id uuid NOT NULL,
  type text NOT NULL,
  payload_version integer NOT NULL CHECK (payload_version > 0),
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','approved','rejected','expired')),
  opened_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  UNIQUE (organization_id, group_id, id),
  CHECK (closes_at > opened_at)
);

CREATE TABLE IF NOT EXISTS tontine_governance_votes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  proposal_id uuid NOT NULL REFERENCES tontine_governance_proposals(id),
  voter_id uuid NOT NULL,
  choice text NOT NULL CHECK (choice IN ('approve','reject')),
  cast_at timestamptz NOT NULL,
  UNIQUE (organization_id, proposal_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_tontine_governance_open
  ON tontine_governance_proposals (organization_id, group_id, status, closes_at);
