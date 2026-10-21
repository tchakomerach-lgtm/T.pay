import { randomUUID } from "node:crypto";
import type { OpportunityQueryable } from "./postgres-repository.js";
import type { OpportunityCommand } from "./lifecycle.js";
import type { OpportunityApprovalVerifier } from "./command-boundary.js";

export interface ApprovedOpportunityDecision {
  readonly approvalId?: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly command: OpportunityCommand;
  readonly requesterId: string;
  readonly approverId: string;
  readonly reason: string;
  readonly evidenceRef?: string;
  readonly expiresAt: string;
}

/**
 * Persistence adapter for server-authorized approval decisions.
 * Call recordApproved only after authenticated authorization policy has
 * established that approverId may approve this action.
 */
export class PostgresOpportunityApprovalRepository implements OpportunityApprovalVerifier {
  public constructor(private readonly db: OpportunityQueryable) {}

  public async recordApproved(input: ApprovedOpportunityDecision): Promise<string> {
    if (!input.requesterId || !input.approverId || input.requesterId === input.approverId) {
      throw new Error("OPPORTUNITY_APPROVAL_SEPARATION_OF_DUTIES_REQUIRED");
    }
    if (!input.reason.trim() || input.reason.length > 4000) {
      throw new Error("OPPORTUNITY_APPROVAL_REASON_REQUIRED");
    }
    const expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new Error("OPPORTUNITY_APPROVAL_EXPIRY_INVALID");
    }
    const approvalId = input.approvalId ?? randomUUID();
    await this.db.query(
      "INSERT INTO opportunity_approvals (id,tenant_id,organization_id,opportunity_id,command,requester_id,approver_id,status,reason,evidence_ref,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',$8,$9,$10)",
      [approvalId, input.tenantId, input.organizationId, input.opportunityId, input.command, input.requesterId, input.approverId, input.reason.trim(), input.evidenceRef ?? null, expiresAt.toISOString()],
    );
    return approvalId;
  }

  /**
   * CONSUMED is allowed here only so an exact idempotent retry can reach the
   * lifecycle repository's duplicate lookup. New commands still must consume
   * an APPROVED row inside the lifecycle transaction.
   */
  public async verify(input: {
    approvalId: string;
    tenantId: string;
    organizationId: string;
    opportunityId: string;
    command: OpportunityCommand;
    requesterId: string;
  }): Promise<boolean> {
    const result = await this.db.query(
      "SELECT id FROM opportunity_approvals WHERE id=$1 AND tenant_id=$2 AND organization_id=$3 AND opportunity_id=$4 AND command=$5 AND requester_id=$6 AND approver_id<>$6 AND ((status='APPROVED' AND expires_at>now()) OR status='CONSUMED')",
      [input.approvalId, input.tenantId, input.organizationId, input.opportunityId, input.command, input.requesterId],
    );
    return result.rowCount === 1;
  }
}
