/**
 * T.Pay Fortress — explicit security-plane and vault-domain authorization.
 *
 * This module is a policy decision point only. It does not decrypt data,
 * issue credentials, or replace PostgreSQL RLS / the KMS-HSM access broker.
 */
export type SecurityPlane = "USER" | "ORGANIZATION" | "ADMIN_CONTROL" | "SERVICE";
export type VaultClass =
  | "general" | "administrator" | "finance" | "identity" | "ai"
  | "organization" | "data_rag" | "document" | "social"
  | "offline_field" | "audit_evidence" | "user_module" | "super_admin";
export type VaultPermission =
  | "read" | "write" | "decrypt" | "seal" | "manage_access"
  | "destroy" | "rotate_key";

export interface VaultBoundaryRequest {
  plane: SecurityPlane;
  vault: {
    id: string;
    tenantId: string;
    organizationId: string | null;
    vaultClass: VaultClass;
    status: "active" | "sealed" | "suspended" | "destroyed";
  };
  principal: {
    id: string;
    kind: "user" | "privileged" | "workload";
    active: boolean;
  };
  session: {
    id: string;
    kind: "user" | "privileged" | "workload";
    assurance: "standard" | "webauthn_uv" | "hardware_key" | "attested_workload";
    expiresAt: string;
    revokedAt: string | null;
  };
  grant: {
    vaultId: string;
    actorId: string;
    permission: VaultPermission;
    validFrom: string;
    validUntil: string | null;
    revokedAt: string | null;
  };
  context: {
    tenantId: string | null;
    organizationId: string | null;
    userSessionId: string | null;
    privilegedSessionId: string | null;
    now?: string;
  };
}

export type VaultBoundaryDecision =
  | { allowed: true; plane: SecurityPlane; vaultId: string; permission: VaultPermission }
  | { allowed: false; reason:
      | "VAULT_INACTIVE" | "PRINCIPAL_INACTIVE" | "SESSION_REVOKED"
      | "SESSION_EXPIRED" | "SESSION_KIND_MISMATCH" | "GRANT_REVOKED"
      | "GRANT_SCOPE_MISMATCH" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED"
      | "VAULT_PERMISSION_MISMATCH" | "ADMIN_PLANE_REQUIRES_PRIVILEGED_SESSION"
      | "ADMIN_PLANE_USER_CONTEXT_FORBIDDEN" | "ADMIN_PLANE_VAULT_REQUIRED"
      | "ADMIN_PLANE_PLATFORM_SCOPE_REQUIRED" | "ADMIN_PLANE_HARDWARE_ASSURANCE_REQUIRED"
      | "USER_PLANE_CANNOT_ACCESS_ADMIN_VAULT" | "TENANT_SCOPE_MISMATCH"
      | "ORGANIZATION_SCOPE_REQUIRED" | "ORGANIZATION_SCOPE_MISMATCH"
      | "USER_PLANE_SESSION_REQUIRED" | "SERVICE_PLANE_ATTESTATION_REQUIRED" };

const time = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/**
 * No implicit inheritance: a grant is valid only for the exact vault ID.
 * ADMIN_CONTROL is intentionally independent from user/organization sessions.
 */
