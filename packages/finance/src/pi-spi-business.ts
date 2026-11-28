/**
 * PI-SPI API-Business normalized port.
 * This is an internal T.Pay contract, NOT the BCEAO wire protocol.
 * Production transport requires the participant's homologated API-Business
 * specification, onboarding credentials and bilateral contract.
 */
export type PiSpiActivationState = "DISCOVERY" | "CONTRACT_PENDING" | "CONTRACT_REGISTERED" | "SANDBOX_VALIDATED" | "PILOT" | "PRODUCTION";
export interface PiSpiBusinessContractEvidence {
  readonly participantId: string;
  readonly contractVersion: string;
  readonly apiBusinessSpecSha256: string;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly activationState: PiSpiActivationState;
}
export interface PiSpiPaymentCommand {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly amountMinor: bigint;
  readonly currency: "XOF";
  readonly payerAlias?: string;
  readonly payeeAlias: string;
  readonly endToEndId: string;
  readonly remittanceInformation?: string;
}
export interface PiSpiPaymentRequestCommand {
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly amountMinor: bigint;
  readonly currency: "XOF";
  readonly payerAlias: string;
  readonly payeeAlias: string;
  readonly endToEndId: string;
}
export interface PiSpiPaymentResult {
  readonly participantId: string;
  readonly providerReference: string;
  readonly endToEndId: string;
  readonly status: "accepted" | "pending" | "confirmed" | "rejected" | "unknown";
  readonly observedAt: string;
}
export interface PiSpiReceiveAliasCommand {
  readonly organizationId: string;
  readonly customerReference: string;
  readonly idempotencyKey: string;
}
export interface PiSpiReceiveAlias {
  readonly participantId: string;
  readonly alias: string;
  readonly qrPayload?: string;
  readonly createdAt: string;
}
export interface PiSpiBusinessTransport {
  createReceiveAlias(command: PiSpiReceiveAliasCommand): Promise<PiSpiReceiveAlias>;
  sendPayment(command: PiSpiPaymentCommand): Promise<PiSpiPaymentResult>;
  requestPayment(command: PiSpiPaymentRequestCommand): Promise<PiSpiPaymentResult>;
  sendBulkPayments(commands: readonly PiSpiPaymentCommand[], batchIdempotencyKey: string): Promise<readonly PiSpiPaymentResult[]>;
  getPaymentStatus(endToEndId: string): Promise<PiSpiPaymentResult>;
}
const STATES: readonly PiSpiActivationState[] = ["DISCOVERY", "CONTRACT_PENDING", "CONTRACT_REGISTERED", "SANDBOX_VALIDATED", "PILOT", "PRODUCTION"];
const SHA256 = /^[a-f0-9]{64}$/i;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const PAYMENT_STATUSES = ["accepted", "pending", "confirmed", "rejected", "unknown"] as const;
export function assertPiSpiContractEvidence(evidence: PiSpiBusinessContractEvidence, requiredState: PiSpiActivationState, now: string): void {
  const nowMs = Date.parse(now);
  const effectiveMs = Date.parse(evidence.effectiveAt);
  if (!evidence.participantId || !evidence.contractVersion || !SHA256.test(evidence.apiBusinessSpecSha256)) throw new Error("PI_SPI_CONTRACT_EVIDENCE_INVALID");
  if (!STATES.includes(evidence.activationState) || !STATES.includes(requiredState)) throw new Error("PI_SPI_CONTRACT_STATE_INVALID");
  if (STATES.indexOf(evidence.activationState) < STATES.indexOf(requiredState)) throw new Error("PI_SPI_CONTRACT_NOT_ACTIVATED");
  if (!Number.isFinite(nowMs) || !Number.isFinite(effectiveMs) || effectiveMs > nowMs) throw new Error("PI_SPI_CONTRACT_NOT_EFFECTIVE");
  if (evidence.expiresAt) {
    const expiresMs = Date.parse(evidence.expiresAt);
    if (!Number.isFinite(expiresMs)) throw new Error("PI_SPI_CONTRACT_EXPIRY_INVALID");
    if (expiresMs <= nowMs) throw new Error("PI_SPI_CONTRACT_EXPIRED");
  }
}
function assertId(value: string, code: string): void {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(code);
}
function assertPayment(command: PiSpiPaymentCommand, organizationId: string): void {
  if (command.organizationId !== organizationId) throw new Error("PI_SPI_TENANT_MISMATCH");
  if (command.currency !== "XOF" || command.amountMinor <= 0n) throw new Error("PI_SPI_AMOUNT_OR_CURRENCY_INVALID");
  assertId(command.idempotencyKey, "PI_SPI_IDEMPOTENCY_KEY_INVALID");
  assertId(command.endToEndId, "PI_SPI_END_TO_END_ID_INVALID");
  assertId(command.payeeAlias, "PI_SPI_PAYEE_ALIAS_INVALID");
  if (command.payerAlias) assertId(command.payerAlias, "PI_SPI_PAYER_ALIAS_INVALID");
}
function assertPaymentResult(result: PiSpiPaymentResult, participantId: string, expectedEndToEndId: string): void {
  if (result.participantId !== participantId) throw new Error("PI_SPI_PARTICIPANT_MISMATCH");
  assertId(result.providerReference, "PI_SPI_PROVIDER_REFERENCE_INVALID");
  if (result.endToEndId !== expectedEndToEndId) throw new Error("PI_SPI_END_TO_END_MISMATCH");
  if (!(PAYMENT_STATUSES as readonly string[]).includes(result.status)) throw new Error("PI_SPI_STATUS_INVALID");
  if (!Number.isFinite(Date.parse(result.observedAt))) throw new Error("PI_SPI_OBSERVED_AT_INVALID");
}
/** External HTTP, mTLS, signatures, callback parsing and retries belong to a separately certified transport. */
export class PiSpiBusinessGateway {
  constructor(private readonly organizationId: string, private readonly evidence: PiSpiBusinessContractEvidence, private readonly transport: PiSpiBusinessTransport, private readonly now: () => string = () => new Date().toISOString()) {
    if (!organizationId) throw new Error("PI_SPI_ORGANIZATION_REQUIRED");
    assertPiSpiContractEvidence(evidence, "SANDBOX_VALIDATED", now());
  }
  async createReceiveAlias(command: PiSpiReceiveAliasCommand): Promise<PiSpiReceiveAlias> {
    if (command.organizationId !== this.organizationId) throw new Error("PI_SPI_TENANT_MISMATCH");
    assertId(command.customerReference, "PI_SPI_CUSTOMER_REFERENCE_INVALID");
    assertId(command.idempotencyKey, "PI_SPI_IDEMPOTENCY_KEY_INVALID");
    const result = await this.transport.createReceiveAlias(command);
    if (result.participantId !== this.evidence.participantId) throw new Error("PI_SPI_PARTICIPANT_MISMATCH");
    assertId(result.alias, "PI_SPI_ALIAS_INVALID");
    if (!Number.isFinite(Date.parse(result.createdAt))) throw new Error("PI_SPI_ALIAS_CREATED_AT_INVALID");
    return result;
  }
  async sendPayment(command: PiSpiPaymentCommand): Promise<PiSpiPaymentResult> {
    assertPayment(command, this.organizationId);
    const result = await this.transport.sendPayment(command);
    assertPaymentResult(result, this.evidence.participantId, command.endToEndId);
    return result;
  }
  async requestPayment(command: PiSpiPaymentRequestCommand): Promise<PiSpiPaymentResult> {
    if (command.organizationId !== this.organizationId) throw new Error("PI_SPI_TENANT_MISMATCH");
    if (command.currency !== "XOF" || command.amountMinor <= 0n) throw new Error("PI_SPI_AMOUNT_OR_CURRENCY_INVALID");
    assertId(command.idempotencyKey, "PI_SPI_IDEMPOTENCY_KEY_INVALID");
    assertId(command.endToEndId, "PI_SPI_END_TO_END_ID_INVALID");
    assertId(command.payerAlias, "PI_SPI_PAYER_ALIAS_INVALID");
    assertId(command.payeeAlias, "PI_SPI_PAYEE_ALIAS_INVALID");
    const result = await this.transport.requestPayment(command);
    assertPaymentResult(result, this.evidence.participantId, command.endToEndId);
    return result;
  }
  async sendBulkPayments(commands: readonly PiSpiPaymentCommand[], batchIdempotencyKey: string): Promise<readonly PiSpiPaymentResult[]> {
    if (commands.length === 0) throw new Error("PI_SPI_BATCH_EMPTY");
    assertId(batchIdempotencyKey, "PI_SPI_BATCH_IDEMPOTENCY_INVALID");
    for (const command of commands) assertPayment(command, this.organizationId);
    const results = await this.transport.sendBulkPayments(commands, batchIdempotencyKey);
    if (results.length !== commands.length) throw new Error("PI_SPI_BATCH_RESULT_COUNT_MISMATCH");
    results.forEach((result, index) => {
      const command = commands[index];
      if (!command) throw new Error("PI_SPI_BATCH_RESULT_INDEX_INVALID");
      assertPaymentResult(result, this.evidence.participantId, command.endToEndId);
    });
    return results;
  }
  async getPaymentStatus(endToEndId: string): Promise<PiSpiPaymentResult> {
    assertId(endToEndId, "PI_SPI_END_TO_END_ID_INVALID");
    const result = await this.transport.getPaymentStatus(endToEndId);
    assertPaymentResult(result, this.evidence.participantId, endToEndId);
    return result;
  }
  assertProductionEnabled(): void {
    assertPiSpiContractEvidence(this.evidence, "PRODUCTION", this.now());
  }
}
