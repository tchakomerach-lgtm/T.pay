-- L12.2: durable backup/restore and migration evidence.
CREATE TABLE IF NOT EXISTS deployment_migrations (
  migration_id text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL,
  applied_by text NOT NULL
);
CREATE TABLE IF NOT EXISTS backup_restore_runs (
  id uuid PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN ('backup','restore','restore_drill')),
  status text NOT NULL CHECK (status IN ('started','succeeded','failed')),
  artifact_ref text NOT NULL,
  checksum text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  evidence_hash text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_backup_restore_runs_operation ON backup_restore_runs(operation,started_at DESC);
