import type { UUID } from "../../domain/src/types.js";
import {
  assertRefundAmount,
  assertTontineCaseTransition,
  type TontineCase,
  type TontineCaseEvidence,
  type TontineCaseState,
  type TontineRefundRequest,
  type TontineTargetedHold
} from "./tontine-case.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

type Row = Record<string, unknown>;

function caseFromRow(row: Row): TontineCase {
  return {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    groupId: row.group_id as UUID,
    type: row.type as TontineCase["type"],
    state: row.state as TontineCaseState,
    ...(row.opened_by == null ? {} : { openedBy: row.opened_by as UUID }),
    ...(row.payout_id == null ? {} : { payoutId: row.payout_id as UUID }),
    ...(row.contribution_id == null ? {} : { contributionId: row.contribution_id as UUID }),
    severity: row.severity as TontineCase["severity"],
    summary: String(row.summary),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function evidenceFromRow(row: Row): TontineCaseEvidence {
  return {
    id: row.id as UUID,
    caseId: row.case_id as UUID,
    type: row.type as TontineCaseEvidence["type"],
    contentHash: String(row.content_hash),
    ...(row.object_reference == null ? {} : { objectReference: String(row.object_reference) }),
    ...(row.captured_by == null ? {} : { capturedBy: row.captured_by as UUID }),
    capturedAt: new Date(String(row.captured_at)).toISOString()
  };
}

function holdFromRow(row: Row): TontineTargetedHold {
  return {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    caseId: row.case_id as UUID,
    scope: row.scope as TontineTargetedHold["scope"],
    reference: String(row.reference),
    reason: String(row.reason),
    ...(row.expires_at == null ? {} : { expiresAt: new Date(String(row.expires_at)).toISOString() }),
    ...(row.released_at == null ? {} : { releasedAt: new Date(String(row.released_at)).toISOString() })
  };
}

function refundFromRow(row: Row): TontineRefundRequest {
  return {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    caseId: row.case_id as UUID,
    ...(row.original_contribution_id == null ? {} : { originalContributionId: row.original_contribution_id as UUID }),
    ...(row.original_payout_id == null ? {} : { originalPayoutId: row.original_payout_id as UUID }),
    amountMinor: BigInt(String(row.amount_minor)),
    currency: String(row.currency),
    reason: String(row.reason),
    state: row.state as TontineRefundRequest["state"],
    requiresHumanApproval: Boolean(row.requires_human_approval)
  };
}

const refundTransitions: Record<TontineRefundRequest["state"], readonly TontineRefundRequest["state"][]> = {
  requested: ["reviewing", "rejected"],
  reviewing: ["approved", "rejected"],
  approved: ["submitted_to_financial_core", "rejected"],
  rejected: [],
  submitted_to_financial_core: ["settled", "failed"],
  settled: [],
  failed: ["reviewing"]
};

export interface TontineCaseRepository {
  createCase(value: TontineCase): Promise<TontineCase>;
  getCase(organizationId: UUID, caseId: UUID): Promise<TontineCase | null>;
  transitionCase(organizationId: UUID, caseId: UUID, expected: TontineCaseState, next: TontineCaseState): Promise<TontineCase>;
  addEvidence(organizationId: UUID, evidence: TontineCaseEvidence): Promise<TontineCaseEvidence>;
  createHold(value: TontineTargetedHold): Promise<TontineTargetedHold>;
  releaseHold(organizationId: UUID, holdId: UUID, releasedAt: string): Promise<void>;
  createRefund(value: TontineRefundRequest): Promise<TontineRefundRequest>;
  transitionRefund(organizationId: UUID, refundId: UUID, expected: TontineRefundRequest["state"], next: TontineRefundRequest["state"]): Promise<TontineRefundRequest>;
}

/**
 * Durable case workflow. Every query is tenant-scoped; evidence stores hashes and
 * opaque object references only. Refund state never posts or reverses money:
 * Financial Core remains the only execution authority.
 */
export class PostgresTontineCaseRepository implements TontineCaseRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async createCase(value: TontineCase): Promise<TontineCase> {
    if (!value.openedBy) throw new Error("TONTINE_CASE_HUMAN_ACTOR_REQUIRED");
    if (!value.summary.trim() || value.summary.length > 2000) throw new Error("TONTINE_CASE_SUMMARY_INVALID");
    const result = await this.db.query<Row>(
      `INSERT INTO tontine_cases
       (id,organization_id,group_id,type,state,opened_by,payout_id,contribution_id,severity,summary,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       RETURNING *`,
      [value.id,value.organizationId,value.groupId,value.type,value.state,value.openedBy,
       value.payoutId ?? null,value.contributionId ?? null,value.severity,value.summary,value.createdAt]
    );
    if (!result.rows[0]) throw new Error("TONTINE_CASE_CREATE_FAILED");
    return caseFromRow(result.rows[0]);
  }

  async getCase(organizationId: UUID, caseId: UUID): Promise<TontineCase | null> {
    const result = await this.db.query<Row>(
      "SELECT * FROM tontine_cases WHERE organization_id=$1 AND id=$2",
      [organizationId,caseId]
    );
    return result.rows[0] ? caseFromRow(result.rows[0]) : null;
  }

  async transitionCase(
    organizationId: UUID, caseId: UUID, expected: TontineCaseState, next: TontineCaseState
  ): Promise<TontineCase> {
    assertTontineCaseTransition(expected,next);
    return this.db.transaction(async tx => {
      const result = await tx.query<Row>(
        `UPDATE tontine_cases SET state=$4,updated_at=now()
         WHERE organization_id=$1 AND id=$2 AND state=$3
         RETURNING *`,
        [organizationId,caseId,expected,next]
      );
      if (!result.rows[0]) throw new Error("TONTINE_CASE_STATE_CONFLICT_OR_NOT_FOUND");
      return caseFromRow(result.rows[0]);
    });
  }

  async addEvidence(organizationId: UUID, evidence: TontineCaseEvidence): Promise<TontineCaseEvidence> {
    if (!evidence.capturedBy) throw new Error("TONTINE_CASE_EVIDENCE_HUMAN_ACTOR_REQUIRED");
    if (!/^[a-f0-9]{64}$/i.test(evidence.contentHash)) throw new Error("TONTINE_CASE_EVIDENCE_HASH_INVALID");
    const result = await this.db.query<Row>(
      `INSERT INTO tontine_case_evidence
       (id,organization_id,case_id,type,content_hash,object_reference,captured_by,captured_at)
       SELECT $1,$2,c.id,$4,$5,$6,$7,$8
       FROM tontine_cases c WHERE c.organization_id=$2 AND c.id=$3
       RETURNING *`,
      [evidence.id,organizationId,evidence.caseId,evidence.type,evidence.contentHash,
       evidence.objectReference ?? null,evidence.capturedBy,evidence.capturedAt]
    );
    if (!result.rows[0]) throw new Error("TONTINE_CASE_NOT_FOUND_OR_TENANT_MISMATCH");
    return evidenceFromRow(result.rows[0]);
  }

  async createHold(value: TontineTargetedHold): Promise<TontineTargetedHold> {
    if (!value.reference.trim() || !value.reason.trim()) throw new Error("TONTINE_HOLD_INVALID");
    const result = await this.db.query<Row>(
      `INSERT INTO tontine_targeted_holds
       (id,organization_id,case_id,scope,reference,reason,expires_at,released_at)
       SELECT $1,$2,c.id,$4,$5,$6,$7,$8
       FROM tontine_cases c WHERE c.organization_id=$2 AND c.id=$3
       RETURNING *`,
      [value.id,value.organizationId,value.caseId,value.scope,value.reference,value.reason,
       value.expiresAt ?? null,value.releasedAt ?? null]
    );
    if (!result.rows[0]) throw new Error("TONTINE_CASE_NOT_FOUND_OR_TENANT_MISMATCH");
    return holdFromRow(result.rows[0]);
  }

  async releaseHold(organizationId: UUID, holdId: UUID, releasedAt: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE tontine_targeted_holds SET released_at=$3
       WHERE organization_id=$1 AND id=$2 AND released_at IS NULL`,
      [organizationId,holdId,releasedAt]
    );
    if ((result.rowCount ?? 0) !== 1) throw new Error("TONTINE_HOLD_NOT_ACTIVE_OR_NOT_FOUND");
  }

  async createRefund(value: TontineRefundRequest): Promise<TontineRefundRequest> {
    assertRefundAmount(value.amountMinor);
    if (Boolean(value.originalContributionId) === Boolean(value.originalPayoutId)) {
      throw new Error("TONTINE_REFUND_ORIGINAL_REFERENCE_REQUIRED");
    }
    if (!value.reason.trim()) throw new Error("TONTINE_REFUND_REASON_REQUIRED");
    const result = await this.db.query<Row>(
      `INSERT INTO tontine_refund_requests
       (id,organization_id,case_id,original_contribution_id,original_payout_id,amount_minor,currency,reason,state,requires_human_approval)
       SELECT $1,$2,c.id,$4,$5,$6,$7,$8,$9,$10
       FROM tontine_cases c WHERE c.organization_id=$2 AND c.id=$3
       RETURNING *`,
      [value.id,value.organizationId,value.caseId,value.originalContributionId ?? null,
       value.originalPayoutId ?? null,value.amountMinor.toString(),value.currency,value.reason,
       value.state,value.requiresHumanApproval]
    );
    if (!result.rows[0]) throw new Error("TONTINE_CASE_NOT_FOUND_OR_TENANT_MISMATCH");
    return refundFromRow(result.rows[0]);
  }

  async transitionRefund(
    organizationId: UUID, refundId: UUID, expected: TontineRefundRequest["state"], next: TontineRefundRequest["state"]
  ): Promise<TontineRefundRequest> {
    if (!refundTransitions[expected].includes(next)) throw new Error("TONTINE_REFUND_INVALID_TRANSITION");
    const result = await this.db.query<Row>(
      `UPDATE tontine_refund_requests SET state=$4,updated_at=now()
       WHERE organization_id=$1 AND id=$2 AND state=$3
       RETURNING *`,
      [organizationId,refundId,expected,next]
    );
    if (!result.rows[0]) throw new Error("TONTINE_REFUND_STATE_CONFLICT_OR_NOT_FOUND");
    return refundFromRow(result.rows[0]);
  }
}
