import type { Client } from "pg";
import type { SyncEvent, SyncState } from "./sync-fabric.js";
import { computeSyncPayloadHash, serializeSyncPayload, validateEventEnvelope } from "./sync-fabric.js";
import { createHash } from "node:crypto";

export type DurableSyncResult = {
  state: SyncState;
  eventId: string;
  acceptedSequence: bigint;
  drainedPending: number;
};

export class PostgresEducationSyncStore {
  constructor(private readonly client: Client) {}

  async accept(event: SyncEvent): Promise<DurableSyncResult> {
    validateEventEnvelope(event);
    if (!verifyPayload(event.payload, event.payloadHash)) throw new Error("SYNC_PAYLOAD_HASH_MISMATCH");

    await this.client.query("BEGIN");
    try {
      await this.client.query(
        `INSERT INTO education_sync_device_cursors
           (tenant_id,organization_id,device_id,last_accepted_sequence)
         VALUES ($1,$2,$3,0)
         ON CONFLICT DO NOTHING`,
        [event.tenantId,event.organizationId,event.deviceId]
      );
      const cursor=await this.client.query<{last_accepted_sequence:string}>(
        `SELECT last_accepted_sequence::text
           FROM education_sync_device_cursors
          WHERE tenant_id=$1 AND organization_id=$2 AND device_id=$3
          FOR UPDATE`,
        [event.tenantId,event.organizationId,event.deviceId]
      );
      const last=BigInt(cursor.rows[0]!.last_accepted_sequence);

      const existingEvent = await this.client.query<{event_id:string;payload_hash:string;state:SyncState}>(
        `SELECT event_id,payload_hash,state
           FROM education_sync_inbox
          WHERE tenant_id=$1 AND organization_id=$2
            AND (event_id=$3 OR idempotency_key=$4)
          FOR UPDATE`,
        [event.tenantId,event.organizationId,event.eventId,event.idempotencyKey]
      );
      if (existingEvent.rowCount) {
        const row=existingEvent.rows[0]!;
        if (row.payload_hash !== event.payloadHash) {
          await this.client.query("ROLLBACK");
          throw new Error("SYNC_REPLAY_PAYLOAD_COLLISION");
        }
        await this.client.query("COMMIT");
        return {state:"DUPLICATE",eventId:row.event_id,acceptedSequence:event.sequence,drainedPending:0};
      }

      if (event.sequence <= last) {
           (tenant_id,organization_id,device_id,last_accepted_sequence)
         VALUES ($1,$2,$3,0)
         ON CONFLICT DO NOTHING`,
        [event.tenantId,event.organizationId,event.deviceId]
      );
      const cursor=await this.client.query<{last_accepted_sequence:string}>(
        `SELECT last_accepted_sequence::text
           FROM education_sync_device_cursors
          WHERE tenant_id=$1 AND organization_id=$2 AND device_id=$3
          FOR UPDATE`,
        [event.tenantId,event.organizationId,event.deviceId]
      );
      const last=BigInt(cursor.rows[0]!.last_accepted_sequence);

      if (event.sequence <= last) {
        await this.client.query("ROLLBACK");
        return {state:"REJECTED",eventId:event.eventId,acceptedSequence:last,drainedPending:0};
      }

      if (event.sequence > last + 1n) {
        const existingSequence=await this.client.query<{event_id:string;payload_hash:string}>(
          `SELECT event_id,payload_hash
             FROM education_sync_inbox
            WHERE tenant_id=$1 AND organization_id=$2 AND device_id=$3 AND sequence=$4
            FOR UPDATE`,
          [event.tenantId,event.organizationId,event.deviceId,event.sequence]
        );
        if (existingSequence.rowCount) {
          const row=existingSequence.rows[0]!;
          if (row.payload_hash !== event.payloadHash) {
            await this.client.query("ROLLBACK");
            throw new Error("SYNC_SEQUENCE_PAYLOAD_COLLISION");
          }
          await this.client.query("COMMIT");
          return {state:"DUPLICATE",eventId:row.event_id,acceptedSequence:last,drainedPending:0};
        }
        await this.client.query(
          `INSERT INTO education_sync_inbox
           (id,tenant_id,organization_id,event_id,device_id,actor_id,sequence,occurred_at,event_type,priority,payload,payload_hash,idempotency_key,schema_version,state)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,'PENDING')`,
          [event.tenantId,event.organizationId,event.eventId,event.deviceId,event.actorId,event.sequence,event.occurredAt,event.eventType,event.priority,serializeSyncPayload(event.payload),event.payloadHash,event.idempotencyKey,event.schemaVersion]
        );
        await this.client.query("COMMIT");
        return {state:"PENDING",eventId:event.eventId,acceptedSequence:last,drainedPending:0};
      }

      const inserted = await this.insertAccepted(event);
      if(!inserted){
        const existing=await this.client.query<{event_id:string;payload_hash:string}>(
          `SELECT event_id,payload_hash FROM education_sync_inbox
            WHERE tenant_id=$1 AND organization_id=$2 AND (event_id=$3 OR idempotency_key=$4)
            FOR UPDATE`,
          [event.tenantId,event.organizationId,event.eventId,event.idempotencyKey]
        );
        const row=existing.rows[0];
        if(!row) throw new Error("SYNC_IDEMPOTENCY_STATE_UNKNOWN");
        if(row.payload_hash!==event.payloadHash) throw new Error("SYNC_REPLAY_PAYLOAD_COLLISION");
        await this.client.query("COMMIT");
        return {state:"DUPLICATE",eventId:row.event_id,acceptedSequence:event.sequence,drainedPending:0};
      }
      let accepted=event.sequence;
      let drained=0;
      while (true) {
        const next=await this.client.query<{
          id:string;event_id:string;sequence:string;occurred_at:string;event_type:string;payload:unknown;payload_hash:string;
        }>(
          `SELECT id,event_id,sequence::text,occurred_at,event_type,payload,payload_hash
             FROM education_sync_inbox
            WHERE tenant_id=$1 AND organization_id=$2 AND device_id=$3
              AND state='PENDING' AND sequence=$4
            FOR UPDATE`,
          [event.tenantId,event.organizationId,event.deviceId,accepted+1n]
        );
        const row=next.rows[0];
        if(!row) break;
        await this.client.query(
          `UPDATE education_sync_inbox SET state='ACCEPTED',accepted_at=now()
            WHERE id=$1 AND state='PENDING'`,
          [row.id]
        );
        await this.client.query(
          `INSERT INTO education_sync_outbox
            (id,tenant_id,organization_id,event_id,event_type,payload,payload_hash,occurred_at)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5::jsonb,$6,$7)
           ON CONFLICT (tenant_id,organization_id,event_id) DO NOTHING`,
          [event.tenantId,event.organizationId,row.event_id,row.event_type,JSON.stringify(row.payload),row.payload_hash,row.occurred_at]
        );
        await this.insertRealtime(row.event_id, event.tenantId, event.organizationId, row.event_type, row.occurred_at, row.payload, BigInt(row.sequence));
        accepted=BigInt(row.sequence);
        drained++;
      }
      await this.client.query(
        `UPDATE education_sync_device_cursors
            SET last_accepted_sequence=$4,updated_at=now()
          WHERE tenant_id=$1 AND organization_id=$2 AND device_id=$3`,
        [event.tenantId,event.organizationId,event.deviceId,accepted]
      );
      await this.client.query("COMMIT");
      return {state:"ACCEPTED",eventId:event.eventId,acceptedSequence:accepted,drainedPending:drained};
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  private async insertAccepted(event: SyncEvent): Promise<boolean> {
    const inserted=await this.client.query(
      `INSERT INTO education_sync_inbox
       (id,tenant_id,organization_id,event_id,device_id,actor_id,sequence,occurred_at,event_type,priority,payload,payload_hash,idempotency_key,schema_version,state,accepted_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,'ACCEPTED',now())`,
      [event.tenantId,event.organizationId,event.eventId,event.deviceId,event.actorId,event.sequence,event.occurredAt,event.eventType,event.priority,serializeSyncPayload(event.payload),event.payloadHash,event.idempotencyKey,event.schemaVersion]
    );
    await this.client.query(
      `INSERT INTO education_sync_outbox
       (id,tenant_id,organization_id,event_id,event_type,payload,payload_hash,occurred_at)
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [event.tenantId,event.organizationId,event.eventId,event.eventType,serializeSyncPayload(event.payload),event.payloadHash,event.occurredAt]
    );
    await this.insertRealtime(event.eventId,event.tenantId,event.organizationId,event.eventType,event.occurredAt,event.payload,event.sequence);
    return true;
  }

  private async insertRealtime(eventId:string,tenantId:string,organizationId:string,eventType:string,occurredAt:string,payload:unknown,version:bigint):Promise<void>{
    const data = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload : {payload};
    const payloadHash=createHash("sha256").update(serializeSyncPayload(data),"utf8").digest("hex");
    const type = eventType==="attendance" ? "attendance.changed"
      : eventType==="work_item" ? "work_item.changed"
      : eventType==="service_request" ? "service_request.changed"
      : "sync.accepted";
    await this.client.query(
      `INSERT INTO education_realtime_stream_cursors(tenant_id,organization_id,last_sequence)
       VALUES($1,$2,0) ON CONFLICT(tenant_id,organization_id) DO NOTHING`,
      [tenantId,organizationId]
    );
    const cursor=await this.client.query<{last_sequence:string}>(
      `SELECT last_sequence::text FROM education_realtime_stream_cursors
        WHERE tenant_id=$1 AND organization_id=$2 FOR UPDATE`,
      [tenantId,organizationId]
    );
    const next=BigInt(cursor.rows[0]!.last_sequence)+1n;
    const inserted=await this.client.query(
      `INSERT INTO education_realtime_events
       (id,tenant_id,organization_id,stream_sequence,event_type,occurred_at,entity_id,version,data,payload_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       ON CONFLICT (tenant_id,organization_id,id) DO NOTHING`,
      [eventId,tenantId,organizationId,next.toString(),type,occurredAt,eventId,version.toString(),JSON.stringify(data),payloadHash]
    );
    if((inserted.rowCount??0)>0){
      await this.client.query(
        `UPDATE education_realtime_stream_cursors SET last_sequence=$3,updated_at=now()
         WHERE tenant_id=$1 AND organization_id=$2`,
        [tenantId,organizationId,next.toString()]
      );
    }
  }
}

function verifyPayload(payload: unknown, expectedHash: string): boolean {
  return computeSyncPayloadHash(payload).toLowerCase() === expectedHash.toLowerCase();
}
