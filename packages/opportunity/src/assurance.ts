import { createHash, randomUUID } from "node:crypto";

export type AssuranceStatus =
  | "UNVERIFIED"
  | "LOW"
  | "PARTIAL"
  | "VERIFIED"
  | "STRONGLY_VERIFIED"
  | "CRYPTOGRAPHICALLY_VERIFIED";

export type ClaimType =
  | "identity"
  | "skill"
  | "experience"
  | "availability"
  | "capacity"
  | "certification"
  | "organization"
  | "equipment"
  | "location"
  | "price"
  | "outcome";

export type EvidenceKind =
  | "document"
  | "credential"
  | "transaction"
  | "attestation"
  | "photo"
  | "video"
  | "signature"
  | "sensor"
  | "client_confirmation"
  | "system_record";

export interface Claim {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly issuerId: string;
  readonly type: ClaimType;
  readonly value: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly status: AssuranceStatus;
  readonly confidence: number;
  readonly evidenceIds: readonly string[];
  readonly provenance: string;
}

export interface Evidence {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly kind: EvidenceKind;
  readonly sha256: string;
  readonly capturedAt: string;
  readonly expiresAt?: string;
  readonly issuerId?: string;
  readonly origin: "user" | "organization" | "system" | "provider";
  readonly integrity: "unknown" | "verified" | "tampered" | "quarantined";
  readonly metadata: Readonly<Record<string, string>>;
}

export interface Commitment {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly opportunityId: string;
  readonly action: string;
  readonly expectedResult: string;
  readonly deadline: string;
  readonly status: "OPEN" | "AT_RISK" | "FULFILLED" | "BREACHED" | "CANCELLED";
  readonly evidenceRequired: boolean;
  readonly dependencyIds: readonly string[];
}

export interface ActionReceipt {
  readonly id: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly agentId?: string;
  readonly organizationId: string;
  readonly intent: string;
  readonly action: string;
  readonly policyDecision: "ALLOW" | "DENY" | "REVIEW";
  readonly expectedEffect: string;
  readonly actualEffect?: string;
  readonly dataClass: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  readonly createdAt: string;
  readonly actionHash: string;
}

export interface AgentAuthority {
  readonly agentId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly organizationId: string;
  readonly purpose: string;
  readonly resource: string;
  readonly actions: readonly string[];
  readonly expiresAt: string;
  readonly maxActions: number;
  readonly maxValueMinor?: bigint;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) throw new Error("OPPORTUNITY_CONFIDENCE_INVALID");
  return Math.max(0, Math.min(100, value));
}

export function assuranceFromConfidence(confidence: number): AssuranceStatus {
  const value = clampConfidence(confidence);
  if (value >= 98) return "CRYPTOGRAPHICALLY_VERIFIED";
  if (value >= 90) return "STRONGLY_VERIFIED";
  if (value >= 75) return "VERIFIED";
  if (value >= 50) return "PARTIAL";
  if (value > 0) return "LOW";
  return "UNVERIFIED";
}

export function isClaimUsable(claim: Claim, now = new Date()): boolean {
  if (claim.status === "UNVERIFIED" || claim.confidence <= 0) return false;
  return claim.expiresAt === undefined || Date.parse(claim.expiresAt) >= now.getTime();
}

export function verifyEvidenceHash(input: { content: Uint8Array; expectedSha256: string }): boolean {
  const actual = createHash("sha256").update(input.content).digest("hex");
  return actual === input.expectedSha256;
}

export function createActionReceipt(input: {
  tenantId: string;
  actorId: string;
  agentId?: string;
  organizationId: string;
  intent: string;
  action: string;
  policyDecision: ActionReceipt["policyDecision"];
  expectedEffect: string;
  actualEffect?: string;
  dataClass: ActionReceipt["dataClass"];
  createdAt?: Date;
}): ActionReceipt {
  const createdAt = input.createdAt ?? new Date();
  const normalized = JSON.stringify({
    tenantId: input.tenantId,
    actorId: input.actorId,
    agentId: input.agentId ?? null,
    organizationId: input.organizationId,
    intent: input.intent,
    action: input.action,
    policyDecision: input.policyDecision,
    expectedEffect: input.expectedEffect,
    actualEffect: input.actualEffect ?? null,
    dataClass: input.dataClass,
    createdAt: createdAt.toISOString(),
  });
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    actorId: input.actorId,
    ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
    organizationId: input.organizationId,
    intent: input.intent,
    action: input.action,
    policyDecision: input.policyDecision,
    expectedEffect: input.expectedEffect,
    ...(input.actualEffect === undefined ? {} : { actualEffect: input.actualEffect }),
    dataClass: input.dataClass,
    createdAt: createdAt.toISOString(),
    actionHash: createHash("sha256").update(normalized).digest("hex"),
  };
}

export function authorizeAgentAction(input: {
  authority: AgentAuthority;
  tenantId: string;
  resource: string;
  action: string;
  now?: Date;
  consumedActions: number;
  valueMinor?: bigint;
}): "ALLOW" | "DENY" {
  const now = input.now ?? new Date();
  if (input.authority.tenantId !== input.tenantId || input.authority.organizationId === "" || input.authority.resource !== input.resource) return "DENY";
  if (!input.authority.actions.includes(input.action)) return "DENY";
  if (Date.parse(input.authority.expiresAt) < now.getTime()) return "DENY";
  if (input.consumedActions >= input.authority.maxActions) return "DENY";
  if (input.valueMinor !== undefined && input.authority.maxValueMinor !== undefined && input.valueMinor > input.authority.maxValueMinor) return "DENY";
  return "ALLOW";
}

export function evaluateCommitmentRisk(input: {
  commitment: Commitment;
  now?: Date;
  dependencyRisk: number;
  capacityRisk: number;
  evidenceRisk: number;
}): number {
  const now = input.now ?? new Date();
  const deadline = Date.parse(input.commitment.deadline);
  const hours = (deadline - now.getTime()) / 3_600_000;
  const timeRisk = hours <= 0 ? 100 : hours <= 24 ? 80 : hours <= 72 ? 45 : 10;
  const score = timeRisk * 0.35
    + clampConfidence(input.dependencyRisk) * 0.25
    + clampConfidence(input.capacityRisk) * 0.25
    + clampConfidence(input.evidenceRisk) * 0.15;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function commitmentStatusFromRisk(risk: number): Commitment["status"] {
  if (risk >= 80) return "AT_RISK";
  return "OPEN";
}

export function normalizeOpportunityAction(input: {
  organizationId: string;
  opportunityId: string;
  action: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
}): string {
  if (!input.organizationId || !input.opportunityId || !input.action) {
    throw new Error("OPPORTUNITY_ACTION_CONTEXT_REQUIRED");
  }
  return JSON.stringify({
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    action: input.action,
    parameters: input.parameters,
  });
}
