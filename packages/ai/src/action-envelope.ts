import { createHash } from "node:crypto";

export type AiActionRisk = "L0"|"L1"|"L2"|"L3"|"L4"|"L5";

export interface AiActionEnvelope {
  readonly envelopeVersion: "1";
  readonly actionId: string;
  readonly toolName: string;
  readonly toolVersion: string;
  readonly organizationId: string;
  readonly actorId: string;
  readonly agentId: string;
  readonly purpose: string;
  readonly risk: AiActionRisk;
  readonly canonicalPayload: string;
  readonly payloadHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly correlationId: string;
}

export function canonicalPayloadHash(payload: unknown): string {
  const canonical = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (!canonical) throw new Error("AI_ACTION_PAYLOAD_REQUIRED");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function createActionEnvelope(input: Omit<AiActionEnvelope,"envelopeVersion"|"payloadHash"> & {payloadHash?: string}): AiActionEnvelope {
  if (!input.actionId.trim() || !input.toolName.trim() || !input.toolVersion.trim()) throw new Error("AI_ACTION_IDENTITY_REQUIRED");
  if (!input.organizationId.trim() || !input.actorId.trim() || !input.agentId.trim()) throw new Error("AI_ACTION_SCOPE_REQUIRED");
  if (!input.purpose.trim() || !input.correlationId.trim()) throw new Error("AI_ACTION_CONTEXT_REQUIRED");
  if (input.expiresAt <= input.createdAt) throw new Error("AI_ACTION_EXPIRY_INVALID");
  const expected = canonicalPayloadHash(input.canonicalPayload);
  if (input.payloadHash !== undefined && input.payloadHash !== expected) throw new Error("AI_ACTION_PAYLOAD_HASH_MISMATCH");
  return {...input,envelopeVersion:"1",payloadHash:expected};
}
