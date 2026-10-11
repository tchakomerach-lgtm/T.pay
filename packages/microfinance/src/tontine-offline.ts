import { createHash, sign, verify, type KeyObject } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";

export type OfflineTontineOperationKind = "contribution_intent" | "collection_receipt" | "beneficiary_ack";

export type OfflineTontineOperationState =
  | "captured"
  | "queued"
  | "accepted"
  | "rejected"
  | "needs_review"
  | "reconciled";

export interface OfflineTontineOperation {
  readonly operationId: UUID;
  readonly organizationId: UUID;
  readonly groupId: UUID;
  readonly membershipId: UUID;
  readonly deviceId: string;
  readonly sequence: number;
  readonly kind: OfflineTontineOperationKind;
  readonly idempotencyKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly capturedAt: string;
  readonly expiresAt: string;
  readonly signature: string;
  readonly state: OfflineTontineOperationState;
}

export interface OfflineVerificationResult {
  readonly accepted: boolean;
  readonly reason:
    | "ok"
    | "expired"
    | "sequence_replay"
    | "duplicate"
    | "invalid_signature"
    | "unsupported_operation"
    | "financial_mutation_forbidden"
    | "conflict";
}

export interface OfflineTontineSequenceStore {
  getLastAcceptedSequence(deviceId: string): Promise<number>;
  claimSequence(deviceId: string, sequence: number): Promise<boolean>;
}

function canonicalPayload(operation: Omit<OfflineTontineOperation, "signature">): string {
  return JSON.stringify({
    operationId: operation.operationId,
    organizationId: operation.organizationId,
    groupId: operation.groupId,
    membershipId: operation.membershipId,
    deviceId: operation.deviceId,
    sequence: operation.sequence,
    kind: operation.kind,
    idempotencyKey: operation.idempotencyKey,
    payload: operation.payload,
    capturedAt: operation.capturedAt,
    expiresAt: operation.expiresAt,
    state: operation.state
  });
}

export function signOfflineTontineOperation(
  operation: Omit<OfflineTontineOperation, "signature">,
  privateKey: KeyObject
): OfflineTontineOperation {
  const data = canonicalPayload(operation);
  const signature = sign(null, Buffer.from(data, "utf8"), privateKey).toString("base64url");
  return { ...operation, signature };
}

export async function verifyOfflineTontineOperation(
  operation: OfflineTontineOperation,
  publicKey: KeyObject,
  sequenceStore: OfflineTontineSequenceStore,
  now: string
): Promise<OfflineVerificationResult> {
  if (new Date(operation.expiresAt).getTime() <= new Date(now).getTime()) {
    return { accepted: false, reason: "expired" };
  }

  const { signature, ...unsigned } = operation;
  const valid = verify(null, Buffer.from(canonicalPayload(unsigned), "utf8"), publicKey, Buffer.from(signature, "base64url"));
  if (!valid) return { accepted: false, reason: "invalid_signature" };

  if (!["contribution_intent", "collection_receipt", "beneficiary_ack"].includes(operation.kind)) {
    return { accepted: false, reason: "unsupported_operation" };
  }

  if (operation.kind === "collection_receipt" && operation.payload["ledgerMutation"] === true) {
    return { accepted: false, reason: "financial_mutation_forbidden" };
  }

  const last = await sequenceStore.getLastAcceptedSequence(operation.deviceId);
  if (operation.sequence <= last) return { accepted: false, reason: "sequence_replay" };

  const claimed = await sequenceStore.claimSequence(operation.deviceId, operation.sequence);
  if (!claimed) return { accepted: false, reason: "sequence_replay" };

  return { accepted: true, reason: "ok" };
}

export function offlineOperationIdempotencyHash(operation: OfflineTontineOperation): string {
  return createHash("sha256")
    .update([operation.organizationId, operation.groupId, operation.membershipId, operation.idempotencyKey].join("|"), "utf8")
    .digest("hex");
}

export function classifyOfflineConflict(input: {
  operation: OfflineTontineOperation;
  serverState: "missing" | "already_confirmed" | "already_reversed" | "different_amount" | "different_member";
}): OfflineVerificationResult {
  if (input.serverState === "missing") return { accepted: true, reason: "ok" };
  if (input.serverState === "already_confirmed") return { accepted: false, reason: "duplicate" };
  return { accepted: false, reason: "conflict" };
}
