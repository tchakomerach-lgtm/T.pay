import {createHash,randomUUID} from "node:crypto";
import type {RateDb} from "./rate-abuse.js";
import type {ApiChannel} from "./rate-policy.js";

export type ApiOutcome="success"|"client_error"|"server_error"|"limited"|"blocked"|"degraded";

export interface ApiRuntimeEvent{
  organizationId?:string;
  correlationId:string;
  route:string;
  method:string;
  apiVersion:string;
  channel:ApiChannel;
  statusCode:number;
  outcome:ApiOutcome;
  errorCode?:string;
  durationMs:number;
  dependency?:string;
  occurredAt:string;
  evidence?:string;
}

const hashEvidence=(value:string)=>createHash("sha256").update(value).digest("hex");

export class ApiObservabilityRepository{
  constructor(private readonly db:RateDb){}
  async record(event:ApiRuntimeEvent):Promise<void>{
    if(event.correlationId.length<8||event.correlationId.length>200)throw new Error("OBS_CORRELATION_INVALID");
    if(!/^v[0-9]+$/.test(event.apiVersion))throw new Error("OBS_VERSION_INVALID");
    if(!Number.isInteger(event.statusCode)||event.statusCode<100||event.statusCode>599)throw new Error("OBS_STATUS_INVALID");
    if(!Number.isInteger(event.durationMs)||event.durationMs<0||event.durationMs>300000)throw new Error("OBS_DURATION_INVALID");
    const evidenceHash=hashEvidence(event.evidence??`${event.correlationId}|${event.route}|${event.statusCode}|${event.occurredAt}`);
    await this.db.query(
      `INSERT INTO api_runtime_events
       (id,organization_id,correlation_id,route,method,api_version,channel,status_code,outcome,error_code,duration_ms,dependency,evidence_hash,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz)`,
      [randomUUID(),event.organizationId??null,event.correlationId,event.route,event.method.toUpperCase(),event.apiVersion,event.channel,event.statusCode,event.outcome,event.errorCode??null,event.durationMs,event.dependency??null,evidenceHash,event.occurredAt]
    );
  }
  async pruneBefore(before:string):Promise<number>{
    const result=await this.db.query("DELETE FROM api_runtime_events WHERE occurred_at < $1::timestamptz RETURNING id",[before]);
    return result.rows.length;
  }
}
