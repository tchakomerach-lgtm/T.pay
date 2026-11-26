import type { Permission } from "../../security/src/policy.js";

export interface IdentityRuntimeQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
}
export interface IdentityRuntimeClient {
  query(sql: string, values?: unknown[]): Promise<IdentityRuntimeQueryResult>;
  release?(): void;
}
export interface IdentityRuntimePool {
  connect(): Promise<IdentityRuntimeClient>;
}
export interface VerifiedApiSession {
  sessionId: string;
  actorId: string;
  organizationId: string;
  issuedAt: string;
  expiresAt: string;
}
export interface ResolvedIdentityRuntimeContext {
  subjectId: string;
  sessionId: string;
  tenantId: string;
  organizationId: string;
  membershipId: string;
  permissions: readonly Permission[];
  assurance: "standard" | "step_up";
  issuedAt: number;
  expiresAt: number;
}

const COMMUNITY_PERMISSIONS = new Set<Permission>([
  "community.tontine.read",
  "community.groups.manage",
  "community.members.manage",
  "community.admission.decide",
  "community.contribution.initiate",
  "community.governance.propose",
  "community.governance.vote",
  "community.payout.approve",
  "community.dispute.manage",
  "community.commission.propose.tpay",
  "community.commission.propose.microfinance",
  "community.commission.propose.admin"
]);

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("IDENTITY_CONTEXT_INCOMPLETE:" + key);
  }
  return value;
}

/**
 * Resolves only an explicitly provisioned Community Tontine identity.
 * The bootstrap GUC is set only from a session already validated by DeviceTrustRepository.
 * All subsequent reads run under transaction-local tenant + organization RLS context.
 */
