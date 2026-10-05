import { createHash } from "node:crypto";
import type { NormalizedProviderStatus, VerifiedProviderEvent } from "./provider-contract.js";

export type ProviderCallbackFieldMap = Readonly<{
  eventId: string;
  paymentId: string;
  providerReference: string;
  status: string;
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
  correlationId: string;
  occurredAt: string;
}>;

export type ProviderCallbackSchema = Readonly<{
  providerId: string;
  version: string;
  fields: ProviderCallbackFieldMap;
  statusMap: Readonly<Record<string, NormalizedProviderStatus>>;
}>;

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function objectValue(input: Record<string, unknown>, path: string): unknown {
  const value = input[path];
  if (value === undefined || value === null) {
    throw new Error("PROVIDER_CALLBACK_FIELD_MISSING:" + path);
  }
  return value;
}

function stringField(input: Record<string, unknown>, path: string): string {
  const value = objectValue(input, path);
  if (typeof value !== "string" || !value.trim() || !IDENTIFIER.test(value)) {
    throw new Error("PROVIDER_CALLBACK_FIELD_INVALID:" + path);
  }
  return value;
}

function amountField(input: Record<string, unknown>, path: string): bigint {
  const value = objectValue(input, path);
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error("PROVIDER_CALLBACK_AMOUNT_INVALID");
}

function statusField(
  input: Record<string, unknown>,
  path: string,
  statusMap: Readonly<Record<string, NormalizedProviderStatus>>,
): NormalizedProviderStatus {
  const raw = stringField(input, path);
  const normalized = statusMap[raw.toLowerCase()];
  if (!normalized) throw new Error("PROVIDER_CALLBACK_STATUS_UNMAPPED:" + raw);
  return normalized;
}

function parseObject(rawBody: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("PROVIDER_CALLBACK_JSON_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PROVIDER_CALLBACK_OBJECT_REQUIRED");
  }
  return parsed as Record<string, unknown>;
}

/** Provider wire formats are contract-controlled; T.Pay never guesses production schemas. */
export function parseNormalizedProviderCallback(
  schema: ProviderCallbackSchema,
  rawBody: string,
  providerId = schema.providerId,
): VerifiedProviderEvent {
  if (schema.providerId !== providerId) {
    throw new Error("PROVIDER_CALLBACK_SCHEMA_PROVIDER_MISMATCH");
  }
  if (!schema.version.trim()) {
    throw new Error("PROVIDER_CALLBACK_SCHEMA_VERSION_REQUIRED");
  }

  const input = parseObject(rawBody);
  const f = schema.fields;
  const eventId = stringField(input, f.eventId);
  const paymentId = stringField(input, f.paymentId);
  const providerReference = stringField(input, f.providerReference);
  const idempotencyKey = stringField(input, f.idempotencyKey);
  const correlationId = stringField(input, f.correlationId);
  const currency = stringField(input, f.currency).toUpperCase();
  const occurredAt = stringField(input, f.occurredAt);

  if (!ISO_DATE.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    throw new Error("PROVIDER_CALLBACK_OCCURRED_AT_INVALID");
  }

  return {
    providerId,
    eventId,
    paymentId,
    providerReference,
    status: statusField(input, f.status, schema.statusMap),
    amountMinor: amountField(input, f.amountMinor),
    currency,
    idempotencyKey,
    correlationId,
    occurredAt,
  };
}

export function sha256Payload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

const fields = {
  eventId: "event_id",
  paymentId: "payment_id",
  providerReference: "provider_reference",
  status: "status",
  amountMinor: "amount_minor",
  currency: "currency",
  idempotencyKey: "idempotency_key",
  correlationId: "correlation_id",
  occurredAt: "occurred_at",
} as const;

const statusMap = {
  initiated: "initiated",
  pending: "pending",
  success: "confirmed",
  confirmed: "confirmed",
  failed: "failed",
  reversed: "reversed",
} as const;

export const TOGO_PROVIDER_CALLBACK_PROFILES: Readonly<
  Record<"tmoney" | "flooz" | "microfinance", ProviderCallbackSchema>
> = {
  tmoney: {
    providerId: "tmoney",
    version: "wire-contract-required",
    fields,
    statusMap,
  },
  flooz: {
    providerId: "flooz",
    version: "wire-contract-required",
    fields,
    statusMap,
  },
  microfinance: {
    providerId: "microfinance",
    version: "wire-contract-required",
    fields,
    statusMap,
  },
};