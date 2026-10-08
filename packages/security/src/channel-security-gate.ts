export type ChannelActionRisk = "low" | "medium" | "high" | "critical";

export interface ChannelSecurityRequest {
  readonly organizationId: string;
  readonly agentId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly capability: string;
  readonly targetId?: string;
  readonly risk: ChannelActionRisk;
  readonly externalContent: boolean;
  readonly idempotencyKey?: string;
  readonly approvalId?: string;
}

export interface ChannelSecurityDecision {
  readonly allowed: boolean;
  readonly requiresApproval: boolean;
  readonly requiresStepUp: boolean;
  readonly reasons: readonly string[];
}

const approvalRequired = new Set<ChannelActionRisk>(["high", "critical"]);
const stepUpRequired = new Set<ChannelActionRisk>(["critical"]);

export function evaluateChannelSecurity(request: ChannelSecurityRequest): ChannelSecurityDecision {
  const reasons: string[] = [];

  if (!request.organizationId || !request.agentId || !request.actorId || !request.sessionId) {
    return { allowed: false, requiresApproval: true, requiresStepUp: true, reasons: ["missing_security_context"] };
  }

  if (!request.capability || request.capability.includes("*")) {
    return { allowed: false, requiresApproval: true, requiresStepUp: true, reasons: ["invalid_capability"] };
  }

  if (request.externalContent) reasons.push("external_content_untrusted");

  const requiresApproval = approvalRequired.has(request.risk);
  const requiresStepUp = stepUpRequired.has(request.risk);

  if ((requiresApproval || requiresStepUp) && !request.idempotencyKey) {
    reasons.push("missing_idempotency_key");
    return { allowed: false, requiresApproval, requiresStepUp, reasons };
  }

  if (requiresApproval && !request.approvalId) reasons.push("approval_required");

  return {
    allowed: reasons.length === (request.externalContent ? 1 : 0),
    requiresApproval,
    requiresStepUp,
    reasons,
  };
}

export function assertChannelSecurity(request: ChannelSecurityRequest): void {
  const decision = evaluateChannelSecurity(request);
  if (!decision.allowed) throw new Error("TPAY_CHANNEL_SECURITY_DENIED");
}
