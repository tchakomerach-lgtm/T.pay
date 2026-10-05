import { createHash } from "node:crypto";

export type ReplayClaimResult = "CLAIMED" | "REPLAY" | "DIGEST_CONFLICT";
export type ApprovalConsumeResult = "CONSUMED" | "MISSING" | "EXPIRED" | "DIGEST_MISMATCH" | "ALREADY_CONSUMED";

export interface SecurityDecisionProvenance {
  policyVersion: string;
  policyRevision: string;
  requestDigest: string;
  evaluatedAt: string;
  decisionSource: "runtime-policy" | "human-approval" | "emergency-policy";
  ruleIds: readonly string[];
}

export interface SecurityEventInput {
  eventId: string;
  tenantId: string;
  requestId: string;
  actorId: string;
  occurredAt: string;
  decision: "ALLOW" | "DENY" | "REQUIRE_HUMAN_APPROVAL";
  reasonCode: string;
  provenance: SecurityDecisionProvenance;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface DurableSecurityStore {
  claimReplay(input: {
    tenantId: string;
    jti: string;
    requestDigest: string;
    expiresAt: string;
    source: "user" | "agent" | "system";
  }): Promise<ReplayClaimResult>;
  createApproval(input: {
    approvalId: string;
    tenantId: string;
    approverId: string;
    requestDigest: string;
    expiresAt: string;
  }): Promise<void>;
  consumeApproval(input: {
    approvalId: string;
    tenantId: string;
    requestDigest: string;
    now: string;
  }): Promise<ApprovalConsumeResult>;
  appendSecurityEvent(input: SecurityEventInput): Promise<string>;
}

const FORBIDDEN_METADATA_KEY = /(?:password|secret|token|cookie|authorization|private[_-]?key|otp|cvv|pin|credential)/i;

function assertDigest(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("INVALID_REQUEST_DIGEST");
}

function assertIso(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_SECURITY_TIMESTAMP");
  return parsed;
}

export function assertSafeSecurityMetadata(value: unknown, path = "metadata"): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeSecurityMetadata(item, path + "[" + index + "]"));
    return;
  }
  if (typeof value !== "object") throw new Error("INVALID_SECURITY_METADATA:" + path);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_METADATA_KEY.test(key)) throw new Error("SENSITIVE_SECURITY_METADATA:" + path + "." + key);
    assertSafeSecurityMetadata(child, path + "." + key);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function securityEventHash(input: SecurityEventInput, previousHash: string | null): string {
  assertDigest(input.provenance.requestDigest);
  assertSafeSecurityMetadata(input.metadata ?? {});
  const canonical = JSON.stringify(canonicalize({
    eventId: input.eventId,
    tenantId: input.tenantId,
    requestId: input.requestId,
    actorId: input.actorId,
    occurredAt: input.occurredAt,
    decision: input.decision,
    reasonCode: input.reasonCode,
    provenance: input.provenance,
    metadata: input.metadata ?? {},
    previousHash,
  }));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export class InMemoryDurableSecurityStore implements DurableSecurityStore {
  private readonly replays = new Map<string, { digest: string; expiresAt: number }>();
  private readonly approvals = new Map<string, {
    tenantId: string;
    approverId: string;
    digest: string;
    expiresAt: number;
    consumed: boolean;
  }>();
  private readonly events: Array<{ hash: string; input: SecurityEventInput }> = [];
  private readonly tenantHeads = new Map<string, string>();

  async claimReplay(input: {
    tenantId: string; jti: string; requestDigest: string; expiresAt: string;
    source: "user" | "agent" | "system";
  }): Promise<ReplayClaimResult> {
    if (!input.tenantId || !input.jti) throw new Error("INVALID_REPLAY_IDENTITY");
    assertDigest(input.requestDigest);
    const expiresAt = assertIso(input.expiresAt);
    if (expiresAt <= Date.now()) throw new Error("REPLAY_EXPIRY_INVALID");
    const key = input.tenantId + ":" + input.jti;
    const existing = this.replays.get(key);
    if (existing) return existing.digest === input.requestDigest ? "REPLAY" : "DIGEST_CONFLICT";
    this.replays.set(key, { digest: input.requestDigest, expiresAt });
    return "CLAIMED";
  }

  async createApproval(input: {
    approvalId: string; tenantId: string; approverId: string; requestDigest: string; expiresAt: string;
  }): Promise<void> {
    if (!input.approvalId || !input.tenantId || !input.approverId) throw new Error("INVALID_APPROVAL");
    assertDigest(input.requestDigest);
    const expiresAt = assertIso(input.expiresAt);
    if (expiresAt <= Date.now()) throw new Error("APPROVAL_EXPIRY_INVALID");
    if (this.approvals.has(input.approvalId)) throw new Error("APPROVAL_ID_CONFLICT");
    this.approvals.set(input.approvalId, {
      tenantId: input.tenantId, approverId: input.approverId,
      digest: input.requestDigest, expiresAt, consumed: false
    });
  }

  async consumeApproval(input: {
    approvalId: string; tenantId: string; requestDigest: string; now: string;
  }): Promise<ApprovalConsumeResult> {
    assertDigest(input.requestDigest);
    const approval = this.approvals.get(input.approvalId);
    if (!approval || approval.tenantId !== input.tenantId) return "MISSING";
    if (approval.digest !== input.requestDigest) return "DIGEST_MISMATCH";
    if (approval.consumed) return "ALREADY_CONSUMED";
    if (approval.expiresAt <= assertIso(input.now)) return "EXPIRED";
    approval.consumed = true;
    return "CONSUMED";
  }

  async appendSecurityEvent(input: SecurityEventInput): Promise<string> {
    if (!input.eventId || !input.tenantId || !input.requestId || !input.actorId) throw new Error("INVALID_SECURITY_EVENT");
    assertIso(input.occurredAt);
    assertDigest(input.provenance.requestDigest);
    assertSafeSecurityMetadata(input.metadata ?? {});
    const previousHash = this.tenantHeads.get(input.tenantId) ?? null;
    const hash = securityEventHash(input, previousHash);
    this.events.push({ hash, input });
    this.tenantHeads.set(input.tenantId, hash);
    return hash;
  }

  getEventCount(): number { return this.events.length; }
}
