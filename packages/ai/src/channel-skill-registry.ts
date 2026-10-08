export type ChannelSkillId =
  | "whatsapp" | "facebook" | "tiktok" | "sms" | "phone"
  | "publishing" | "marketing" | "sales" | "crm"
  | "customer_support" | "campaigns" | "analytics";

export type ChannelTransport = "https" | "wss" | "sip-tls" | "webrtc-dtls-srtp";
export type SkillRisk = "S0" | "S1" | "S2" | "S3" | "S4" | "S5";

export interface ChannelSkill {
  readonly id: ChannelSkillId;
  readonly version: string;
  readonly description: string;
  readonly channels: readonly ChannelSkillId[];
  readonly transports: readonly ChannelTransport[];
  readonly risk: SkillRisk;
  readonly capabilities: readonly string[];
  readonly requiredApprovals: readonly string[];
  readonly allowedAgents: readonly string[];
  readonly externalContentIsUntrusted: true;
  readonly authorizationBoundary: "capability-broker";
}

export interface SkillActivationContext {
  readonly organizationId: string;
  readonly agentId: string;
  readonly actorId?: string;
  readonly channel: ChannelSkillId;
  readonly requestedCapabilities: readonly string[];
}

const catalog: readonly ChannelSkill[] = [
  { id:"whatsapp", version:"1.0.0", description:"WhatsApp Business messaging, inbox, templates, campaigns and handoff.", channels:["whatsapp"], transports:["https"], risk:"S3", capabilities:["message.read","message.draft","message.send","media.send","template.use","conversation.assign","campaign.schedule"], requiredApprovals:["campaign.bulk_send","message.high_risk"], allowedAgents:["support","sales","marketing","administration","education","finance"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"facebook", version:"1.0.0", description:"Facebook Pages publishing, comments, inbox and campaign operations through approved APIs.", channels:["facebook"], transports:["https"], risk:"S3", capabilities:["page.read","post.draft","post.publish","comment.read","comment.reply","message.read","message.send"], requiredApprovals:["post.publish","campaign.bulk_send"], allowedAgents:["marketing","sales","support","administration"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"tiktok", version:"1.0.0", description:"TikTok content planning, publishing and engagement where the connected API grants the capability.", channels:["tiktok"], transports:["https"], risk:"S3", capabilities:["profile.read","post.draft","post.publish","analytics.read"], requiredApprovals:["post.publish"], allowedAgents:["marketing","sales","administration"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"sms", version:"1.0.0", description:"Transactional and campaign SMS with consent, rate, cost and opt-out controls.", channels:["sms"], transports:["https"], risk:"S3", capabilities:["message.draft","message.send","delivery.read","campaign.schedule","optout.enforce"], requiredApprovals:["campaign.bulk_send"], allowedAgents:["support","sales","marketing","finance","education","administration"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"phone", version:"1.0.0", description:"Secure telephony and voice operations; delegates execution to Voice Fabric.", channels:["phone"], transports:["https","sip-tls","webrtc-dtls-srtp"], risk:"S5", capabilities:["call.receive","call.transfer","appointment.manage","call.outbound","voice.assist"], requiredApprovals:["financial.action","privileged.action","credit.action"], allowedAgents:["support","sales","administration","education","finance","operations"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"publishing", version:"1.0.0", description:"Cross-channel content drafting, validation, scheduling, publication and provenance.", channels:["facebook","tiktok","whatsapp"], transports:["https"], risk:"S3", capabilities:["content.create","content.validate","content.schedule","content.publish","content.analytics"], requiredApprovals:["content.publish"], allowedAgents:["marketing","sales","administration","education"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"marketing", version:"1.0.0", description:"Segmentation, campaign planning, consent-aware journeys, A/B tests and measurement.", channels:["whatsapp","facebook","tiktok","sms"], transports:["https"], risk:"S3", capabilities:["segment.build","campaign.plan","campaign.schedule","experiment.run","analytics.read","optout.enforce"], requiredApprovals:["campaign.launch","campaign.bulk_send"], allowedAgents:["marketing","sales","administration"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"sales", version:"1.0.0", description:"Lead capture, qualification, pipeline, offers, follow-up and conversion analytics.", channels:["whatsapp","facebook","tiktok","sms","phone"], transports:["https","sip-tls","webrtc-dtls-srtp"], risk:"S3", capabilities:["lead.capture","lead.qualify","crm.read","crm.update","offer.draft","followup.schedule"], requiredApprovals:["offer.commit","discount.exception"], allowedAgents:["sales","marketing","support"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"crm", version:"1.0.0", description:"Unified customer/contact/lead/account context with strict tenant and purpose boundaries.", channels:["whatsapp","facebook","tiktok","sms","phone"], transports:["https"], risk:"S2", capabilities:["contact.read","contact.create","contact.update","lead.read","lead.update","timeline.read"], requiredApprovals:[], allowedAgents:["sales","marketing","support","administration","finance","education"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"customer_support", version:"1.0.0", description:"Omnichannel inbox triage, SLA, escalation, human handoff and customer resolution.", channels:["whatsapp","facebook","sms","phone"], transports:["https","sip-tls","webrtc-dtls-srtp"], risk:"S2", capabilities:["conversation.read","conversation.reply","ticket.create","ticket.update","handoff.request","sla.read"], requiredApprovals:["account.change","financial.action"], allowedAgents:["support","administration","sales","education","finance"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"campaigns", version:"1.0.0", description:"Consent-aware bulk communication with quotas, rate limits, suppression lists and delivery tracking.", channels:["whatsapp","facebook","tiktok","sms"], transports:["https"], risk:"S4", capabilities:["audience.read","campaign.draft","campaign.schedule","campaign.launch","delivery.read","optout.enforce"], requiredApprovals:["campaign.launch"], allowedAgents:["marketing","sales","administration"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
  { id:"analytics", version:"1.0.0", description:"Cross-channel performance, funnel, delivery, engagement, revenue attribution and anomaly signals.", channels:["whatsapp","facebook","tiktok","sms","phone"], transports:["https"], risk:"S1", capabilities:["metrics.read","funnel.read","campaign.analytics","anomaly.read"], requiredApprovals:[], allowedAgents:["analytics","marketing","sales","administration","finance","support"], externalContentIsUntrusted:true, authorizationBoundary:"capability-broker" },
];

export function listChannelSkills(): readonly ChannelSkill[] { return catalog; }

export function getChannelSkill(id: ChannelSkillId): ChannelSkill {
  const skill = catalog.find(item => item.id === id);
  if (!skill) throw new Error("TPAY_CHANNEL_SKILL_NOT_FOUND");
  return skill;
}

export function activateChannelSkill(context: SkillActivationContext): ChannelSkill {
  const skill = getChannelSkill(context.channel);
  if (!skill.allowedAgents.includes(context.agentId)) throw new Error("TPAY_CHANNEL_SKILL_AGENT_NOT_ALLOWED");
  const unsupported = context.requestedCapabilities.filter(capability => !skill.capabilities.includes(capability));
  if (unsupported.length > 0) throw new Error("TPAY_CHANNEL_SKILL_CAPABILITY_NOT_DECLARED");
  return skill;
}
