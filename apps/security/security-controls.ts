import { createHash } from "node:crypto";

export type SecurityDecision = "ALLOW" | "DENY" | "REQUIRE_HUMAN_APPROVAL";

export type PermissionWindow = Readonly<{
  actorId: string;
  tenantId: string;
  resource: string;
  action: string;
  startsAt: string;
  expiresAt: string;
  timezone: string;
  emergencyOverride?: boolean;
}>;

export type SecurityRequest = Readonly<{
  requestId: string;
  actorId: string;
  tenantId: string;
  resource: string;
  action: string;
  occurredAt: string;
  source: "user" | "agent" | "system";
  capability?: Readonly<{
    id: string;
    expiresAt: string;
    allowedActions: readonly string[];
    allowedResources: readonly string[];
    tenantId: string;
    requiresHumanApproval?: boolean;
  }>;
  permission?: PermissionWindow;
  emergency?: Readonly<{
    enabled: boolean;
    reason: string;
    expiresAt: string;
  }>;
}>;

export type SecurityEvaluation = Readonly<{
  decision: SecurityDecision;
  reason:
    | "VALID"
    | "TENANT_MISMATCH"
    | "CAPABILITY_MISSING"
    | "CAPABILITY_EXPIRED"
    | "CAPABILITY_SCOPE"
    | "PERMISSION_MISSING"
    | "PERMISSION_NOT_ACTIVE"
    | "EMERGENCY_INVALID"
    | "HUMAN_APPROVAL_REQUIRED";
}>;

const toEpoch = (value: string): number => {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    throw new Error("Invalid timestamp");
  }
  return epoch;
};

export function evaluateSecurityRequest(
  request: SecurityRequest,
  nowIso: string,
): SecurityEvaluation {
  const now = toEpoch(nowIso);

  if (!request.actorId || !request.tenantId || !request.resource || !request.action) {
    return { decision: "DENY", reason: "CAPABILITY_MISSING" };
  }

  if (request.permission?.tenantId !== request.tenantId) {
    return { decision: "DENY", reason: "TENANT_MISMATCH" };
  }

  if (request.capability?.tenantId !== request.tenantId) {
    return { decision: "DENY", reason: "TENANT_MISMATCH" };
  }

  if (!request.capability) {
    return { decision: "DENY", reason: "CAPABILITY_MISSING" };
  }

  if (toEpoch(request.capability.expiresAt) <= now) {
    return { decision: "DENY", reason: "CAPABILITY_EXPIRED" };
  }

  if (!request.capability.allowedActions.includes(request.action)
      || !request.capability.allowedResources.includes(request.resource)) {
    return { decision: "DENY", reason: "CAPABILITY_SCOPE" };
  }

  if (!request.permission) {
    return { decision: "DENY", reason: "PERMISSION_MISSING" };
  }

  const starts = toEpoch(request.permission.startsAt);
  const expires = toEpoch(request.permission.expiresAt);
  if (request.permission.actorId !== request.actorId
      || request.permission.resource !== request.resource
      || request.permission.action !== request.action
      || starts > now
      || expires <= now) {
    return { decision: "DENY", reason: "PERMISSION_NOT_ACTIVE" };
  }

  if (request.emergency?.enabled) {
    if (!request.emergency.reason.trim() || toEpoch(request.emergency.expiresAt) <= now) {
      return { decision: "DENY", reason: "EMERGENCY_INVALID" };
    }
  }

  if (request.capability.requiresHumanApproval === true) {
    return { decision: "REQUIRE_HUMAN_APPROVAL", reason: "HUMAN_APPROVAL_REQUIRED" };
  }

  return { decision: "ALLOW", reason: "VALID" };
}

/**
 * Stable digest used to bind approvals, audit records and replay barriers
 * to the exact security-relevant request. This is not a signature.
 */
export function securityRequestDigest(request: SecurityRequest): string {
  const canonical = JSON.stringify({
    requestId: request.requestId,
    actorId: request.actorId,
    tenantId: request.tenantId,
    resource: request.resource,
    action: request.action,
    occurredAt: request.occurredAt,
    source: request.source,
    capability: request.capability ?? null,
    permission: request.permission ?? null,
    emergency: request.emergency ?? null,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
