import { authorizeCommercialAction, enforceOutboundBudget, scoreCommercialLead, type CommercialAction, type CommercialChannel, type CommercialLead, type CommercialPolicy, type SellerOffer } from "./commercial-agent.js";

export interface CommercialOpportunity {
  readonly lead: CommercialLead;
  readonly offerId: string;
  readonly rationale: readonly string[];
  readonly recommendedChannel: CommercialChannel;
  readonly nextAction: CommercialAction;
}

export interface CommercialCampaign {
  readonly offer: SellerOffer;
  readonly opportunities: readonly CommercialOpportunity[];
  readonly generatedAt: string;
}

export class CommercialAgentService {
  constructor(private readonly policy: CommercialPolicy) {}

  buildCampaign(input: {
    offer: SellerOffer;
    leads: ReadonlyArray<CommercialLead & {
      needMatch: number;
      localityMatch: number;
      purchasingSignal: number;
      trustSignal: number;
    }>;
    sentToday: number;
    now: string;
  }): CommercialCampaign {
    if (!input.offer.active) throw new Error("COMMERCIAL_OFFER_INACTIVE");
    if (this.policy.blockedCategories.includes(input.offer.category)) throw new Error("COMMERCIAL_CATEGORY_BLOCKED");
    enforceOutboundBudget(input.sentToday, this.policy);

    const opportunities = input.leads
      .map(lead => ({
        lead: {
          ...lead,
          score: scoreCommercialLead(lead)
        },
        offerId: input.offer.id,
        rationale: [
          lead.needMatch >= 70 ? "fort besoin correspondant" : "correspondance à améliorer",
          lead.localityMatch >= 70 ? "proximité géographique" : "zone moins prioritaire",
          lead.purchasingSignal >= 70 ? "signal d'achat élevé" : "signal d'achat modéré"
        ],
        recommendedChannel: this.chooseChannel(lead.consent),
        nextAction: "prepare_follow_up" as CommercialAction
      }))
      .filter(opportunity => opportunity.lead.score >= 60)
      .sort((a,b) => b.lead.score - a.lead.score);

    for (const opportunity of opportunities) {
      authorizeCommercialAction(
        opportunity.nextAction,
        opportunity.recommendedChannel,
        opportunity.lead,
        this.policy
      );
    }

    return { offer: input.offer, opportunities, generatedAt: input.now };
  }

  private chooseChannel(consent: CommercialLead["consent"]): CommercialChannel {
    if (consent === "granted" && this.policy.allowedChannels.includes("whatsapp")) return "whatsapp";
    if (this.policy.allowedChannels.includes("tpay")) return "tpay";
    return this.policy.allowedChannels[0] ?? "tpay";
  }
}
