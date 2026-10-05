import {createHash,randomUUID} from "node:crypto";
export type ApiAuthClass="anonymous"|"user"|"member"|"admin"|"service";
export type ApiOutcome="accepted"|"rejected"|"rate_limited"|"failed";
export interface ApiDb{query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}>;}
const HEX64=/^[a-f0-9]{64}$/;
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
export function canonicalRequestHash(method:string,route:string,body:string):string{return sha(method.toUpperCase()+"\n"+route+"\n"+body);}
export function newCorrelationId():string{return randomUUID();}
export class ApiGatewayRepository{
 constructor(private readonly db:ApiDb){}
 async reserveIdempotency(input:{organizationId?:string;key:string;requestHash:string;route:string;expiresAt:string}):Promise<boolean>{
  if(!input.key||input.key.length>200||!HEX64.test(input.requestHash)) throw new Error("API_IDEMPOTENCY_INVALID");
  const r=await this.db.query("INSERT INTO api_request_deduplication(id,organization_id,idempotency_key,request_hash,route,state,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'reserved',now(),$6::timestamptz) ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING id",[randomUUID(),input.organizationId??null,input.key,input.requestHash,input.route,input.expiresAt]);
  return r.rows.length===1;
 }
 async audit(input:{organizationId?:string;requestId:string;route:string;actorId?:string;authClass:ApiAuthClass;outcome:ApiOutcome;correlationId:string;metadata:string}):Promise<void>{
  const metadataHash=sha(input.metadata);
  await this.db.query("INSERT INTO api_request_audit(id,organization_id,request_id,route,actor_id,auth_class,outcome,correlation_id,occurred_at,metadata_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)",[randomUUID(),input.organizationId??null,input.requestId,input.route,input.actorId??null,input.authClass,input.outcome,input.correlationId,metadataHash]);
 }
}