export function authorizeVaultBoundary(input: VaultBoundaryRequest): VaultBoundaryDecision {
  const now = time(input.context.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) return { allowed: false, reason: "SESSION_EXPIRED" };
  if (input.vault.status !== "active") return { allowed: false, reason: "VAULT_INACTIVE" };
  if (!input.principal.active) return { allowed: false, reason: "PRINCIPAL_INACTIVE" };
  if (input.session.revokedAt !== null) return { allowed: false, reason: "SESSION_REVOKED" };
  if (!Number.isFinite(time(input.session.expiresAt)) || time(input.session.expiresAt) <= now) {
    return { allowed: false, reason: "SESSION_EXPIRED" };
  }
  if (input.grant.revokedAt !== null) return { allowed: false, reason: "GRANT_REVOKED" };
  if (input.grant.vaultId !== input.vault.id || input.grant.actorId !== input.principal.id) {
    return { allowed: false, reason: "GRANT_SCOPE_MISMATCH" };
  }
  if (input.grant.permission.length === 0) return { allowed: false, reason: "VAULT_PERMISSION_MISMATCH" };
  if (!Number.isFinite(time(input.grant.validFrom)) || time(input.grant.validFrom) > now) {
    return { allowed: false, reason: "GRANT_NOT_YET_VALID" };
  }
  if (input.grant.validUntil !== null &&
      (!Number.isFinite(time(input.grant.validUntil)) || time(input.grant.validUntil) <= now)) {
    return { allowed: false, reason: "GRANT_EXPIRED" };
  }

  if (input.plane === "ADMIN_CONTROL") {
    if (input.vault.vaultClass !== "super_admin") {
      return { allowed: false, reason: "ADMIN_PLANE_VAULT_REQUIRED" };
    }
    if (input.vault.tenantId !== "__platform__" || input.vault.organizationId !== null ||
        input.context.tenantId !== "__platform__" || input.context.organizationId !== null) {
      return { allowed: false, reason: "ADMIN_PLANE_PLATFORM_SCOPE_REQUIRED" };
    }
    if (input.context.userSessionId !== null) {
      return { allowed: false, reason: "ADMIN_PLANE_USER_CONTEXT_FORBIDDEN" };
    }
    if (input.principal.kind !== "privileged" || input.session.kind !== "privileged" ||
        input.context.privilegedSessionId !== input.session.id) {
      return { allowed: false, reason: "ADMIN_PLANE_REQUIRES_PRIVILEGED_SESSION" };
    }
    if (input.session.assurance !== "hardware_key") {
      return { allowed: false, reason: "ADMIN_PLANE_HARDWARE_ASSURANCE_REQUIRED" };
    }
  } else if (input.plane === "SERVICE") {
    if (input.vault.vaultClass === "super_admin") {
      return { allowed: false, reason: "USER_PLANE_CANNOT_ACCESS_ADMIN_VAULT" };
    }
    if (input.principal.kind !== "workload" || input.session.kind !== "workload" ||
        input.session.assurance !== "attested_workload" ||
        input.context.privilegedSessionId !== null) {
      return { allowed: false, reason: "SERVICE_PLANE_ATTESTATION_REQUIRED" };
    }
    if (!input.context.tenantId || input.context.tenantId !== input.vault.tenantId) {
      return { allowed: false, reason: "TENANT_SCOPE_MISMATCH" };
    }
  } else {
    if (input.vault.vaultClass === "super_admin") {
      return { allowed: false, reason: "USER_PLANE_CANNOT_ACCESS_ADMIN_VAULT" };
    }
    if (input.principal.kind !== "user" || input.session.kind !== "user" ||
        input.context.userSessionId !== input.session.id ||
        input.context.privilegedSessionId !== null) {
      return { allowed: false, reason: "USER_PLANE_SESSION_REQUIRED" };
    }
    if (!input.context.tenantId || input.context.tenantId !== input.vault.tenantId) {
      return { allowed: false, reason: "TENANT_SCOPE_MISMATCH" };
    }
    if (input.plane === "ORGANIZATION") {
      if (!input.context.organizationId) return { allowed: false, reason: "ORGANIZATION_SCOPE_REQUIRED" };
      if (input.context.organizationId !== input.vault.organizationId) {
        return { allowed: false, reason: "ORGANIZATION_SCOPE_MISMATCH" };
      }
    } else if (input.vault.organizationId !== null &&
               input.context.organizationId !== input.vault.organizationId) {
      return { allowed: false, reason: "ORGANIZATION_SCOPE_MISMATCH" };
    }
  }

  return { allowed: true, plane: input.plane, vaultId: input.vault.id, permission: input.grant.permission };
}
