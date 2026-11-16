-- Global identity and multi-organization foundation.
-- Deliberately does not backfill legacy actors: tenant/org mappings require verified evidence.
-- Runtime adoption and adversarial PostgreSQL tests remain release gates.

CREATE TABLE IF NOT EXISTS tpay_tenants (
  id text PRIMARY KEY CHECK (length(btrim(id)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tpay_organization_tenants (
  tenant_id text NOT NULL REFERENCES tpay_tenants(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, organization_id),
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS identity_subjects (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_actor_links (
  id uuid PRIMARY KEY,
  subject_id uuid NOT NULL REFERENCES identity_subjects(id) ON DELETE RESTRICT,
  tenant_id text NOT NULL,
  organization_id uuid NOT NULL,
  domain_code text NOT NULL CHECK (domain_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  actor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES tpay_organization_tenants(tenant_id, organization_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, organization_id, domain_code, actor_id),
  UNIQUE (id, tenant_id, organization_id),
  UNIQUE (id, subject_id, tenant_id, organization_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_identity_actor_links_subject
  ON identity_actor_links(subject_id, tenant_id, organization_id, status);

CREATE TABLE IF NOT EXISTS identity_tenant_memberships (
  id uuid PRIMARY KEY,
  subject_id uuid NOT NULL REFERENCES identity_subjects(id) ON DELETE RESTRICT,
  tenant_id text NOT NULL REFERENCES tpay_tenants(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active','suspended','revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, subject_id, tenant_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_tenant_membership_active
  ON identity_tenant_memberships(subject_id, tenant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_identity_tenant_membership_scope
  ON identity_tenant_memberships(tenant_id, subject_id, status, valid_until);

CREATE TABLE IF NOT EXISTS identity_organization_memberships (
  id uuid PRIMARY KEY,
  tenant_membership_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  tenant_id text NOT NULL,
  organization_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','suspended','revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_membership_id, subject_id, tenant_id)
    REFERENCES identity_tenant_memberships(id, subject_id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES tpay_organization_tenants(tenant_id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, tenant_id, organization_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_org_membership_active
  ON identity_organization_memberships(subject_id, tenant_id, organization_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_identity_org_membership_scope
  ON identity_organization_memberships(tenant_id, organization_id, subject_id, status, valid_until);

CREATE TABLE IF NOT EXISTS identity_permission_grants (
  id uuid PRIMARY KEY,
  membership_id uuid NOT NULL,
  tenant_id text NOT NULL,
  organization_id uuid NOT NULL,
  domain_code text NOT NULL CHECK (domain_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  permission text NOT NULL CHECK (permission ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  granted_by_subject_id uuid NOT NULL REFERENCES identity_subjects(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (membership_id, tenant_id, organization_id)
    REFERENCES identity_organization_memberships(id, tenant_id, organization_id) ON DELETE RESTRICT,
  CHECK (valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS idx_identity_permission_grants_active
  ON identity_permission_grants(tenant_id, organization_id, membership_id, domain_code, permission, valid_until)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS identity_sessions (
  id uuid PRIMARY KEY,
  api_session_id uuid NOT NULL UNIQUE REFERENCES api_sessions(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES identity_subjects(id) ON DELETE RESTRICT,
  actor_link_id uuid NOT NULL,
  tenant_id text NOT NULL,
  organization_id uuid NOT NULL,
  assurance text NOT NULL CHECK (assurance IN ('standard','step_up','hardware')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (actor_link_id, subject_id, tenant_id, organization_id)
    REFERENCES identity_actor_links(id, subject_id, tenant_id, organization_id) ON DELETE RESTRICT,
  CHECK (expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS idx_identity_sessions_subject_scope
  ON identity_sessions(tenant_id, organization_id, subject_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION guard_identity_session_actor_binding()
RETURNS trigger LANGUAGE plpgsql AS $
DECLARE
  api_actor uuid;
  api_organization uuid;
  link_actor uuid;
  link_status text;
BEGIN
  SELECT actor_id, organization_id INTO api_actor, api_organization
    FROM api_sessions WHERE id = NEW.api_session_id;
  SELECT actor_id, status INTO link_actor, link_status
    FROM identity_actor_links
    WHERE id = NEW.actor_link_id AND subject_id = NEW.subject_id
      AND tenant_id = NEW.tenant_id AND organization_id = NEW.organization_id;
  IF api_actor IS NULL OR api_organization IS NULL
     OR api_actor <> link_actor OR api_organization <> NEW.organization_id
     OR link_status <> 'active' THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_ACTOR_BINDING_INVALID';
  END IF;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS trg_identity_session_actor_binding ON identity_sessions;
CREATE TRIGGER trg_identity_session_actor_binding
BEFORE INSERT OR UPDATE ON identity_sessions
FOR EACH ROW EXECUTE FUNCTION guard_identity_session_actor_binding();

CREATE TABLE IF NOT EXISTS identity_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id uuid NOT NULL,
  subject_id uuid,
  actor_id uuid,
  action text NOT NULL CHECK (action IN (
    'subject_created','actor_linked','membership_granted','membership_suspended',
    'membership_revoked','permission_granted','permission_revoked',
    'session_issued','session_revoked','context_denied'
  )),
  reason_code text NOT NULL CHECK (length(btrim(reason_code)) > 0),
  correlation_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES tpay_organization_tenants(tenant_id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_identity_audit_scope
  ON identity_audit(tenant_id, organization_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_identity_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IDENTITY_AUDIT_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS trg_identity_audit_immutable ON identity_audit;
CREATE TRIGGER trg_identity_audit_immutable
BEFORE UPDATE OR DELETE ON identity_audit
FOR EACH ROW EXECUTE FUNCTION prevent_identity_audit_mutation();

-- Context readers are transaction-local. Missing context returns NULL and therefore denies access.
CREATE OR REPLACE FUNCTION public.tpay_current_tenant_id()
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE
AS $function$ SELECT NULLIF(current_setting('tpay.tenant_id', true), '') $function$;

ALTER TABLE tpay_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tpay_tenants_current_scope ON tpay_tenants
  USING (id = public.tpay_current_tenant_id())
  WITH CHECK (id = public.tpay_current_tenant_id());

ALTER TABLE tpay_organization_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tpay_organization_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tpay_organization_tenants_current_scope ON tpay_organization_tenants
  USING (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id())
  WITH CHECK (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id());

ALTER TABLE identity_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_subjects_linked_scope ON identity_subjects
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM identity_actor_links l
    WHERE l.subject_id = identity_subjects.id
      AND l.tenant_id = public.tpay_current_tenant_id()
      AND l.organization_id = public.tpay_current_organization_id()
      AND l.status = 'active'
  ));

ALTER TABLE identity_actor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_actor_links FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_actor_links_current_scope ON identity_actor_links
  USING (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id())
  WITH CHECK (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id());

ALTER TABLE identity_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_tenant_memberships_visible_through_org_scope ON identity_tenant_memberships
  FOR SELECT USING (
    tenant_id = public.tpay_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM identity_organization_memberships m
      WHERE m.tenant_membership_id = identity_tenant_memberships.id
        AND m.tenant_id = public.tpay_current_tenant_id()
        AND m.organization_id = public.tpay_current_organization_id()
    )
  );

ALTER TABLE identity_organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_organization_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_organization_memberships_current_scope ON identity_organization_memberships
  USING (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id())
  WITH CHECK (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id());

ALTER TABLE identity_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_permission_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_permission_grants_current_scope ON identity_permission_grants
  USING (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id())
  WITH CHECK (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id());

ALTER TABLE identity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_sessions_current_scope ON identity_sessions
  USING (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id())
  WITH CHECK (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id());

ALTER TABLE identity_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_audit_current_scope ON identity_audit
  USING (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id())
  WITH CHECK (tenant_id = public.tpay_current_tenant_id()
     AND organization_id = public.tpay_current_organization_id());

COMMENT ON TABLE tpay_organization_tenants IS
  'Explicit verified tenant-to-organization mapping. No legacy mapping is inferred or auto-backfilled.';
COMMENT ON TABLE identity_subjects IS
  'Global T.Pay principals; domain actors are linked explicitly through identity_actor_links.';
COMMENT ON TABLE identity_permission_grants IS
  'Temporal domain-scoped permissions. A grant never crosses tenant or organization boundaries.';
COMMENT ON TABLE identity_sessions IS
  'Identity-level session binding to the existing device/session record; runtime adoption is a separate release gate.';
COMMENT ON TABLE identity_audit IS
  'Append-only audit for identity, membership, permission and session lifecycle events.';
