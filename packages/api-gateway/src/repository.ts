import {createHash,randomUUID} from "node:crypto";
export type ApiAuthClass="anonymous"|"user"|"member"|"admin"|"service";
export type ApiOutcome="accepted"|"rejected"|"rate_limited"|"failed";
export interface ApiDb{query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}>;}
export type IdempotencyResult={status:"reserved"|"replay"|"conflict";requestId:string;responseHash?:string;responseBody?:string;statusCode?:number;state?:string};
const HEX64=/^[a-f0-9]{64}$/;
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
export function canonicalRequestHash(method:string,route:string,body:string):string{return sha(method.toUpperCase()+"\n"+route+"\n"+body);}
export function newCorrelationId():string{return randomUUID();}
export class ApiGatewayRepository{
 constructor(private readonly db:ApiDb){}
 async reserveIdempotency(input:{organizationId?:string;key:string;requestHash:string;route:string;expiresAt:string}):Promise<boolean>{ return (await this.reserveOrReplay(input)).status==="reserved"; }
 async reserveOrReplay(input:{organizationId?:string;key:string;requestHash:string;route:string;expiresAt:string}):Promise<IdempotencyResult>{
  if(!input.key||input.key.length>200||!HEX64.test(input.requestHash)) throw new Error("API_IDEMPOTENCY_INVALID");
  const id=randomUUID();
  const r=await this.db.query("INSERT INTO api_request_deduplication(id,organization_id,idempotency_key,request_hash,route,state,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'reserved',now(),$6::timestamptz) ON CONFLICT DO NOTHING RETURNING id",[id,input.organizationId??null,input.key,input.requestHash,input.route,input.expiresAt]);
  if(r.rows.length===1)return {status:"reserved",requestId:id};
  const existing=await this.db.query("SELECT id,request_hash,route,state,response_hash,response_body,status_code FROM api_request_deduplication WHERE organization_id IS NOT DISTINCT FROM $1 AND idempotency_key=$2",[input.organizationId??null,input.key]);
  const row=existing.rows[0];
  if(!row)throw new Error("API_IDEMPOTENCY_RACE_UNRESOLVED");
  if(row.request_hash!==input.requestHash||row.route!==input.route)return {status:"conflict",requestId:String(row.id),state:String(row.state)};
  const replay:IdempotencyResult={status:"replay",requestId:String(row.id),state:String(row.state)};
  if(row.response_hash!=null) replay.responseHash=String(row.response_hash);
  if(row.response_body!=null) replay.responseBody=String(row.response_body);
  if(row.status_code!=null) replay.statusCode=Number(row.status_code);
  return replay;
 }
 async completeIdempotency(input:{requestId:string;state:"succeeded"|"failed";responseHash?:string;responseBody?:string;statusCode:number}):Promise<void>{
  if(!HEX64.test(input.responseHash??""))throw new Error("API_RESPONSE_HASH_INVALID");
  const responseBody=input.responseBody??"";
  if(responseBody.length>262144) throw new Error("API_RESPONSE_BODY_TOO_LARGE");
  await this.db.query("UPDATE api_request_deduplication SET state=$2,response_hash=$3,response_body=$4,status_code=$5 WHERE id=$1",[input.requestId,input.state,input.responseHash, responseBody, input.statusCode]);
 }
 async audit(input:{organizationId?:string;requestId:string;route:string;actorId?:string;authClass:ApiAuthClass;outcome:ApiOutcome;correlationId:string;metadata:string}):Promise<void>{
  const metadataHash=sha(input.metadata);
  await this.db.query("INSERT INTO api_request_audit(id,organization_id,request_id,route,actor_id,auth_class,outcome,correlation_id,occurred_at,metadata_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)",[randomUUID(),input.organizationId??null,input.requestId,input.route,input.actorId??null,input.authClass,input.outcome,input.correlationId,metadataHash]);
 }
}