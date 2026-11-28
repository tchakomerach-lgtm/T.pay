import test from "node:test";
import assert from "node:assert/strict";
import { assertProviderContractUsable, type ProviderContractRecord } from "../packages/finance/src/provider-contract-registry.js";

const validContract: ProviderContractRecord = {
  providerId: "paygate-global",
  organizationId: "org-1",
  activationState: "SANDBOX_VALIDATED",
  evidence: {
    contractId: "contract-001",
    version: "merchant-api-v1",
    contentSha256: "a".repeat(64),
    sourceKind: "authorized_aggregator_signed",
    effectiveAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    evidenceRef: "vault://contracts/paygate-global/contract-001"
  },
  callbackSignatureScheme: "contract_defined",
  callbackSchemaVersion: "v1",
  allowedCurrencies: ["XOF"],
  maxClockSkewSeconds: 300
};

test("provider contract is usable only inside its effective validity window", () => {
  assert.doesNotThrow(() => assertProviderContractUsable(validContract, "2026-11-28T00:00:00.000Z"));
  assert.throws(() => assertProviderContractUsable({ ...validContract, evidence: { ...validContract.evidence, effectiveAt: "2027-01-01T00:00:00.000Z" } }, "2026-11-28T00:00:00.000Z"), /PROVIDER_CONTRACT_NOT_EFFECTIVE/);
  assert.throws(() => assertProviderContractUsable({ ...validContract, evidence: { ...validContract.evidence, expiresAt: "not-a-date" } }, "2026-11-28T00:00:00.000Z"), /PROVIDER_CONTRACT_EXPIRY_INVALID/);
  assert.throws(() => assertProviderContractUsable({ ...validContract, evidence: { ...validContract.evidence, expiresAt: "2026-01-02T00:00:00.000Z" } }, "2026-11-28T00:00:00.000Z"), /PROVIDER_CONTRACT_EXPIRED/);
});

test("provider contract rejects malformed evidence, invalid state and currency", () => {
  assert.throws(() => assertProviderContractUsable({ ...validContract, evidence: { ...validContract.evidence, evidenceRef: "" } }, "2026-11-28T00:00:00.000Z"), /PROVIDER_CONTRACT_EVIDENCE_INVALID/);
  assert.throws(() => assertProviderContractUsable({ ...validContract, activationState: "DISCOVERY" }, "2026-11-28T00:00:00.000Z"), /PROVIDER_CONTRACT_NOT_ACTIVATED/);
  assert.throws(() => assertProviderContractUsable({ ...validContract, allowedCurrencies: ["XOF", "not-currency"] }, "2026-11-28T00:00:00.000Z"), /PROVIDER_CONTRACT_CURRENCIES_MISSING/);
  assert.throws(() => assertProviderContractUsable(validContract, "invalid-date"), /PROVIDER_CONTRACT_DATE_INVALID/);
});
