import test from "node:test";
import assert from "node:assert/strict";
import { ProviderContractRegistry, assertProviderContractUsable } from "../packages/finance/src/provider-contract-registry.js";
import { CommercialAgentService } from "../packages/revenue/src/commercial-agent-service.js";

const evidence = {
  contractId: "tmoney-togo-merchant",
  version: "2026.1",
  contentSha256: "a".repeat(64),
  sourceKind: "operator_signed" as const,
  effectiveAt: "2026-01-01T00:00:00.000Z",
  evidenceRef: "test://tmoney-contract"
};

test("L14.4 rejects provider activation without registered contract", () => {
  assert.throws(() => assertProviderContractUsable({
    providerId: "tmoney", organizationId: "org-1", activationState: "CONTRACT_REGISTERED",
    evidence, callbackSignatureScheme: "contract_defined", callbackSchemaVersion: "v1",
    allowedCurrencies: ["XOF"], maxClockSkewSeconds: 300
  }, "2026-10-05T00:00:00.000Z"), /PROVIDER_CONTRACT_NOT_ACTIVATED/);
});

test("L14.4 contract registry is tenant scoped", () => {
  const registry = new ProviderContractRegistry();
  const base = { providerId:"tmoney", activationState:"SANDBOX_VALIDATED" as const, evidence,
    callbackSignatureScheme:"contract_defined" as const, callbackSchemaVersion:"v1",
    allowedCurrencies:["XOF"], maxClockSkewSeconds:300 };
  registry.register({...base, organizationId:"a"});
  registry.register({...base, organizationId:"b"});
  assert.equal(registry.resolve("a","tmoney").organizationId, "a");
  assert.equal(registry.resolve("b","tmoney").organizationId, "b");
});

test("L14.4 commercial agent prioritizes strong local buying signals", () => {
  const agent = new CommercialAgentService({
    allowedChannels:["tpay","whatsapp"],
    maxOutboundPerDay:10,
    requireConsentForDirectMessaging:true,
    requireHumanApprovalForPriceOrContractChange:true,
    blockedCategories:[]
  });
  const result = agent.buildCampaign({
    offer:{id:"offer-1",organizationId:"org-1",ownerUserId:"u1",title:"Réparation téléphone",
      description:"Réparation rapide à Lomé",category:"repair",currency:"XOF",active:true},
    leads:[{
      id:"lead-1",organizationId:"org-1",source:"tpay",contactRef:"contact-1",
      need:"écran cassé",score:0,consent:"granted",createdAt:"2026-10-05T00:00:00.000Z",
      needMatch:95,localityMatch:90,purchasingSignal:85,trustSignal:80
    }],
    sentToday:0,now:"2026-10-05T00:00:00.000Z"
  });
  assert.equal(result.opportunities.length,1);
  assert.equal(result.opportunities[0]?.recommendedChannel,"whatsapp");
});

test("L14.4 commercial agent blocks unsolicited direct messaging", () => {
  const agent = new CommercialAgentService({
    allowedChannels:["whatsapp"],
    maxOutboundPerDay:10,
    requireConsentForDirectMessaging:true,
    requireHumanApprovalForPriceOrContractChange:true,
    blockedCategories:[]
  });
  assert.throws(() => agent.buildCampaign({
    offer:{id:"offer-1",organizationId:"org-1",ownerUserId:"u1",title:"Service",description:"Service",category:"service",currency:"XOF",active:true},
    leads:[{
      id:"lead-1",organizationId:"org-1",source:"tpay",contactRef:"contact-1",
      need:"service",score:0,consent:"unknown",createdAt:"2026-10-05T00:00:00.000Z",
      needMatch:95,localityMatch:90,purchasingSignal:85,trustSignal:80
    }],
    sentToday:0,now:"2026-10-05T00:00:00.000Z"
  }), /COMMERCIAL_CONSENT_REQUIRED/);
});
