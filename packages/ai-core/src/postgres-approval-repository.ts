import type { PoolClient } from "pg";
export type ApprovalStatus="pending"|"approved"|"rejected"|"expired";
export interface ApprovalDecision { id:string; organizationId:string; reviewerUserId:string; status:"approved"|"rejected"; decidedAt:string; }

export class PostgresAiApprovalRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async decide(d:ApprovalDecision):Promise<boolean>{
    const r=await this.db.query(
      "UPDATE ai_approval_requests SET status=$4,reviewer_user_id=$3,decided_at=$5::timestamptz WHERE id=$1 AND organization_id=$2 AND status='pending' AND reviewer_user_id IS NULL RETURNING id",
      [d.id,d.organizationId,d.reviewerUserId,d.status,d.decidedAt]
    );
    return Number(r.rowCount??0)===1;
  }
}
