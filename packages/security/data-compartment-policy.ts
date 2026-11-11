/**
 * P058 — Data compartment authorization.
 *
 * A login/session is not a data capability. Every record access requires an
 * exact, purpose-bound grant for the record and compartment. No role, parent
 * vault, organization membership, Admin session or sibling record inherits it.
 */
export type DataPlane = "USER" | "ORGANIZATION" | "ADMIN_CONTROL" | "SERVICE";
export type DataActorKind = "user" | "workload" | "privileged";
export type DataPermission = "metadata_read" | "read" | "write" | "decrypt" | "seal" | "revoke";
export type DataClass =
 | "identity" | "guardianship" | "academic" | "attendance" | "health"
 | "safeguarding" | "finance" | "documents" | "communications" | "biometric"
 | "employment" | "customer_profile" | "transactions" | "credentials"
 | "ai_memory" | "voice" | "social_graph" | "marketplace" | "audit_evidence";

export interface DataCompartmentRequest {
 plane: DataPlane;
 now: string;
 tenantId: string;
 organizationId: string | null;
 subjectRef: string;
 moduleCode: string;
 compartmentId: string;
 vaultId: string;
 dataClass: DataClass;
 recordId: string;
 recordState: "active" | "sealed" | "tombstoned";
 actor: { id: string; kind: DataActorKind; active: boolean };
 session: {
  id: string; kind: DataActorKind; expiresAt: string; revokedAt: string | null;
  userSessionId: string | null; privilegedSessionId: string | null;
  assurance: "standard" | "webauthn_uv" | "hardware_key" | "attested_workload";
 };
 grant: {
  tenantId: string; recordId: string; compartmentId: string; actorId: string;
  actorKind: DataActorKind; permission: DataPermission; purposeCode: string;
  validFrom: string; validUntil: string | null; revokedAt: string | null;
  maxUses: number | null; usesCount: number;
 };
}
export type DataAccessDenial =
 | "INVALID_TIME" | "ACTOR_INACTIVE" | "SESSION_REVOKED" | "SESSION_EXPIRED"
 | "SESSION_PLANE_MISMATCH" | "TENANT_MISMATCH" | "ORGANIZATION_MISMATCH"
 | "COMPARTMENT_MISMATCH" | "RECORD_NOT_ACTIVE" | "GRANT_REVOKED"
 | "GRANT_SCOPE_MISMATCH" | "GRANT_NOT_YET_VALID" | "GRANT_EXPIRED"
 | "GRANT_PERMISSION_MISMATCH" | "GRANT_PURPOSE_REQUIRED" | "GRANT_EXHAUSTED"
 | "ADMIN_HARDWARE_ASSURANCE_REQUIRED" | "ADMIN_BREAKGLASS_REQUIRED"
 | "SERVICE_ATTESTATION_REQUIRED" | "USER_SESSION_REQUIRED";
export type DataAccessDecision =
 | { allowed: true; tenantId: string; compartmentId: string; recordId: string; permission: DataPermission; purposeCode: string }
 | { allowed: false; reason: DataAccessDenial };

const deny = (reason: DataAccessDenial): DataAccessDecision => ({ allowed: false, reason });
const parseTime = (s: string): number => Date.parse(s);

export function authorizeDataCompartment(input: DataCompartmentRequest): DataAccessDecision {
 const now = parseTime(input.now);
 if (!Number.isFinite(now)) return deny("INVALID_TIME");
 if (!input.actor.active) return deny("ACTOR_INACTIVE");
 if (input.session.revokedAt !== null) return deny("SESSION_REVOKED");
 const expiry = parseTime(input.session.expiresAt);
 if (!Number.isFinite(expiry) || expiry <= now) return deny("SESSION_EXPIRED");
 if (input.tenantId !== input.grant.tenantId) return deny("TENANT_MISMATCH");
 if (input.organizationId !== null && input.organizationId !== input.grant.tenantId && input.organizationId.length === 0) return deny("ORGANIZATION_MISMATCH");
 if (input.grant.recordId !== input.recordId || input.grant.compartmentId !== input.compartmentId ||
     input.grant.actorId !== input.actor.id || input.grant.actorKind !== input.actor.kind) return deny("GRANT_SCOPE_MISMATCH");
 if (input.grant.revokedAt !== null) return deny("GRANT_REVOKED");
 if (input.grant.permission !== input.grant.permission) return deny("GRANT_PERMISSION_MISMATCH");
 if (input.grant.validFrom.length === 0 || !Number.isFinite(parseTime(input.grant.validFrom)) || parseTime(input.grant.validFrom) > now) return deny("GRANT_NOT_YET_VALID");
 if (input.grant.validUntil !== null && (!Number.isFinite(parseTime(input.grant.validUntil)) || parseTime(input.grant.validUntil) <= now)) return deny("GRANT_EXPIRED");
 if (!input.grant.purposeCode.trim()) return deny("GRANT_PURPOSE_REQUIRED");
 if (input.grant.maxUses !== null && input.grant.usesCount >= input.grant.maxUses) return deny("GRANT_EXHAUSTED");
 if (input.recordState !== "active") return deny("RECORD_NOT_ACTIVE");
 if (input.plane === "ADMIN_CONTROL") {
  if (input.actor.kind !== "privileged" || input.session.kind !== "privileged" ||
      input.session.privilegedSessionId !== input.session.id || input.session.userSessionId !== null) return deny("SESSION_PLANE_MISMATCH");
  if (input.session.assurance !== "hardware_key") return deny("ADMIN_HARDWARE_ASSURANCE_REQUIRED");
  return deny("ADMIN_BREAKGLASS_REQUIRED");
 }
 if (input.plane === "SERVICE") {
  if (input.actor.kind !== "workload" || input.session.kind !== "workload" ||
      input.session.assurance !== "attested_workload" || input.session.userSessionId !== null ||
      input.session.privilegedSessionId !== null) return deny("SERVICE_ATTESTATION_REQUIRED");
 } else {
  if (input.actor.kind !== "user" || input.session.kind !== "user" ||
      input.session.userSessionId !== input.session.id || input.session.privilegedSessionId !== null) return deny("USER_SESSION_REQUIRED");
 }
 return { allowed: true, tenantId: input.tenantId, compartmentId: input.compartmentId,
  recordId: input.recordId, permission: input.grant.permission, purposeCode: input.grant.purposeCode };
}
