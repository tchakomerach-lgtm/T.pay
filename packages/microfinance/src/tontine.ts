export type TontineCollectionStatus = "scheduled" | "collected" | "missed" | "reversed";

export interface TontineMember {
  id: string;
  groupId: string;
  clientId: string;
  dailyMinimumMinor: bigint;
  currency: string;
  status: "active" | "suspended" | "exited";
}

export interface TontineCollection {
  id: string;
  memberId: string;
  agentId: string;
  scheduledFor: string;
  amountMinor: bigint;
  currency: string;
  status: TontineCollectionStatus;
  idempotencyKey: string;
  location?: { latitude: number; longitude: number; accuracyMeters?: number };
}

export function validateCollection(c: TontineCollection, member: TontineMember): void {
  if (c.amountMinor < member.dailyMinimumMinor) throw new Error("TONTINE_BELOW_MINIMUM");
  if (c.amountMinor <= 0n) throw new Error("TONTINE_AMOUNT_INVALID");
  if (c.currency !== member.currency) throw new Error("TONTINE_CURRENCY_MISMATCH");
  if (c.memberId !== member.id) throw new Error("TONTINE_MEMBER_MISMATCH");
  if (c.status === "collected" && !c.idempotencyKey) throw new Error("TONTINE_IDEMPOTENCY_REQUIRED");
}

export function assertCollectionLocation(c: TontineCollection): void {
  if (c.location === undefined) throw new Error("TONTINE_LOCATION_REQUIRED");
  if (!Number.isFinite(c.location.latitude) || !Number.isFinite(c.location.longitude)) {
    throw new Error("TONTINE_LOCATION_INVALID");
  }
}
