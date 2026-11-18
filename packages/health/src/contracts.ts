import type { OrganizationType, UUID } from "../../domain/src/types.js";

export type HealthOrganizationType = Extract<OrganizationType, "pharmacy" | "hospital" | "clinic">;
export type HealthPortalRelationship = "customer" | "patient" | "representative";

export interface HealthConsentGrant {
  readonly id: UUID;
  readonly subjectId: UUID;
  readonly actorId: UUID;
  readonly organizationId: UUID;
  readonly purpose: string;
  readonly scopes: readonly string[];
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
}

export function assertHealthConsentActive(
  grant: HealthConsentGrant,
  input: { actorId: UUID; organizationId: UUID; purpose: string; scope: string; now: string }
): void {
  const now = Date.parse(input.now);
  const expiresAt = Date.parse(grant.expiresAt);
  const grantedAt = Date.parse(grant.grantedAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || !Number.isFinite(grantedAt)) {
    throw new Error("HEALTH_CONSENT_TIMESTAMP_INVALID");
  }
  if (grant.actorId !== input.actorId || grant.organizationId !== input.organizationId) {
    throw new Error("HEALTH_CONSENT_SCOPE_MISMATCH");
  }
  if (grant.purpose !== input.purpose || !grant.scopes.includes(input.scope)) {
    throw new Error("HEALTH_CONSENT_PURPOSE_MISMATCH");
  }
  if (grant.revokedAt || now < grantedAt || now >= expiresAt) {
    throw new Error("HEALTH_CONSENT_NOT_ACTIVE");
  }
}

export type DutyServiceKind = "pharmacy" | "emergency" | "maternity" | "pediatrics" | "laboratory" | "imaging" | "other";
export type DutySource = "competent_authority" | "verified_facility" | "facility_self_declared";
export type DutyVerification = "pending" | "verified" | "rejected";

export interface HealthDutyListing {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly organizationType: HealthOrganizationType;
  readonly serviceKind: DutyServiceKind;
  readonly source: DutySource;
  readonly verification: DutyVerification;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly lastConfirmedAt: string;
  readonly publishedAt?: string;
}

export type DutyPublicLabel = "officially_verified" | "facility_declared" | "not_publishable";

export function classifyDutyListing(listing: HealthDutyListing, now: string): DutyPublicLabel {
  const current = Date.parse(now);
  const start = Date.parse(listing.startsAt);
  const end = Date.parse(listing.endsAt);
  const confirmed = Date.parse(listing.lastConfirmedAt);
  if (![current, start, end, confirmed].every(Number.isFinite) || start >= end || current < start || current >= end) {
    return "not_publishable";
  }
  if (listing.verification !== "verified") return "not_publishable";
  if (listing.source === "competent_authority") return "officially_verified";
  if (listing.source === "verified_facility") return "facility_declared";
  return "not_publishable";
}

export type PharmacyOrderStatus =
  | "draft"
  | "submitted"
  | "review_pending"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "payment_pending"
  | "paid"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "collected"
  | "closed"
  | "cancelled"
  | "expired"
  | "refund_pending"
  | "refunded"
  | "disputed";

const ORDER_TRANSITIONS: Readonly<Record<PharmacyOrderStatus, readonly PharmacyOrderStatus[]>> = {
  draft: ["submitted", "cancelled"],
  submitted: ["review_pending", "cancelled", "expired"],
  review_pending: ["approved", "partially_approved", "rejected", "cancelled", "expired"],
  approved: ["payment_pending", "cancelled"],
  partially_approved: ["payment_pending", "cancelled"],
  rejected: [],
  payment_pending: ["paid", "cancelled", "expired"],
  paid: ["preparing", "refund_pending", "disputed"],
  preparing: ["ready", "refund_pending", "disputed"],
  ready: ["out_for_delivery", "collected", "refund_pending", "disputed"],
  out_for_delivery: ["delivered", "disputed"],
  delivered: ["closed", "disputed"],
  collected: ["closed", "disputed"],
  closed: [],
  cancelled: ["refund_pending"],
  expired: ["refund_pending"],
  refund_pending: ["refunded", "disputed"],
  refunded: [],
  disputed: ["refund_pending", "closed"]
};

export function transitionPharmacyOrder(
  current: PharmacyOrderStatus,
  next: PharmacyOrderStatus,
  evidence: { financialCorePaymentConfirmed?: boolean; deliveryProofVerified?: boolean }
): PharmacyOrderStatus {
  if (!ORDER_TRANSITIONS[current].includes(next)) throw new Error("PHARMACY_ORDER_TRANSITION_INVALID");
  if (next === "paid" && evidence.financialCorePaymentConfirmed !== true) {
    throw new Error("FINANCIAL_CORE_CONFIRMATION_REQUIRED");
  }
  if (next === "delivered" && evidence.deliveryProofVerified !== true) {
    throw new Error("DELIVERY_PROOF_REQUIRED");
  }
  return next;
}

export type HealthRevenueStream =
  | "saas_subscription"
  | "software_addon"
  | "support_and_training"
  | "api_usage"
  | "delivery_logistics"
  | "marketplace_platform_fee"
  | "telehealth_platform_fee"
  | "clinical_commission"
  | "patient_data_monetization"
  | "emergency_priority";

export interface HealthRevenueActivation {
  readonly stream: HealthRevenueStream;
  readonly jurisdiction: string;
  readonly contractRef: string;
  readonly legalApprovalRef?: string;
}

const NEVER_ALLOWED_HEALTH_REVENUE: readonly HealthRevenueStream[] = [
  "clinical_commission",
  "patient_data_monetization",
  "emergency_priority"
];

const LEGAL_REVIEW_REQUIRED_HEALTH_REVENUE: readonly HealthRevenueStream[] = [
  "marketplace_platform_fee",
  "telehealth_platform_fee"
];

/**
 * Commercial guardrail only. Actual pricing, invoicing and posting remain
 * governed by signed contracts, jurisdictional review and Financial Core.
 */
export function assertHealthRevenueActivation(input: HealthRevenueActivation): void {
  if (NEVER_ALLOWED_HEALTH_REVENUE.includes(input.stream)) {
    throw new Error("HEALTH_REVENUE_STREAM_PROHIBITED");
  }
  if (!input.jurisdiction.trim() || !input.contractRef.trim()) {
    throw new Error("HEALTH_REVENUE_CONTRACT_REQUIRED");
  }
  if (LEGAL_REVIEW_REQUIRED_HEALTH_REVENUE.includes(input.stream)
    && !input.legalApprovalRef?.trim()) {
    throw new Error("HEALTH_REVENUE_LEGAL_APPROVAL_REQUIRED");
  }
}
