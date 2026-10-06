-- Repair legacy identity schemas created before organization fields were added.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'other';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS founder_id uuid;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_code_hash text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS failed_access_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_locked_until timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
UPDATE organizations SET status='active' WHERE status IS NULL;
ALTER TABLE organizations ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships(user_id, status);
