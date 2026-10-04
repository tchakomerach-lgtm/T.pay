-- L11.1: runtime controls. These are operational guardrails, never financial truth.
CREATE TABLE IF NOT EXISTS ai_execution_keys (
  organization_id uuid,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  result_hash text,
  status text NOT NULL CHECK (status IN ('reserved','completed','failed')),
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_execution_keys_created ON ai_execution_keys(created_at);

CREATE TABLE IF NOT EXISTS ai_usage_buckets (
  organization_id uuid NOT NULL,
  bucket_start timestamptz NOT NULL,
  requests_count bigint NOT NULL DEFAULT 0 CHECK (requests_count >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_minor bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_minor >= 0),
  PRIMARY KEY (organization_id,bucket_start)
);

CREATE TABLE IF NOT EXISTS ai_tool_executions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  execution_key text NOT NULL,
  tool_name text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  status text NOT NULL CHECK (status IN ('reserved','running','succeeded','failed','quarantined')),
  input_hash text NOT NULL,
  output_hash text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  UNIQUE (organization_id,execution_key)
);
