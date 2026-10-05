import type { CommercialLead, SellerOffer } from "./commercial-agent.js";

export interface CommercialOfferRepository {
  insert(offer: SellerOffer & { createdAt: string; updatedAt: string }): Promise<void>;
  findActive(organizationId: string, offerId: string): Promise<SellerOffer | undefined>;
}

export interface CommercialLeadRepository {
  upsert(lead: CommercialLead): Promise<void>;
  listPrioritized(organizationId: string, limit: number): Promise<readonly CommercialLead[]>;
}

export interface CommercialActionRepository {
  schedule(input: {
    id: string;
    organizationId: string;
    campaignId: string;
    leadId?: string;
    action: string;
    channel: string;
    idempotencyKey: string;
    scheduledAt?: string;
    createdAt: string;
  }): Promise<boolean>;
  claimDue(organizationId: string, now: string, workerId: string): Promise<{ id: string; action: string; channel: string; leadId?: string } | undefined>;
  markCompleted(id: string, workerId: string, executedAt: string): Promise<void>;
  markBlocked(id: string, workerId: string, failureCode: string): Promise<void>;
}
