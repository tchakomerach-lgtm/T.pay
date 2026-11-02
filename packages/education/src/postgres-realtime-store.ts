import type { PostgresTransactionClient } from "./postgres-sync-fabric.js";
import { createHash } from "node:crypto";
import type { SchoolRealtimeEvent } from "./school-realtime.js";

export type DurableRealtimeReplay =
  | { state: "OK"; events: SchoolRealtimeEvent[]; oldestSequence: bigint | null; latestSequence: bigint | null }
  | { state: "CURSOR_EXPIRED"; events: []; oldestSequence: bigint | null; latestSequence: bigint | null };

export class PostgresSchoolRealtimeStore {
  constructor(private readonly client: PostgresTransactionClient) {}

  async append(event: SchoolRealtimeEvent): Promise<bigint> {
    const payload = JSON.stringify(event.data);
    const payloadHash = createHash("sha256").update(payload, "utf8").digest("hex");
    await this.client.query("BEGIN");
    try {
      const existing = await this.client.query<{stream_sequence:string}>(
        `SELECT stream_sequence::text FROM education_realtime_events
          WHERE tenant_id=$1 AND organization_id=$2 AND id=$3 FOR UPDATE`,
        [event.tenantId,event.organizationId,event.id]
      );
      if(existing.rows[0]){await this.client.query("COMMIT");return BigInt(existing.rows[0].stream_sequence);}
      await this.client.query(
        `INSERT INTO education_realtime_stream_cursors(tenant_id,organization_id,last_sequence)
         VALUES($1,$2,0) ON CONFLICT(tenant_id,organization_id) DO NOTHING`,
        [event.tenantId,event.organizationId]
      );
      const cursor=await this.client.query<{last_sequence:string}>(
        `SELECT last_sequence::text FROM education_realtime_stream_cursors
          WHERE tenant_id=$1 AND organization_id=$2 FOR UPDATE`,
        [event.tenantId,event.organizationId]
      );
      const next=BigInt(cursor.rows[0]!.last_sequence)+1n;
      const inserted=await this.client.query<{stream_sequence:string}>(
        `INSERT INTO education_realtime_events
         (id,tenant_id,organization_id,stream_sequence,event_type,occurred_at,entity_id,version,data,payload_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
         RETURNING stream_sequence::text`,
        [event.id,event.tenantId,event.organizationId,next.toString(),event.type,event.occurredAt,event.entityId,event.version,payload,payloadHash]
      );
      await this.client.query(
        `UPDATE education_realtime_stream_cursors SET last_sequence=$3,updated_at=now()
          WHERE tenant_id=$1 AND organization_id=$2`,
        [event.tenantId,event.organizationId,next.toString()]
      );
      await this.client.query("COMMIT");
      if(!inserted.rows[0])throw new Error("REALTIME_EVENT_PERSIST_FAILED");
      return BigInt(inserted.rows[0].stream_sequence);
    }catch(error){await this.client.query("ROLLBACK");throw error;}
  }


  async getById(tenantId:string,organizationId:string,eventId:string):Promise<SchoolRealtimeEvent|null>{
    if(!tenantId||!organizationId||!eventId)throw new Error("REALTIME_EVENT_SCOPE_REQUIRED");
    const result=await this.client.query<{
      id:string;stream_sequence:string;event_type:SchoolRealtimeEvent["type"];
      occurred_at:string;entity_id:string;version:string;data:Record<string,unknown>;
    }>(
      `SELECT id,stream_sequence::text,event_type,occurred_at,entity_id,version::text,data
         FROM education_realtime_events
        WHERE tenant_id=$1 AND organization_id=$2 AND id=$3
        LIMIT 1`,
      [tenantId,organizationId,eventId]
    );
    const row=result.rows[0];
    if(!row)return null;
    return {id:row.id,tenantId,organizationId,type:row.event_type,
      occurredAt:new Date(row.occurred_at).toISOString(),streamSequence:row.stream_sequence,
      entityId:row.entity_id,version:Number(row.version),data:row.data};
  }

  async replay(
    tenantId:string,
    organizationId:string,
    afterSequence:bigint,
    limit=100
  ):Promise<DurableRealtimeReplay>{
    if(!tenantId||!organizationId)throw new Error("REALTIME_SCOPE_REQUIRED");
    if(afterSequence<0n)throw new Error("REALTIME_INVALID_CURSOR");
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error("REALTIME_INVALID_LIMIT");
    await this.client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try{
      const bounds=await this.client.query<{oldest:string|null;latest:string|null}>(
        `SELECT min(stream_sequence)::text AS oldest,max(stream_sequence)::text AS latest
           FROM education_realtime_events
          WHERE tenant_id=$1 AND organization_id=$2`,
        [tenantId,organizationId]
      );
      const oldest=bounds.rows[0]?.oldest?BigInt(bounds.rows[0].oldest):null;
      const latest=bounds.rows[0]?.latest?BigInt(bounds.rows[0].latest):null;
      if(oldest!==null&&afterSequence<oldest-1n){
        await this.client.query("COMMIT");
        return {state:"CURSOR_EXPIRED",events:[],oldestSequence:oldest,latestSequence:latest};
      }
      const rows=await this.client.query<{
        id:string;stream_sequence:string;event_type:SchoolRealtimeEvent["type"];
        occurred_at:string;entity_id:string;version:string;data:Record<string,unknown>;
      }>(
        `SELECT id,stream_sequence::text,event_type,occurred_at,entity_id,version::text,data
           FROM education_realtime_events
          WHERE tenant_id=$1 AND organization_id=$2 AND stream_sequence>$3
          ORDER BY stream_sequence ASC
          LIMIT $4`,
        [tenantId,organizationId,afterSequence.toString(),limit]
      );
      await this.client.query("COMMIT");
      return {
        state:"OK",oldestSequence:oldest,latestSequence:latest,
        events:rows.rows.map(row=>({
          id:row.id,tenantId,organizationId,type:row.event_type,
          occurredAt:new Date(row.occurred_at).toISOString(),streamSequence:row.stream_sequence,
          entityId:row.entity_id,version:Number(row.version),data:row.data
        }))
      };
    }catch(error){await this.client.query("ROLLBACK");throw error;}
  }

  async compact(tenantId:string,organizationId:string,olderThan:Date):Promise<number>{
    if (olderThan.getTime() > Date.now()) throw new Error("REALTIME_INVALID_RETENTION_CUTOFF");
    const result=await this.client.query(
      `DELETE FROM education_realtime_events
        WHERE tenant_id=$1 AND organization_id=$2 AND created_at<$3`,
      [tenantId,organizationId,olderThan.toISOString()]
    );
    return result.rowCount ?? 0;
  }
}