export async function resolveOrganizationDomainIdentity(
  pool: IdentityRuntimePool,
  apiSession: VerifiedApiSession,
  domainCode: string,
  allowedPermissions: ReadonlySet<Permission>,
  now = new Date()
): Promise<ResolvedIdentityRuntimeContext> {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(domainCode)) {
    throw new Error("IDENTITY_DOMAIN_CODE_INVALID");
  }
  if (allowedPermissions.size === 0) {
    throw new Error("IDENTITY_DOMAIN_PERMISSION_ALLOWLIST_REQUIRED");
  }
  const client = await pool.connect();
  const nowIso = now.toISOString();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      "SELECT set_config('tpay.api_session_id', $1, true)",
      [apiSession.sessionId]
    );

    const bootstrap = await client.query(
      `SELECT id, subject_id, tenant_id, organization_id, actor_link_id,
              assurance, issued_at, expires_at, revoked_at
         FROM identity_sessions
        WHERE api_session_id = $1
          AND organization_id = $2
          AND revoked_at IS NULL
          AND issued_at <= $3::timestamptz
          AND expires_at > $3::timestamptz
          AND issued_at >= $4::timestamptz
          AND expires_at <= $5::timestamptz
        LIMIT 1`,
      [apiSession.sessionId, apiSession.organizationId, nowIso, apiSession.issuedAt, apiSession.expiresAt]
    );
    const session = bootstrap.rows[0];
    if (!session) throw new Error("IDENTITY_SESSION_NOT_PROVISIONED");

    const tenantId = requiredString(session, "tenant_id");
    const organizationId = requiredString(session, "organization_id");
    if (organizationId !== apiSession.organizationId) {
      throw new Error("IDENTITY_SESSION_ORGANIZATION_MISMATCH");
    }
    await client.query("SELECT set_config('tpay.tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('tpay.organization_id', $1, true)", [organizationId]);

    const resolved = await client.query(
      `SELECT s.id AS identity_session_id, s.subject_id, s.tenant_id,
              s.organization_id, s.assurance, s.issued_at, s.expires_at,
              sub.status AS subject_status,
              l.actor_id, l.domain_code, l.status AS actor_link_status,
              tm.status AS tenant_membership_status,
              tm.valid_from AS tenant_membership_valid_from,
              tm.valid_until AS tenant_membership_valid_until,
              tm.revoked_at AS tenant_membership_revoked_at,
              om.id AS membership_id,
              om.status AS organization_membership_status,
              om.valid_from AS organization_membership_valid_from,
              om.valid_until AS organization_membership_valid_until,
              om.revoked_at AS organization_membership_revoked_at,
              t.status AS tenant_status,
              ot.status AS organization_tenant_status
         FROM identity_sessions s
         JOIN identity_subjects sub ON sub.id = s.subject_id
         JOIN identity_actor_links l
           ON l.id = s.actor_link_id
          AND l.subject_id = s.subject_id
          AND l.tenant_id = s.tenant_id
          AND l.organization_id = s.organization_id
         JOIN identity_organization_memberships om
           ON om.subject_id = s.subject_id
          AND om.tenant_id = s.tenant_id
          AND om.organization_id = s.organization_id
         JOIN identity_tenant_memberships tm
           ON tm.id = om.tenant_membership_id
          AND tm.subject_id = om.subject_id
          AND tm.tenant_id = om.tenant_id
         JOIN tpay_tenants t ON t.id = s.tenant_id
         JOIN tpay_organization_tenants ot
           ON ot.tenant_id = s.tenant_id
          AND ot.organization_id = s.organization_id
        WHERE s.id = $1
          AND s.api_session_id = $2
          AND l.actor_id = $3
          AND l.domain_code = $4
          AND l.status = 'active'
          AND sub.status = 'active'
          AND tm.status = 'active'
          AND tm.revoked_at IS NULL
          AND tm.valid_from <= $5::timestamptz
          AND (tm.valid_until IS NULL OR tm.valid_until > $5::timestamptz)
          AND om.status = 'active'
          AND om.revoked_at IS NULL
          AND om.valid_from <= $5::timestamptz
          AND (om.valid_until IS NULL OR om.valid_until > $5::timestamptz)
          AND t.status = 'active'
          AND ot.status = 'active'
          AND s.revoked_at IS NULL
          AND s.issued_at <= $5::timestamptz
          AND s.expires_at > $5::timestamptz
        LIMIT 1`,
      [requiredString(session, "id"), apiSession.sessionId, apiSession.actorId, domainCode, nowIso]
    );
    const row = resolved.rows[0];
    if (!row) throw new Error("COMMUNITY_TONTINE_MEMBERSHIP_NOT_ACTIVE");

    const grantRows = await client.query(
      `SELECT permission
         FROM identity_permission_grants
        WHERE membership_id = $1
          AND tenant_id = $2
          AND organization_id = $3
          AND domain_code = $4
          AND revoked_at IS NULL
          AND valid_from <= $5::timestamptz
          AND valid_until > $5::timestamptz`,
      [requiredString(row, "membership_id"), tenantId, organizationId, domainCode, nowIso]
    );
    const permissions = [...new Set(
      grantRows.rows
        .map(grant => String(grant.permission))
        .filter((permission): permission is Permission =>
          allowedPermissions.has(permission as Permission)
        )
    )].sort();

    if (permissions.length === 0) throw new Error("IDENTITY_DOMAIN_PERMISSIONS_EMPTY");
    const assurance = requiredString(row, "assurance");
    if (assurance !== "standard" && assurance !== "step_up" && assurance !== "hardware") {
      throw new Error("IDENTITY_ASSURANCE_INVALID");
    }

    await client.query("COMMIT");
    transactionOpen = false;
    return {
      subjectId: requiredString(row, "subject_id"),
      sessionId: apiSession.sessionId,
      tenantId,
      organizationId,
      membershipId: requiredString(row, "membership_id"),
      permissions,
      assurance: assurance === "standard" ? "standard" : "step_up",
      issuedAt: Date.parse(String(row.issued_at)),
      expiresAt: Date.parse(String(row.expires_at))
    };
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => undefined);
      transactionOpen = false;
    }
    throw error;
  } finally {
    client.release?.();
  }
}


/**
 * Community Tontine compatibility entry point. Domain callers must provide an
 * explicit permission allowlist; permissions from another domain are discarded.
 */
export async function resolveCommunityTontineIdentity(
  pool: IdentityRuntimePool,
  apiSession: VerifiedApiSession,
  now = new Date()
): Promise<ResolvedIdentityRuntimeContext> {
  return resolveOrganizationDomainIdentity(
    pool,
    apiSession,
    "community_tontine",
    COMMUNITY_PERMISSIONS,
    now
  );
}
