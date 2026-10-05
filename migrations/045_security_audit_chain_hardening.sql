CREATE INDEX IF NOT EXISTS security_audit_events_org_sequence_idx
  ON security_audit_events (organization_id, sequence_id DESC);
