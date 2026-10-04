-- L11.5: provider/model execution telemetry without storing prompts.
CREATE TABLE IF NOT EXISTS ai_provider_observations (
  id uuid PRIMARY KEY,
  organization_id uuid,
  request_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','local')),
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded','failed','blocked')),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  attempts integer NOT NULL CHECK (attempts >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_minor bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_minor >= 0),
  error_class text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_observations_org_created ON ai_provider_observations(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_observations_provider_created ON ai_provider_observations(provider,created_at DESC);
