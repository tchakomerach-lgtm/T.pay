import type { UUID } from "../../domain/src/types.js";
import { calculateCommission, type CommissionRule } from "../../finance/src/commission.js";
import { money, type LedgerLine } from "../../finance/src/ledger.js";
import { assertProviderPaymentMatches, type PaymentProviderResult } from "../../finance/src/provider.js";
import { signWebhook, verifyWebhookSignature, type WebhookEnvelope } from "../../security/src/webhook.js";
import type { TontineContribution, CommunityTontineGroup, TontineFeeSnapshot } from "./community-tontine.js";

export type TontinePaymentIntentStatus = "initiated" | "pending" | "provider_confirmed" | "settled" | "failed" | "reversed";

export interface TontinePaymentIntent {
  id: UUID;
  organizationId: UUID;
  contributionId: UUID;
  idempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  provider: string;
  providerReference?: string;
  status: TontinePaymentIntentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TontineProviderEvent {
  provider: string;
  eventId: string;
  paymentId: UUID;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  status: "accepted" | "pending" | "rejected";
  occurredAt: string;
}

export interface TontineReceipt {
  receiptId: UUID;
  contributionId: UUID;
  paymentIntentId: UUID;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  issuedAt: string;
  ledgerTransactionId: string;
}

export interface TontineSettlementRepository {
  findContribution(id: UUID): Promise<TontineContribution | undefined>;
  findPaymentIntentByIdempotency(organizationId: UUID, key: string): Promise<TontinePaymentIntent | undefined>;
  insertPaymentIntent(intent: TontinePaymentIntent): Promise<void>;
  /**
   * Must execute as one database transaction:
   * provider-event claim + ledger append + fee snapshot + contribution/payment state + receipt/outbox.
   * A false result means another concurrent request already claimed this event.
   */
  settleAtomically(input: {
    providerEvent: TontineProviderEvent;
    paymentIntent: TontinePaymentIntent;
    feeSnapshot: TontineFeeSnapshot;
    ledgerTransaction: {
      id: string;
      organizationId: UUID;
      idempotencyKey: string;
      occurredAt: string;
      lines: readonly LedgerLine[];
      postedAt: string;
    };
    receipt: TontineReceipt;
  }): Promise<{ replay: boolean; receipt: TontineReceipt }>;
}

export interface TontineSettlementProvider {
  readonly name: string;
  initiate(input: {
    paymentIntent: TontinePaymentIntent;
    contribution: TontineContribution;
    group: CommunityTontineGroup;
  }): Promise<PaymentProviderResult>;
  verifyWebhook(envelope: WebhookEnvelope): TontineProviderEvent;
}

export interface TontineSettlementProviderRegistry {
  resolve(provider: string): TontineSettlementProvider;
}

export interface TontineLedgerFactory {
  createContributionTransaction(input: {
    contribution: TontineContribution;
    paymentIntent: TontinePaymentIntent;
    provider: TontineProviderEvent;
    feeSnapshot: TontineFeeSnapshot;
  }): {
    id: string;
    organizationId: UUID;
    idempotencyKey: string;
    occurredAt: string;
    lines: readonly LedgerLine[];
    postedAt: string;
  };
}

export interface TontineFeePolicy {
  microfinance: CommissionRule;
  tpay: CommissionRule;
  ruleVersion: string;
}

export function createTontinePaymentIntent(input: {
  id: UUID;
  organizationId: UUID;
  contribution: TontineContribution;
  provider: string;
  now: string;
}): TontinePaymentIntent {
  if (input.contribution.amountMinor <= 0n) throw new Error("TONTINE_PAYMENT_AMOUNT_INVALID");
  if (input.contribution.idempotencyKey.length < 16) throw new Error("INVALID_IDEMPOTENCY_KEY");
  return {
    id: input.id,
    organizationId: input.organizationId,
    contributionId: input.contribution.id,
    idempotencyKey: input.contribution.idempotencyKey,
    amountMinor: input.contribution.amountMinor,
    currency: input.contribution.currency,
    provider: input.provider,
    status: "initiated",
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function snapshotTontineFees(
  amountMinor: bigint,
  currency: string,
  policy: TontineFeePolicy,
  calculatedAt: string,
  contributionId: UUID
): TontineFeeSnapshot {
  const base = money(currency, amountMinor);
  const microfinanceFeeMinor = calculateCommission(base, policy.microfinance).minor;
  const tpayFeeMinor = calculateCommission(base, policy.tpay).minor;
  return {
    contributionId,
    microfinanceFeeMinor,
    tpayFeeMinor,
    totalFeeMinor: microfinanceFeeMinor + tpayFeeMinor,
    currency,
    ruleVersion: policy.ruleVersion,
    calculatedAt
  };
}

export function createSignedProviderWebhook(
  secret: string,
  provider: string,
  eventId: string,
  timestamp: number,
  payload: string
): WebhookEnvelope {
  return {
    provider,
    eventId,
    timestamp,
    signature: signWebhook(secret, timestamp, payload),
    payload
  };
}

export function verifySignedProviderWebhook(secret: string, envelope: WebhookEnvelope, now: number): void {
  verifyWebhookSignature(secret, envelope, 300, now);
}

export async function initiateTontineSettlement(
  input: {
    organizationId: UUID;
    contributionId: UUID;
    paymentIntentId: UUID;
    provider: string;
    now: string;
  },
  deps: {
    repository: TontineSettlementRepository;
    providers: TontineSettlementProviderRegistry;
  }
): Promise<TontinePaymentIntent> {
  const contribution = await deps.repository.findContribution(input.contributionId);
  if (!contribution) throw new Error("TONTINE_CONTRIBUTION_NOT_FOUND");

  const groupProvider = deps.providers.resolve(input.provider);
  const existing = await deps.repository.findPaymentIntentByIdempotency(input.organizationId, contribution.idempotencyKey);
  if (existing) return existing;

  const intent = createTontinePaymentIntent({
    id: input.paymentIntentId,
    organizationId: input.organizationId,
    contribution,
    provider: input.provider,
    now: input.now
  });

  await deps.repository.insertPaymentIntent(intent);
  const result = await groupProvider.initiate({ paymentIntent: intent, contribution, group: {
    id: contribution.groupId,
    name: "resolved-by-provider-context",
    countryCode: "TG",
    currency: contribution.currency,
    frequency: "daily",
    contributionMode: "variable",
    minimumAmountMinor: contribution.amountMinor,
    cycleNumber: 0,
    governance: "founder_managed",
    status: "active",
    createdBy: contribution.membershipId,
    createdAt: input.now
  } as CommunityTontineGroup });

  if (result.status === "rejected") throw new Error("PAYMENT_PROVIDER_REJECTED");

  return {
    ...intent,
    providerReference: result.providerReference,
    status: result.status === "accepted" ? "provider_confirmed" : "pending",
    updatedAt: input.now
  };
}

export async function settleVerifiedProviderEvent(
  input: {
    envelope: WebhookEnvelope;
    secret: string;
    nowEpochSeconds: number;
    paymentIntent: TontinePaymentIntent;
    contribution: TontineContribution;
    feePolicy: TontineFeePolicy;
    ledgerFactory: TontineLedgerFactory;
    receiptId: UUID;
    now: string;
  },
  deps: {
    provider: TontineSettlementProvider;
    repository: TontineSettlementRepository;
  }
): Promise<{ replay: boolean; receipt: TontineReceipt }> {
  verifySignedProviderWebhook(input.secret, input.envelope, input.nowEpochSeconds);
  const event = deps.provider.verifyWebhook(input.envelope);

  if (event.provider !== deps.provider.name) throw new Error("PROVIDER_IDENTITY_MISMATCH");
  if (event.paymentId !== input.paymentIntent.id) throw new Error("PAYMENT_INTENT_MISMATCH");
  if (event.providerReference !== input.paymentIntent.providerReference) throw new Error("PROVIDER_REFERENCE_MISMATCH");
  if (event.currency !== input.paymentIntent.currency || event.amountMinor !== input.paymentIntent.amountMinor) {
    throw new Error("PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH");
  }
  assertProviderPaymentMatches(
    {
      id: input.paymentIntent.id,
      organizationId: input.paymentIntent.organizationId,
      payerAccountId: "provider-clearing",
      payeeAccountId: "tontine-clearing",
      amount: money(input.paymentIntent.currency, input.paymentIntent.amountMinor),
      status: "pending",
      idempotencyKey: input.paymentIntent.idempotencyKey,
      createdAt: input.paymentIntent.createdAt
    },
    {
      provider: event.provider,
      providerReference: event.providerReference,
      status: event.status,
      rawStatus: event.status
    }
  );

  const feeSnapshot = snapshotTontineFees(
    input.contribution.amountMinor,
    input.contribution.currency,
    input.feePolicy,
    input.now,
    input.contribution.id
  );

  const ledgerTransaction = input.ledgerFactory.createContributionTransaction({
    contribution: input.contribution,
    paymentIntent: input.paymentIntent,
    provider: event,
    feeSnapshot
  });

  const receipt: TontineReceipt = {
    receiptId: input.receiptId,
    contributionId: input.contribution.id,
    paymentIntentId: input.paymentIntent.id,
    providerReference: event.providerReference,
    amountMinor: event.amountMinor,
    currency: event.currency,
    issuedAt: input.now,
    ledgerTransactionId: ledgerTransaction.id
  };

  return deps.repository.settleAtomically({
    providerEvent: event,
    paymentIntent: { ...input.paymentIntent, status: "provider_confirmed", updatedAt: input.now },
    feeSnapshot,
    ledgerTransaction,
    receipt
  });
}
