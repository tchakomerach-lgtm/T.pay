import { createHash, randomUUID } from "node:crypto";
import type { OpportunityQueryable, OpportunityTransaction } from "./postgres-repository.js";
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
    const tx = this.db as OpportunityTransaction;
    if (typeof tx.begin !== "function") throw new Error("OPPORTUNITY_TRANSACTION_REQUIRED");
    const approvalId = input.approvalId ?? randomUUID();
    await tx.begin();
    try {
      const inserted = await tx.query(
        "INSERT INTO opportunity_approvals (id,tenant_id,organization_id,opportunity_id,command,requester_id,approver_id,status,reason,evidence_ref,expires_at) SELECT $1,$2,$3,$4,$5,$6,$7,'APPROVED',$8,$9,$10 WHERE EXISTS (SELECT 1 FROM opportunities WHERE id=$4 AND tenant_id=$2 AND organization_id=$3) RETURNING id",
        [approvalId, input.tenantId, input.organizationId, input.opportunityId, input.command, input.requesterId, input.approverId, input.reason.trim(), input.evidenceRef ?? null, expiresAt.toISOString()],
      );
      if (inserted.rowCount !== 1) throw new Error("OPPORTUNITY_APPROVAL_TARGET_OUT_OF_SCOPE");
      const occurredAt = new Date().toISOString();
      const eventId = randomUUID();
      const details = { opportunityId: input.opportunityId, command: input.command, requesterId: input.requesterId, reason: input.reason.trim(), evidenceRef: input.evidenceRef ?? null };
      const eventHash = createHash("sha256").update(JSON.stringify({
        eventId, tenantId: input.tenantId, organizationId: input.organizationId,
        approvalId, action: "APPROVED", actorId: input.approverId, occurredAt, details,
      })).digest("hex");
      await tx.query(
        "INSERT INTO opportunity_approval_events (id,tenant_id,organization_id,approval_id,action,actor_id,occurred_at,details,event_hash) VALUES ($1,$2,$3,$4,'APPROVED',$5,$6,$7::jsonb,$8)",
        [eventId, input.tenantId, input.organizationId, approvalId, input.approverId, occurredAt, JSON.stringify(details), eventHash],
      );
      await tx.commit();
      return approvalId;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
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
