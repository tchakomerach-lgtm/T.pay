import type { UUID } from "../../domain/src/types.js";

export type CommunityDemandState = "draft" | "open" | "aggregating" | "quoted" | "ordered" | "fulfilled" | "cancelled";
export type CommunityBidState = "submitted" | "shortlisted" | "accepted" | "rejected" | "withdrawn";
export type DeliveryState = "planned" | "partial" | "delivered" | "quality_hold" | "disputed" | "returned";

export interface CommunityDemand {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly tontineGroupId: UUID;
  readonly createdBy: UUID;
  readonly state: CommunityDemandState;
  readonly currency: string;
  readonly deadline: string;
}

export interface CommunityDemandLine {
  readonly id: UUID;
  readonly demandId: UUID;
  readonly productRef: string;
  readonly quantity: bigint;
  readonly targetUnitPriceMinor?: bigint;
  readonly maxUnitPriceMinor?: bigint;
}

export interface CommunitySupplierBid {
  readonly id: UUID;
  readonly demandId: UUID;
  readonly supplierId: UUID;
  readonly state: CommunityBidState;
  readonly totalMinor: bigint;
  readonly currency: string;
  readonly validUntil: string;
  readonly qualityTerms: string;
}

export interface CommunityPurchaseOrder {
  readonly id: UUID;
  readonly demandId: UUID;
  readonly supplierId: UUID;
  readonly approvedBy: UUID;
  readonly totalMinor: bigint;
  readonly currency: string;
  readonly state: "approved" | "in_fulfillment" | "completed" | "cancelled";
}

export interface CommunityDeliveryMilestone {
  readonly id: UUID;
  readonly purchaseOrderId: UUID;
  readonly state: DeliveryState;
  readonly quantityDelivered: bigint;
  readonly proofHash?: string;
  readonly acceptedBy?: UUID;
}

export function chooseBestValueBid(bids: readonly CommunitySupplierBid[]): CommunitySupplierBid {
  const eligible = bids.filter(b => b.state === "submitted" || b.state === "shortlisted");
  if (!eligible.length) throw new Error("COMMUNITY_NO_ELIGIBLE_BID");
  return [...eligible].sort((a,b) => a.totalMinor < b.totalMinor ? -1 : a.totalMinor > b.totalMinor ? 1 : a.id.localeCompare(b.id))[0]!;
}

export function assertPurchaseApproval(totalMinor: bigint, approvedBy: UUID): void {
  if (totalMinor <= 0n) throw new Error("COMMUNITY_PURCHASE_AMOUNT_INVALID");
  if (!approvedBy) throw new Error("COMMUNITY_PURCHASE_APPROVER_REQUIRED");
}

export function assertDeliveryProgress(
  current: CommunityDeliveryMilestone,
  next: CommunityDeliveryMilestone
): void {
  if (next.quantityDelivered < current.quantityDelivered) throw new Error("COMMUNITY_DELIVERY_QUANTITY_REGRESSION");
  if (current.state === "delivered" && next.state !== "delivered") throw new Error("COMMUNITY_DELIVERY_TERMINAL_STATE");
}
