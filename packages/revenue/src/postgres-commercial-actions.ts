import type { CommercialActionRepository } from "./commercial-repository.js";

interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}
interface Client {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}

export class PostgresCommercialActionStore implements CommercialActionRepository {
  constructor(private readonly client: Client) {}

  async schedule(input: Parameters<CommercialActionRepository["schedule"]>[0]): Promise<boolean> {
    const result = await this.client.query(
      "INSERT INTO commercial_actions " +
      "(id,organization_id,campaign_id,lead_id,action,channel,state,idempotency_key,scheduled_at,created_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,'planned',$7,$8::timestamptz,$9::timestamptz) " +
      "ON CONFLICT (organization_id,idempotency_key) DO NOTHING",
      [input.id,input.organizationId,input.campaignId,input.leadId ?? null,input.action,input.channel,input.idempotencyKey,input.scheduledAt ?? null,input.createdAt]
    );
    return result.rowCount === 1;
  }

  async claimDue(organizationId: string, now: string, workerId: string) {
    await this.client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
    try {
      const result = await this.client.query<{
        id:string; action:string; channel:string; lead_id:string|null;
      }>(
        "WITH candidate AS (" +
        "SELECT id FROM commercial_actions " +
        "WHERE organization_id=$1 AND state='planned' " +
        "AND (scheduled_at IS NULL OR scheduled_at <= $2::timestamptz) " +
        "AND (next_attempt_at IS NULL OR next_attempt_at <= $2::timestamptz) " +
        "AND (claimed_at IS NULL OR claimed_at < $2::timestamptz) " +
        "ORDER BY scheduled_at NULLS FIRST, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1" +
        ") " +
        "UPDATE commercial_actions a SET claimed_by=$3,claimed_at=$2::timestamptz,attempts=a.attempts+1 " +
        "FROM candidate c WHERE a.id=c.id " +
        "RETURNING a.id,a.action,a.channel,a.lead_id",
        [organizationId,now,workerId]
      );
      await this.client.query("COMMIT");
      const row=result.rows[0];
      if(!row) return undefined;
      return {id:row.id,action:row.action,channel:row.channel, ...(row.lead_id ? {leadId:row.lead_id}:{})};
    } catch(error) {
      try { await this.client.query("ROLLBACK"); } catch {}
      throw error;
    }
  }

  async markCompleted(id: string, workerId: string, executedAt: string): Promise<void> {
    const result=await this.client.query(
      "UPDATE commercial_actions SET state='completed',executed_at=$3::timestamptz,claimed_by=NULL,claimed_at=NULL WHERE id=$1 AND claimed_by=$2 AND state='planned'",
      [id,workerId,executedAt]
    );
    if(result.rowCount!==1) throw new Error("COMMERCIAL_ACTION_COMPLETE_REJECTED");
  }

  async markBlocked(id: string, workerId: string, failureCode: string): Promise<void> {
    const result=await this.client.query(
      "UPDATE commercial_actions SET state='blocked',failure_code=$3,claimed_by=NULL,claimed_at=NULL WHERE id=$1 AND claimed_by=$2 AND state='planned'",
      [id,workerId,failureCode]
    );
    if(result.rowCount!==1) throw new Error("COMMERCIAL_ACTION_BLOCK_REJECTED");
  }
}
