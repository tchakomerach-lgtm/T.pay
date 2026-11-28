import test from "node:test";
import assert from "node:assert/strict";
import { PiSpiBusinessGateway, assertPiSpiContractEvidence, type PiSpiBusinessContractEvidence, type PiSpiBusinessTransport, type PiSpiPaymentCommand } from "../packages/finance/src/pi-spi-business.js";
const evidence: PiSpiBusinessContractEvidence = { participantId: "participant-tg", contractVersion: "sandbox-v1", apiBusinessSpecSha256: "a".repeat(64), effectiveAt: "2026-01-01T00:00:00.000Z", activationState: "SANDBOX_VALIDATED" };
const payment: PiSpiPaymentCommand = { organizationId: "org-1", idempotencyKey: "idem-0001", amountMinor: 5000n, currency: "XOF", payerAlias: "payer.alias", payeeAlias: "payee.alias", endToEndId: "tpay-0001" };
function transport(): PiSpiBusinessTransport {
  return {
    createReceiveAlias: async () => ({ participantId: "participant-tg", alias: "alias-1", createdAt: "2026-11-28T00:00:00Z" }),
    sendPayment: async (command) => ({ participantId: "participant-tg", providerReference: "ref-1", endToEndId: command.endToEndId, status: "pending", observedAt: "2026-11-28T00:00:00Z" }),
    requestPayment: async (command) => ({ participantId: "participant-tg", providerReference: "ref-2", endToEndId: command.endToEndId, status: "accepted", observedAt: "2026-11-28T00:00:00Z" }),
    sendBulkPayments: async (commands) => commands.map((command) => ({ participantId: "participant-tg", providerReference: "ref-bulk", endToEndId: command.endToEndId, status: "pending" as const, observedAt: "2026-11-28T00:00:00Z" })),
    getPaymentStatus: async (endToEndId) => ({ participantId: "participant-tg", providerReference: "ref-1", endToEndId, status: "unknown", observedAt: "2026-11-28T00:00:00Z" }),
  };
}
test("PI-SPI contract evidence is versioned, effective and activation-gated", () => {
  assert.doesNotThrow(() => assertPiSpiContractEvidence(evidence, "SANDBOX_VALIDATED", "2026-11-28T00:00:00Z"));
  assert.throws(() => assertPiSpiContractEvidence(evidence, "PRODUCTION", "2026-11-28T00:00:00Z"), /PI_SPI_CONTRACT_NOT_ACTIVATED/);
});
test("PI-SPI gateway enforces tenant, positive XOF and stable identifiers", async () => {
  const gateway = new PiSpiBusinessGateway("org-1", evidence, transport());
  assert.equal((await gateway.sendPayment(payment)).status, "pending");
  await assert.rejects(() => gateway.sendPayment({ ...payment, organizationId: "org-2" }), /PI_SPI_TENANT_MISMATCH/);
  await assert.rejects(() => gateway.sendPayment({ ...payment, amountMinor: 0n }), /PI_SPI_AMOUNT_OR_CURRENCY_INVALID/);
  await assert.rejects(() => gateway.sendPayment({ ...payment, currency: "EUR" as "XOF" }), /PI_SPI_AMOUNT_OR_CURRENCY_INVALID/);
});
test("PI-SPI production remains blocked until production evidence is installed", () => {
  const gateway = new PiSpiBusinessGateway("org-1", evidence, transport());
  assert.throws(() => gateway.assertProductionEnabled(), /PI_SPI_CONTRACT_NOT_ACTIVATED/);
});
test("PI-SPI batch refuses empty batches and delegates validated batch idempotency", async () => {
  const gateway = new PiSpiBusinessGateway("org-1", evidence, transport());
  await assert.rejects(() => gateway.sendBulkPayments([], "batch-001"), /PI_SPI_BATCH_EMPTY/);
  assert.equal((await gateway.sendBulkPayments([payment], "batch-001")).length, 1);
});
