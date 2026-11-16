import type { Permission } from "../../security/src/policy.js";

export interface IdentitySession {
  id: string;
  subjectId: string;
  tenantId: string;
  activeOrganizationId: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
}

export interface OrganizationMembership {
  id: string;
  subjectId: string;
  tenantId: string;
  organizationId: string;
  status: "active" | "suspended" | "revoked";
  validFrom: number;
  validUntil?: number;
  revokedAt?: number;
}

export interface TemporalPermissionGrant {
  id: string;
  membershipId: string;
  tenantId: string;
  organizationId: string;
  permission: Permission;
  validFrom: number;
  expiresAt: number;
  revokedAt?: number;
}

export interface ResolvedOrganizationContext {
  subjectId: string;
  sessionId: string;
  tenantId: string;
  organizationId: string;
  membershipId: string;
  permissions: readonly Permission[];
}

export interface OrganizationContextInput {
  session: IdentitySession;
  membership: OrganizationMembership | null;
  grants: readonly TemporalPermissionGrant[];
  now?: number;
}

export function resolveOrganizationContext(input: OrganizationContextInput): ResolvedOrganizationContext {
  const { session, membership } = input;
  const now = input.now ?? Date.now();

  if (session.revokedAt !== undefined) throw new Error("IDENTITY_SESSION_REVOKED");
  if (now >= session.expiresAt) throw new Error("IDENTITY_SESSION_EXPIRED");
  if (now < session.createdAt) throw new Error("IDENTITY_SESSION_NOT_YET_VALID");
  if (!session.subjectId || !session.tenantId || !session.activeOrganizationId) {
    throw new Error("IDENTITY_SESSION_CONTEXT_INCOMPLETE");
  }
  if (!membership) throw new Error("ORGANIZATION_MEMBERSHIP_REQUIRED");
  if (membership.subjectId !== session.subjectId) throw new Error("ORGANIZATION_MEMBERSHIP_SUBJECT_MISMATCH");
  if (membership.tenantId !== session.tenantId) throw new Error("ORGANIZATION_MEMBERSHIP_TENANT_MISMATCH");
  if (membership.organizationId !== session.activeOrganizationId) throw new Error("ORGANIZATION_MEMBERSHIP_SCOPE_MISMATCH");
  if (membership.status !== "active" || membership.revokedAt !== undefined) {
    throw new Error("ORGANIZATION_MEMBERSHIP_NOT_ACTIVE");
  }
  if (now < membership.validFrom) throw new Error("ORGANIZATION_MEMBERSHIP_NOT_YET_VALID");
  if (membership.validUntil !== undefined && now >= membership.validUntil) {
    throw new Error("ORGANIZATION_MEMBERSHIP_EXPIRED");
  }

  const permissions = new Set<Permission>();
  for (const grant of input.grants) {
    if (grant.membershipId !== membership.id ||
        grant.tenantId !== session.tenantId ||
        grant.organizationId !== session.activeOrganizationId ||
        grant.revokedAt !== undefined ||
        now < grant.validFrom ||
        now >= grant.expiresAt) continue;
    permissions.add(grant.permission);
  }

  return {
    subjectId: session.subjectId,
    sessionId: session.id,
    tenantId: session.tenantId,
    organizationId: session.activeOrganizationId,
    membershipId: membership.id,
    permissions: [...permissions].sort()
  };
}

export function assertOrganizationPermission(
  context: ResolvedOrganizationContext,
  permission: Permission
): void {
  if (!context.permissions.includes(permission)) throw new Error(`IDENTITY_PERMISSION_DENIED:${permission}`);
}
