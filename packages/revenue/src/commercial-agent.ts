export type CommercialAction =
  | "publish_offer"
  | "discover_lead"
  | "qualify_lead"
  | "prepare_follow_up"
  | "request_quote"
  | "schedule_follow_up"
  | "pause_campaign";

export type CommercialChannel = "tpay" | "whatsapp" | "sms" | "email" | "social" | "marketplace";

export interface SellerOffer {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly priceMinor?: bigint;
  readonly currency: string;
  readonly serviceArea?: string;
  readonly stockQuantity?: number;
  readonly active: boolean;
}

export interface CommercialLead {
  readonly id: string;
  readonly organizationId: string;
  readonly source: CommercialChannel;
  readonly contactRef: string;
  readonly need: string;
  readonly score: number;
  readonly consent: "unknown" | "granted" | "revoked";
  readonly createdAt: string;
}

export interface CommercialPolicy {
  readonly allowedChannels: readonly CommercialChannel[];
  readonly maxOutboundPerDay: number;
  readonly requireConsentForDirectMessaging: boolean;
  readonly requireHumanApprovalForPriceOrContractChange: boolean;
  readonly blockedCategories: readonly string[];
}

export function scoreCommercialLead(input: {
  needMatch: number;
  localityMatch: number;
  purchasingSignal: number;
  trustSignal: number;
}): number {
  const values = [input.needMatch, input.localityMatch, input.purchasingSignal, input.trustSignal];
  if (values.some(v => !Number.isFinite(v) || v < 0 || v > 100)) throw new Error("COMMERCIAL_SIGNAL_INVALID");
  return Math.round(input.needMatch * 0.35 + input.localityMatch * 0.20 + input.purchasingSignal * 0.30 + input.trustSignal * 0.15);
}

export function authorizeCommercialAction(
  action: CommercialAction,
  channel: CommercialChannel,
  lead: CommercialLead | undefined,
  policy: CommercialPolicy
): void {
  if (!policy.allowedChannels.includes(channel)) throw new Error("COMMERCIAL_CHANNEL_NOT_ALLOWED");
  if (action !== "discover_lead" && action !== "publish_offer" && !lead) throw new Error("COMMERCIAL_LEAD_REQUIRED");
  if (lead?.consent === "revoked") throw new Error("COMMERCIAL_CONTACT_REVOKED");
  if (policy.requireConsentForDirectMessaging && ["whatsapp","sms","email"].includes(channel) && lead?.consent !== "granted") {
    throw new Error("COMMERCIAL_CONSENT_REQUIRED");
  }
}

export function enforceOutboundBudget(sentToday: number, policy: CommercialPolicy): void {
  if (!Number.isInteger(sentToday) || sentToday < 0 || sentToday >= policy.maxOutboundPerDay) {
    throw new Error("COMMERCIAL_OUTBOUND_BUDGET_EXCEEDED");
  }
}
