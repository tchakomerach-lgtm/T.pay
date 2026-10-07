import { createHash, randomUUID } from "node:crypto";

export type PrivilegedLevel = "L1_ROUTINE" | "L2_SENSITIVE" | "L3_CRITICAL" | "L4_SUPER_ADMIN" | "L5_ROOT_TRUST";
export type RootTrustState = "LOCKED" | "QUORUM_REQUIRED" | "AVAILABLE" | "COMPROMISED" | "RECOVERY";
export type RecoveryState = "UNKNOWN" | "COMPROMISED" | "ISOLATED" | "FORENSIC" | "REBUILDING" | "VERIFICATION" | "PARTIALLY_TRUSTED" | "TRUSTED" | "MONITORED";
export type Decision = "ALLOW" | "DENY" | "QUORUM_REQUIRED" | "RECOVERY_REQUIRED";

export interface PrivilegedIdentity {
  id: string;
  humanUserId: string;
  level: PrivilegedLevel;
  deviceId: string;
  assurance: "FIDO2" | "HARDWARE_KEY" | "ATTESTED_WORKLOAD";
  active: boolean;
  expiresAt: number;
}

export interface AccessGrant {
  id: string;
  principalId: string;
  resource: string;
  action: string;
  justification: string;
  issuedAt: number;
  expiresAt: number;
  oneShot: boolean;
  approvalCount: number;
  requiredApprovals: number;
}

export interface RootOperation {
  id: string;
  operation: string;
  actorIds: readonly string[];
  independentDomains: readonly string[];
  requestDigest: string;
  createdAt: number;
  expiresAt: number;
}

export interface RecoveryGate {
  infrastructureTrusted: boolean;
  identityTrusted: boolean;
  keysTrusted: boolean;
  ledgerVerified: boolean;
  transactionsReconciled: boolean;
  securityValidated: boolean;
  quorumApproved: boolean;
}

export interface RecoveryRun {
  id: string;
  incidentId: string;
  state: RecoveryState;
  startedAt: number;
  lastTransitionAt: number;
  evidenceDigest: string;
}

const ROOT_QUORUM = 3;
const ROOT_DOMAIN_MINIMUM = 3;

function fail(code: string): never {
  throw new Error(code);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
}

export function requestDigest(request: unknown): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}

export function assertPrivilegedIdentity(identity: PrivilegedIdentity, now = Date.now()): void {
  if (!identity.active) fail("PRIVILEGED_IDENTITY_INACTIVE");
  if (now >= identity.expiresAt) fail("PRIVILEGED_IDENTITY_EXPIRED");
  if (identity.assurance !== "FIDO2" && identity.assurance !== "HARDWARE_KEY" && identity.assurance !== "ATTESTED_WORKLOAD") {
    fail("PRIVILEGED_ASSURANCE_INVALID");
  }
}

export function issueJitGrant(input: Omit<AccessGrant, "id" | "issuedAt">, now = Date.now()): AccessGrant {
  if (!input.justification.trim()) fail("JIT_JUSTIFICATION_REQUIRED");
  if (input.expiresAt <= now) fail("JIT_GRANT_ALREADY_EXPIRED");
  if (input.expiresAt - now > 15 * 60 * 1000) fail("JIT_GRANT_TOO_LONG");
  if (input.requiredApprovals < 1) fail("JIT_APPROVAL_POLICY_INVALID");
  if (input.approvalCount < 0 || input.approvalCount > input.requiredApprovals) fail("JIT_APPROVAL_COUNT_INVALID");
  if (input.oneShot && input.approvalCount < input.requiredApprovals) fail("ONE_SHOT_REQUIRES_QUORUM");
  return { ...input, id: randomUUID(), issuedAt: now };
}

export function consumeGrant(grant: AccessGrant, now = Date.now()): AccessGrant {
  if (now < grant.issuedAt || now >= grant.expiresAt) fail("JIT_GRANT_NOT_ACTIVE");
  if (grant.approvalCount < grant.requiredApprovals) fail("JIT_APPROVAL_REQUIRED");
  if (!grant.oneShot) return grant;
  return { ...grant, expiresAt: now };
}

export function authorizeRootOperation(
  operation: Omit<RootOperation, "id" | "createdAt">,
  rootState: RootTrustState,
  now = Date.now(),
): RootOperation {
  if (rootState === "COMPROMISED") fail("ROOT_TRUST_COMPROMISED");
  if (rootState === "RECOVERY") fail("ROOT_TRUST_RECOVERY_LOCK");
  if (operation.expiresAt <= now) fail("ROOT_OPERATION_EXPIRED");
  if (operation.actorIds.length < ROOT_QUORUM) fail("ROOT_QUORUM_REQUIRED");
  if (new Set(operation.actorIds).size !== operation.actorIds.length) fail("ROOT_ACTOR_DUPLICATE");
  if (new Set(operation.independentDomains).size < ROOT_DOMAIN_MINIMUM) fail("ROOT_INDEPENDENCE_REQUIRED");
  if (!/^[a-f0-9]{64}$/.test(operation.requestDigest)) fail("ROOT_REQUEST_DIGEST_INVALID");
  return { ...operation, id: randomUUID(), createdAt: now };
}

export function evaluateRecoveryGate(gate: RecoveryGate): Decision {
  if (!gate.infrastructureTrusted || !gate.identityTrusted || !gate.keysTrusted) return "RECOVERY_REQUIRED";
  if (!gate.ledgerVerified || !gate.transactionsReconciled) return "RECOVERY_REQUIRED";
  if (!gate.securityValidated) return "RECOVERY_REQUIRED";
  if (!gate.quorumApproved) return "QUORUM_REQUIRED";
  return "ALLOW";
}

export function reopenFinancialOperations(gate: RecoveryGate): void {
  const decision = evaluateRecoveryGate(gate);
  if (decision !== "ALLOW") fail("FINANCIAL_REOPEN_BLOCKED:" + decision);
}

export function transitionRecovery(run: RecoveryRun, next: RecoveryState, now = Date.now()): RecoveryRun {
  const allowed: Record<RecoveryState, readonly RecoveryState[]> = {
    UNKNOWN: ["COMPROMISED", "ISOLATED"],
    COMPROMISED: ["ISOLATED", "FORENSIC"],
    ISOLATED: ["FORENSIC", "REBUILDING"],
    FORENSIC: ["REBUILDING"],
    REBUILDING: ["VERIFICATION"],
    VERIFICATION: ["PARTIALLY_TRUSTED", "REBUILDING"],
    PARTIALLY_TRUSTED: ["TRUSTED", "REBUILDING"],
    TRUSTED: ["MONITORED"],
    MONITORED: [],
  };
  if (!allowed[run.state].includes(next)) fail("RECOVERY_INVALID_TRANSITION:" + run.state + ":" + next);
  return { ...run, state: next, lastTransitionAt: now };
}

export function createRecoveryRun(incidentId: string, evidence: unknown, now = Date.now()): RecoveryRun {
  if (!incidentId.trim()) fail("RECOVERY_INCIDENT_REQUIRED");
  return {
    id: randomUUID(),
    incidentId,
    state: "UNKNOWN",
    startedAt: now,
    lastTransitionAt: now,
    evidenceDigest: requestDigest(evidence),
  };
}

export function assertNoDirectProductionRecovery(resourcePlane: "PRODUCTION" | "RECOVERY"): void {
  if (resourcePlane === "PRODUCTION") fail("DIRECT_PRODUCTION_RECOVERY_FORBIDDEN");
}
