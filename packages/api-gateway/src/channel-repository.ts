import {randomUUID} from "node:crypto";
import type {RateDb} from "./rate-abuse.js";
import type {CanonicalChannelIngress} from "./channel-ingress.js";

export type IngressState="accepted"|"replay"|"conflict"|"quarantined";
export interface IngressRecordResult{state:IngressState;id:string;}

export class ChannelIngressRepository{
  constructor(private readonly db:RateDb){}
  async record(input:CanonicalChannelIngress,organizationId?:string):Promise<IngressRecordResult>{
    const inserted=await this.db.query(
      `INSERT INTO api_channel_ingress_events
       (id,organization_id,channel,scope_hash,idempotency_key,sequence_no,payload_hash,state,correlation_id,received_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,'accepted',$8,$9::timestamptz)
       ON CONFLICT(channel,scope_hash,idempotency_key) DO NOTHING
       RETURNING id`,
      [randomUUID(),organizationId??null,input.channel,input.scopeHash,input.idempotencyKey,input.sequenceNo??null,input.payloadHash,input.correlationId,new Date().toISOString()]
    );
    if(ingested(inserted))return {state:"accepted",id:String(inserted.rows[0].id)};
    const existing=await this.db.query(
      `SELECT id,payload_hash,state FROM api_channel_ingress_events
       WHERE channel=$1 AND scope_hash=$2 AND idempotency_key=$3`,
      [input.channel,input.scopeHash,input.idempotencyKey]
    );
    const row=existing.rows[0];
    if(!row)throw new Error("CHANNEL_INGRESS_REPLAY_LOOKUP_FAILED");
    if(String(row.payload_hash)!==input.payloadHash){
      await this.db.query("UPDATE api_channel_ingress_events SET state='conflict' WHERE id=$1",[row.id]);
      return {state:"conflict",id:String(row.id)};
    }
    return {state:"replay",id:String(row.id)};
  }
}
function ingested(result:{rows:Record<string,unknown>[]}):boolean{return result.rows.length===1;}
