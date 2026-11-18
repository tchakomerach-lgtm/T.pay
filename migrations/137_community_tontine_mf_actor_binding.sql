-- CT-041: bind microfinance institution access to an authenticated staff actor.
ALTER TABLE community_tontine_mf_access
  ADD COLUMN IF NOT EXISTS actor_id uuid;

CREATE INDEX IF NOT EXISTS idx_community_tontine_mf_access_actor_scope
  ON community_tontine_mf_access(organization_id,tontine_group_id,actor_id,expires_at)
  WHERE status='active' AND actor_id IS NOT NULL;

COMMENT ON COLUMN community_tontine_mf_access.actor_id IS
  'Authenticated Identity actor explicitly linked to this microfinance institution access grant; required for commission proposal authority.';
