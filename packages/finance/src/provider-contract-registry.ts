export type ProviderContractActivationState =
  | "DISCOVERY"
  | "CONTRACT_PENDING"
  | "CONTRACT_REGISTERED"
  | "SANDBOX_VALIDATED"
  | "PILOT"
  | "PRODUCTION";

export interface ProviderContractEvidence {
  readonly contractId: string;
  readonly version: string;
  readonly contentSha256: string;
  readonly sourceKind: "operator_signed" | "authorized_aggregator_signed";
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly evidenceRef: string;
}

export interface ProviderContractRecord {
  readonly providerId: string;
  readonly organizationId: string;
  readonly activationState: ProviderContractActivationState;
  readonly evidence: ProviderContractEvidence;
  readonly callbackSignatureScheme: "hmac_sha256" | "asymmetric" | "contract_defined";
  readonly callbackSchemaVersion: string;
  readonly allowedCurrencies: readonly string[];
  readonly maxClockSkewSeconds: number;
}

const ORDER: readonly ProviderContractActivationState[] = [
  "DISCOVERY", "CONTRACT_PENDING", "CONTRACT_REGISTERED", "SANDBOX_VALIDATED", "PILOT", "PRODUCTION"
];

export function assertProviderContractUsable(
  contract: ProviderContractRecord,
  now: string,
  requiredState: ProviderContractActivationState = "SANDBOX_VALIDATED"
): void {
  const nowMs = Date.parse(now);
  const effectiveMs = Date.parse(contract.evidence.effectiveAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(effectiveMs)) {
    throw new Error("PROVIDER_CONTRACT_DATE_INVALID");
  }
  if (!contract.providerId || !contract.organizationId) throw new Error("PROVIDER_CONTRACT_IDENTITY_REQUIRED");
  if (!contract.evidence.contractId || !contract.evidence.version || !contract.evidence.evidenceRef ||
      !/^[a-f0-9]{64}$/i.test(contract.evidence.contentSha256)) {
    throw new Error("PROVIDER_CONTRACT_EVIDENCE_INVALID");
  }
  if (!ORDER.includes(contract.activationState) || !ORDER.includes(requiredState)) {
    throw new Error("PROVIDER_CONTRACT_STATE_INVALID");
  }
  if (effectiveMs > nowMs) throw new Error("PROVIDER_CONTRACT_NOT_EFFECTIVE");
  if (contract.evidence.expiresAt) {
    const expiresMs = Date.parse(contract.evidence.expiresAt);
    if (!Number.isFinite(expiresMs)) throw new Error("PROVIDER_CONTRACT_EXPIRY_INVALID");
    if (expiresMs <= nowMs) throw new Error("PROVIDER_CONTRACT_EXPIRED");
  }
  if (ORDER.indexOf(contract.activationState) < ORDER.indexOf(requiredState)) {
    throw new Error("PROVIDER_CONTRACT_NOT_ACTIVATED");
  }
  if (!contract.callbackSchemaVersion || !contract.callbackSignatureScheme) {
    throw new Error("PROVIDER_CONTRACT_CALLBACK_SECURITY_MISSING");
  }
  if (!Number.isInteger(contract.maxClockSkewSeconds) || contract.maxClockSkewSeconds < 1 || contract.maxClockSkewSeconds > 3600) {
    throw new Error("PROVIDER_CONTRACT_CLOCK_SKEW_INVALID");
  }
  if (contract.allowedCurrencies.length === 0 || contract.allowedCurrencies.some(currency => !/^[A-Z]{3}$/.test(currency))) {
    throw new Error("PROVIDER_CONTRACT_CURRENCIES_MISSING");
  }
}

export class ProviderContractRegistry {
  private readonly records = new Map<string, ProviderContractRecord>();

  register(record: ProviderContractRecord): void {
    const key = record.organizationId + ":" + record.providerId;
    if (this.records.has(key)) throw new Error("PROVIDER_CONTRACT_ALREADY_REGISTERED");
    this.records.set(key, record);
  }

  resolve(organizationId: string, providerId: string): ProviderContractRecord {
    const record = this.records.get(organizationId + ":" + providerId);
    if (!record) throw new Error("PROVIDER_CONTRACT_NOT_FOUND");
    return record;
  }

  replace(record: ProviderContractRecord): void {
    const key = record.organizationId + ":" + record.providerId;
    if (!this.records.has(key)) throw new Error("PROVIDER_CONTRACT_NOT_FOUND");
    this.records.set(key, record);
  }
}
