import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import type { TontineReceipt } from "../packages/microfinance/src/tontine-settlement.js";
import {
  assertTontineReceiptEvidence,
  createReceiptVerificationPayload,
  createTontineReceiptEvidence,
  deriveDeterministicReceiptId,
  parseReceiptVerificationPayload
} from "../packages/microfinance/src/tontine-receipt-evidence.js";

const receipt: TontineReceipt = {
  receiptId: "11111111-1111-4111-8111-111111111111" as UUID,
  contributionId: "22222222-2222-4222-8222-222222222222" as UUID,
  paymentIntentId: "33333333-3333-4333-8333-333333333333" as UUID,
  providerReference: "tm-1",
  amountMinor: 1000n,
  currency: "XOF",
  issuedAt: "2026-10-03T12:00:00Z",
  ledgerTransactionId: "44444444-4444-4444-8444-444444444444"
};

const secret = "receipt-evidence-secret-2026-minimum-32";

test("receipt evidence binds immutable financial and settlement context", () => {
  const evidence = createTontineReceiptEvidence(receipt, secret);
  assert.equal(evidence.receiptId, receipt.receiptId);
  assert.match(evidence.evidenceDigest, /^[a-f0-9]{64}$/);
  assert.match(evidence.evidenceMac, /^[a-f0-9]{64}$/);
  assert.doesNotThrow(() => assertTontineReceiptEvidence(receipt, evidence, secret));
});

test("receipt tampering invalidates the digest before verification can succeed", () => {
  const evidence = createTontineReceiptEvidence(receipt, secret);
  assert.throws(
    () => assertTontineReceiptEvidence({ ...receipt, amountMinor: 999n }, evidence, secret),
    /RECEIPT_EVIDENCE_DIGEST_MISMATCH/
  );
});

test("receipt evidence cannot be substituted across receipts", () => {
  const evidence = createTontineReceiptEvidence(receipt, secret);
  assert.throws(
    () => assertTontineReceiptEvidence({ ...receipt, receiptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID }, evidence, secret),
    /RECEIPT_EVIDENCE_RECEIPT_MISMATCH/
  );
});

test("wrong evidence secret fails closed with constant-time MAC comparison", () => {
  const evidence = createTontineReceiptEvidence(receipt, secret);
  assert.throws(
    () => assertTontineReceiptEvidence(receipt, evidence, "wrong-secret-2026-xxxxxxxxxxxxxxxx"),
    /RECEIPT_EVIDENCE_MAC_INVALID/
  );
});

test("deterministic receipt identity is stable for the same settlement binding", () => {
  const input = {
    organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as UUID,
    contributionId: receipt.contributionId,
    paymentIntentId: receipt.paymentIntentId,
    ledgerTransactionId: receipt.ledgerTransactionId
  };
  assert.equal(deriveDeterministicReceiptId(input), deriveDeterministicReceiptId(input));
});

test("verification payload is privacy-minimized and excludes payment amount/provider data", () => {
  const evidence = createTontineReceiptEvidence(receipt, secret);
  const payload = createReceiptVerificationPayload(evidence);
  const encoded = JSON.stringify(payload);
  assert.equal(encoded.includes("1000"), false);
  assert.equal(encoded.includes("tm-1"), false);
  assert.equal(encoded.includes("XOF"), false);
  assert.deepEqual(parseReceiptVerificationPayload(encoded), payload);
});

test("oversized or malformed QR payloads fail closed", () => {
  assert.throws(() => parseReceiptVerificationPayload("x".repeat(513)), /RECEIPT_QR_PAYLOAD_TOO_LARGE/);
  assert.throws(() => parseReceiptVerificationPayload("not-json"), /RECEIPT_QR_PAYLOAD_INVALID/);
});

test("short evidence secrets are rejected", () => {
  assert.throws(() => createTontineReceiptEvidence(receipt, "short"), /RECEIPT_EVIDENCE_SECRET_TOO_SHORT/);
});
