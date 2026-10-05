import { createHash } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import type { TontinePayoutContext } from "./tontine-payout.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

export interface VerifiedTontineProviderCallback {
  provider: string;
  providerEventId: string;
  payoutId: UUID;
  organizationId: UUID;
  providerReference: string;
  amountMinor: bigint;
  currency: string;
  receivedAt: string;
  rawBody: string;
}

export interface TontineCallbackVerifier {
  verifyAndNormalize(input: {
    provider: string;
    rawBody: string;
    signature: string;
    receivedAt: string;
  }): Promise<VerifiedTontineProviderCallback>;
}

export interface TontineFinancialSettlementBridge {
  settle(
    tx: unknown,
    payout: TontinePayoutContext,
    evidence: {
      payoutId: UUID;
      organizationId: UUID;
      provider: string;
      providerReference: string;
      amountMinor: bigint;
      currency: string;
    },
    accounts: {
      tontineClearingAccountId: string;
      microfinanceSettlementAccountId: string;
    },
    transactionId: string,
    now: string
  ): Promise<unknown>;
}

export interface TontineCallbackReceipt {
  state: "processed" | "replayed" | "rejected";
  providerEventId: string;
  payoutId: UUID;
}

export async function processVerifiedTontinePayoutCallback(
  db: TontineSqlExecutor,
  verifier: TontineCallbackVerifier,
  input: {
    provider: string;
    rawBody: string;
    signature: string;
    receivedAt: string;
  },
  payoutId: UUID,
  payout: TontinePayoutContext,
  accounts: {
    tontineClearingAccountId: string;
    microfinanceSettlementAccountId: string;
  },
  transactionId: string,
  settlementBridge: TontineFinancialSettlementBridge
): Promise<TontineCallbackReceipt> {
  const callback = await verifier.verifyAndNormalize(input);

  if (callback.organizationId !== payout.organizationId || callback.payoutId !== payoutId) {
    throw new Error("TONTINE_CALLBACK_BINDING_MISMATCH");
  }
  if (callback.currency !== payout.currency || callback.amountMinor !== payout.amountMinor) {
    throw new Error("TONTINE_CALLBACK_FINANCIAL_MISMATCH");
  }

  const payloadSha256 = createHash("sha256").update(callback.rawBody, "utf8").digest("hex");

  return db.transaction(async tx => {
    const existing = await tx.query<{
      provider_event_id: string;
      payout_id: UUID;
      state: "received" | "processed" | "rejected" | "replayed";
    }>(
      `SELECT provider_event_id,payout_id,state
       FROM tontine_provider_callback_receipts
       WHERE organization_id=$1 AND provider=$2 AND provider_event_id=$3
       FOR UPDATE`,
      [callback.organizationId, callback.provider, callback.providerEventId]
    );

    if (existing.rows[0]) {
      await tx.query(
        `UPDATE tontine_provider_callback_receipts
         SET state='replayed'
         WHERE organization_id=$1 AND provider=$2 AND provider_event_id=$3`,
        [callback.organizationId, callback.provider, callback.providerEventId]
      );
      return { state: "replayed", providerEventId: callback.providerEventId, payoutId: callback.payoutId };
    }

    await tx.query(
      `INSERT INTO tontine_provider_callback_receipts
       (id,organization_id,provider,provider_event_id,payload_sha256,signature_verified,
        received_at,state,payout_id,provider_reference,amount_minor,currency)
       VALUES ($1,$2,$3,$4,$5,true,$6,'received',$7,$8,$9,$10)`,
      [
        deterministicReceiptId(callback),
        callback.organizationId,
        callback.provider,
        callback.providerEventId,
        payloadSha256,
        callback.receivedAt,
        callback.payoutId,
        callback.providerReference,
        callback.amountMinor.toString(),
        callback.currency
      ]
    );

    const intent = await tx.query<{
      payout_id: UUID;
      organization_id: UUID;
      state: "initiated" | "approved" | "blocked" | "settled";
      idempotency_key: string;
    }>(
      `SELECT payout_id,organization_id,state,idempotency_key
       FROM payout_intents
       WHERE organization_id=$1 AND payout_id=$2
       FOR UPDATE`,
      [callback.organizationId, callback.payoutId]
    );
    const row = intent.rows[0];
    if (!row) throw new Error("TONTINE_PAYOUT_INTENT_NOT_FOUND");

    if (row.state === "settled") {
      await tx.query(
        `UPDATE tontine_provider_callback_receipts
         SET state='processed', processed_at=now()
         WHERE organization_id=$1 AND provider=$2 AND provider_event_id=$3`,
        [callback.organizationId, callback.provider, callback.providerEventId]
      );
      return { state: "processed", providerEventId: callback.providerEventId, payoutId: callback.payoutId };
    }

    await settlementBridge.settle(
      tx,
      payout,
      {
        payoutId: callback.payoutId,
        organizationId: callback.organizationId,
        provider: callback.provider,
        providerReference: callback.providerReference,
        amountMinor: callback.amountMinor,
        currency: callback.currency
      },
      accounts,
      transactionId,
      callback.receivedAt
    );

    await tx.query(
      `UPDATE tontine_provider_callback_receipts
       SET state='processed', processed_at=now()
       WHERE organization_id=$1 AND provider=$2 AND provider_event_id=$3`,
      [callback.organizationId, callback.provider, callback.providerEventId]
    );

    return { state: "processed", providerEventId: callback.providerEventId, payoutId: callback.payoutId };
  });
}

function deterministicReceiptId(callback: VerifiedTontineProviderCallback): UUID {
  const hex = createHash("sha256")
    .update([
      "tpay:tontine:callback-receipt:v1",
      callback.organizationId,
      callback.provider,
      callback.providerEventId,
      callback.payoutId,
      callback.rawBody
    ].join("|"), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}` as UUID;
}
