import { createHash } from "node:crypto";
import {
  submitPaymentIntent,
  type PaymentIntent,
  type PaymentIntentRepository
} from "../../finance/src/payment-intent.js";

export type ProtectionPremiumPaymentState = "DUE" | "PAYMENT_PENDING" | "SETTLED" | "FAILED" | "WAIVED" | "REVERSED";

export interface ProtectionPremiumPaymentSnapshot {
  organizationId: string;
  groupId: string;
  premiumId: string;
  premiumMinor: bigint;
  currency: string;
  state: ProtectionPremiumPaymentState;
  paymentIntentReference?: string | null;
}

export interface ProtectionPremiumPaymentAccounts {
  payerAccountId: string;
  payeeAccountId: string;
}

export interface CommunityTontineProtectionPaymentDependencies {
  paymentIntents: PaymentIntentRepository;
  loadPremium(input: { organizationId: string; groupId: string; premiumId: string }): Promise<ProtectionPremiumPaymentSnapshot | undefined>;
  resolveAccounts(input: { organizationId: string; groupId: string; premiumId: string }): Promise<ProtectionPremiumPaymentAccounts>;
  markPaymentPending(input: {
    organizationId: string;
    groupId: string;
    premiumId: string;
    paymentIntentReference: string;
    actorId: string;
    now: string;
  }): Promise<void>;
}

export interface CreateProtectionPremiumPaymentIntentInput {
  organizationId: string;
  groupId: string;
  premiumId: string;
  actorId: string;
  idempotencyKey: string;
  now: string;
}

/**
 * Creates the canonical Financial Core Payment Intent for a CT-042 premium.
 * This orchestration never collects money and never writes to the Ledger.
 * A provider callback and Financial Core settlement remain separate steps.
 */
export async function createProtectionPremiumPaymentIntent(
  dependencies: CommunityTontineProtectionPaymentDependencies,
  input: CreateProtectionPremiumPaymentIntentInput
): Promise<{ intent: PaymentIntent; replayed: boolean }> {
  if (!input.organizationId || !input.groupId || !input.premiumId || !input.actorId) {
    throw new Error("TONTINE_PROTECTION_PAYMENT_CONTEXT_REQUIRED");
  }
  const premium = await dependencies.loadPremium({
    organizationId: input.organizationId,
    groupId: input.groupId,
    premiumId: input.premiumId
  });
  if (!premium) throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_FOUND");
  if (premium.organizationId !== input.organizationId || premium.groupId !== input.groupId || premium.premiumId !== input.premiumId) {
    throw new Error("TONTINE_PROTECTION_PREMIUM_SCOPE_MISMATCH");
  }
  if (premium.currency !== "XOF" || premium.premiumMinor <= 0n) {
    throw new Error("TONTINE_PROTECTION_PREMIUM_AMOUNT_INVALID");
  }
  if (premium.state === "SETTLED" || premium.state === "FAILED" || premium.state === "WAIVED" || premium.state === "REVERSED") {
    throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_PAYABLE");
  }

  const accounts = await dependencies.resolveAccounts({
    organizationId: input.organizationId,
    groupId: input.groupId,
    premiumId: input.premiumId
  });
  if (!accounts.payerAccountId || !accounts.payeeAccountId || accounts.payerAccountId === accounts.payeeAccountId) {
    throw new Error("TONTINE_PROTECTION_PAYMENT_ACCOUNTS_INVALID");
  }
  const payloadHash = createHash("sha256").update([
    input.organizationId,
    input.groupId,
    input.premiumId,
    premium.premiumMinor.toString(),
    premium.currency,
    accounts.payerAccountId,
    accounts.payeeAccountId
  ].join("|")).digest("hex");

  if (premium.state === "PAYMENT_PENDING" && premium.paymentIntentReference) {
    const existing = await dependencies.paymentIntents.findByIdempotency(input.organizationId, input.idempotencyKey);
    if (!existing || existing.id !== premium.paymentIntentReference || existing.payloadHash !== payloadHash) {
      throw new Error("TONTINE_PROTECTION_PAYMENT_INTENT_REPLAY_CONFLICT");
    }
    return { intent: existing, replayed: true };
  }

  const created = await submitPaymentIntent(dependencies.paymentIntents, {
    organizationId: input.organizationId,
    idempotencyKey: input.idempotencyKey,
    payloadHash,
    payerAccountId: accounts.payerAccountId,
    payeeAccountId: accounts.payeeAccountId,
    amountMinor: premium.premiumMinor,
    currency: premium.currency,
    requiresHumanApproval: true,
    now: input.now
  });

  if (premium.state === "DUE") {
    await dependencies.markPaymentPending({
      organizationId: input.organizationId,
      groupId: input.groupId,
      premiumId: input.premiumId,
      paymentIntentReference: created.intent.id,
      actorId: input.actorId,
      now: input.now
    });
  }
  return created;
}
