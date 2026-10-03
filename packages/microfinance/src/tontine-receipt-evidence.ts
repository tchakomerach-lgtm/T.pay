import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import type { TontineReceipt } from "./tontine-settlement.js";

export const TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION = 1 as const;

export interface TontineReceiptEvidence {
  readonly schemaVersion: typeof TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION;
  readonly receiptId: UUID;
  readonly evidenceDigest: string;
  readonly evidenceMac: string;
}

export interface ReceiptVerificationPayload {
  readonly schemaVersion: typeof TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION;
  readonly receiptId: UUID;
  readonly evidenceDigest: string;
}

/**
 * Canonical evidence contains only settlement identifiers and monetary facts.
 * It deliberately excludes names, phone numbers, KYC data, GPS coordinates,
 * account credentials and provider secrets.
 */
function canonicalReceiptEvidence(receipt: TontineReceipt): string {
  return JSON.stringify([
    TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION,
    receipt.receiptId,
    receipt.contributionId,
    receipt.paymentIntentId,
    receipt.providerReference,
    receipt.amountMinor.toString(),
    receipt.currency,
    receipt.issuedAt,
    receipt.ledgerTransactionId
  ]);
}

function assertSecret(secret: string): void {
  if (secret.length < 32) throw new Error("RECEIPT_EVIDENCE_SECRET_TOO_SHORT");
}

function assertHex64(value: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(code);
}

function macFor(canonical: string, secret: string): string {
  assertSecret(secret);
  return createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

export function deriveDeterministicReceiptId(input: {
  organizationId: UUID;
  contributionId: UUID;
  paymentIntentId: UUID;
  ledgerTransactionId: string;
}): UUID {
  const digest = createHash("sha256")
    .update(JSON.stringify([
      "tpay:tontine:receipt:v1",
      input.organizationId,
      input.contributionId,
      input.paymentIntentId,
      input.ledgerTransactionId
    ]), "utf8")
    .digest("hex");
  const uuid = digest.slice(0, 32).split("");
  uuid[12] = "5";
  uuid[16] = ["8", "9", "a", "b"][parseInt(uuid[16], 16) % 4];
  return `${uuid.slice(0, 8).join("")}-${uuid.slice(8, 12).join("")}-${uuid.slice(12, 16).join("")}-${uuid.slice(16, 20).join("")}-${uuid.slice(20).join("")}` as UUID;
}

export function createTontineReceiptEvidence(receipt: TontineReceipt, secret: string): TontineReceiptEvidence {
  const canonical = canonicalReceiptEvidence(receipt);
  return {
    schemaVersion: TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION,
    receiptId: receipt.receiptId,
    evidenceDigest: createHash("sha256").update(canonical, "utf8").digest("hex"),
    evidenceMac: macFor(canonical, secret)
  };
}

export function assertTontineReceiptEvidence(
  receipt: TontineReceipt,
  evidence: TontineReceiptEvidence,
  secret: string
): void {
  if (evidence.schemaVersion !== TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION) {
    throw new Error("RECEIPT_EVIDENCE_SCHEMA_UNSUPPORTED");
  }
  if (evidence.receiptId !== receipt.receiptId) throw new Error("RECEIPT_EVIDENCE_RECEIPT_MISMATCH");
  assertHex64(evidence.evidenceDigest, "RECEIPT_EVIDENCE_DIGEST_INVALID");
  assertHex64(evidence.evidenceMac, "RECEIPT_EVIDENCE_MAC_INVALID");

  const canonical = canonicalReceiptEvidence(receipt);
  const expectedDigest = createHash("sha256").update(canonical, "utf8").digest("hex");
  if (evidence.evidenceDigest !== expectedDigest) throw new Error("RECEIPT_EVIDENCE_DIGEST_MISMATCH");

  const expectedMac = Buffer.from(macFor(canonical, secret), "hex");
  const actualMac = Buffer.from(evidence.evidenceMac, "hex");
  if (expectedMac.length !== actualMac.length || !timingSafeEqual(expectedMac, actualMac)) {
    throw new Error("RECEIPT_EVIDENCE_MAC_INVALID");
  }
}

export function createReceiptVerificationPayload(evidence: TontineReceiptEvidence): ReceiptVerificationPayload {
  assertHex64(evidence.evidenceDigest, "RECEIPT_EVIDENCE_DIGEST_INVALID");
  return {
    schemaVersion: evidence.schemaVersion,
    receiptId: evidence.receiptId,
    evidenceDigest: evidence.evidenceDigest
  };
}

/**
 * QR/offline verification is evidence discovery only. The payload never grants
 * authentication, authorization or payment approval.
 */
export function parseReceiptVerificationPayload(payload: string): ReceiptVerificationPayload {
  if (payload.length > 512) throw new Error("RECEIPT_QR_PAYLOAD_TOO_LARGE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("RECEIPT_QR_PAYLOAD_INVALID");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("RECEIPT_QR_PAYLOAD_INVALID");
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION ||
      typeof value.receiptId !== "string" ||
      typeof value.evidenceDigest !== "string") {
    throw new Error("RECEIPT_QR_PAYLOAD_INVALID");
  }
  assertHex64(value.evidenceDigest, "RECEIPT_EVIDENCE_DIGEST_INVALID");
  return {
    schemaVersion: TONTINE_RECEIPT_EVIDENCE_SCHEMA_VERSION,
    receiptId: value.receiptId as UUID,
    evidenceDigest: value.evidenceDigest
  };
}
