import { evaluateSecurityRequest, securityRequestDigest, type SecurityRequest } from "./../../../apps/security/security-controls.js";
import type { DurableSecurityStore, AuthorizedCommandClaimResult } from "./durable-security.js";

export type CommandGateResult =
  | { allowed: true; digest: string }
  | { allowed: false; reason: string; digest: string };

export class AuthoritativeCommandGate {
  constructor(private readonly store: DurableSecurityStore) {}

  async authorize(input: {
    request: SecurityRequest;
    now: string;
    jti: string;
    replayExpiresAt: string;
    approvalId?: string;
  }): Promise<CommandGateResult> {
    const digest = securityRequestDigest(input.request);
    const evaluation = evaluateSecurityRequest(input.request, input.now);
    if (evaluation.decision === "DENY") return { allowed: false, reason: evaluation.reason, digest };
    if (evaluation.decision === "REQUIRE_HUMAN_APPROVAL" && !input.approvalId) {
      return { allowed: false, reason: "HUMAN_APPROVAL_REQUIRED", digest };
    }
    const claim: AuthorizedCommandClaimResult = await this.store.claimAuthorizedCommand({
      tenantId: input.request.tenantId,
      jti: input.jti,
      requestDigest: digest,
      replayExpiresAt: input.replayExpiresAt,
      source: input.request.source,
      ...(input.approvalId === undefined ? {} : { approvalId: input.approvalId }),
      now: input.now
    });
    if (claim !== "CLAIMED") return { allowed: false, reason: claim, digest };
    return { allowed: true, digest };
  }
}
