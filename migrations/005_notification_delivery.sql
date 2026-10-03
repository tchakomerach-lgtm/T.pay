CREATE TABLE IF NOT EXISTS notification_intents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  recipient_user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','push','sms','email')),
  template text NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  sensitivity text NOT NULL CHECK (sensitivity IN ('generic','sensitive')),
  created_at timestamptz NOT NULL,
  claimed_by text,
  claimed_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  CONSTRAINT notification_claim_consistency_check CHECK (
    (claimed_by IS NULL AND claimed_at IS NULL) OR
    (claimed_by IS NOT NULL AND claimed_at IS NOT NULL)
  ),
  CONSTRAINT notification_event_unique UNIQUE (event_id, recipient_user_id, channel, template)
);

CREATE INDEX IF NOT EXISTS idx_notification_ready
  ON notification_intents (next_attempt_at, created_at)
  WHERE sent_at IS NULL;
